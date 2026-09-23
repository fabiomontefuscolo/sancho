import { beforeEach, describe, expect, it, vi } from "vitest";
import { installMockChrome } from "./helpers/mock-chrome";
import {
  getNetworkRequests,
  recordRequestCompleted,
  recordRequestError,
  recordRequestStart,
  resetTabDiagnostics,
  flushNetworkDiagnostics,
} from "../../src/agent/diagnostics";

function completed(tabId: number, requestId: string, url: string, statusCode: number, t: number) {
  recordRequestStart({ tabId, requestId, timeStamp: t - 100 });
  recordRequestCompleted({ tabId, requestId, url, method: "GET", statusCode, timeStamp: t });
}

describe("network diagnostics recorder", () => {
  beforeEach(() => installMockChrome());

  it("records completed requests with status and duration", async () => {
    completed(1, "r1", "https://a.example/api", 200, 5000);
    await flushNetworkDiagnostics();
    const result = await getNetworkRequests(1, 50);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.requests).toEqual([
      {
        url: "https://a.example/api",
        method: "GET",
        status: 200,
        error: null,
        startTime: 4900,
        durationMs: 100,
      },
    ]);
    expect(result.truncated).toBe(false);
  });

  it("records network-level failures with the error reason", async () => {
    recordRequestStart({ tabId: 1, requestId: "r2", timeStamp: 1000 });
    recordRequestError({
      tabId: 1,
      requestId: "r2",
      url: "https://b.example/x",
      method: "POST",
      error: "net::ERR_FAILED",
      timeStamp: 1500,
    });
    await flushNetworkDiagnostics();
    const result = await getNetworkRequests(1, 50);
    if (!result.ok) throw new Error("expected ok");
    expect(result.requests[0]).toMatchObject({
      url: "https://b.example/x",
      method: "POST",
      status: null,
      error: "net::ERR_FAILED",
      durationMs: 500,
    });
  });

  it("truncates URLs to 300 characters", async () => {
    const longUrl = `https://a.example/${"q".repeat(400)}`;
    completed(1, "r1", longUrl, 200, 5000);
    await flushNetworkDiagnostics();
    const result = await getNetworkRequests(1, 50);
    if (!result.ok) throw new Error("expected ok");
    expect(result.requests[0]?.url).toHaveLength(300);
  });

  it("keeps only the most recent 100 entries per tab", async () => {
    for (let i = 0; i < 120; i++) {
      completed(1, `r${i}`, `https://a.example/${i}`, 200, 1000 + i);
    }
    await flushNetworkDiagnostics();
    const result = await getNetworkRequests(1, 200);
    if (!result.ok) throw new Error("expected ok");
    expect(result.requests).toHaveLength(100);
    expect(result.requests[0]?.url).toBe("https://a.example/119");
    expect(result.truncated).toBe(true);
  });

  it("scopes buffers per tab and resets on navigation", async () => {
    completed(1, "r1", "https://a.example/1", 200, 1000);
    completed(2, "r2", "https://b.example/2", 404, 1000);
    await flushNetworkDiagnostics();

    const tab2 = await getNetworkRequests(2, 50);
    if (!tab2.ok) throw new Error("expected ok");
    expect(tab2.requests[0]?.url).toBe("https://b.example/2");

    await resetTabDiagnostics(1);
    const tab1 = await getNetworkRequests(1, 50);
    if (!tab1.ok) throw new Error("expected ok");
    expect(tab1.requests).toEqual([]);
  });

  it("applies the limit most-recent-first", async () => {
    for (let i = 0; i < 5; i++) {
      completed(1, `r${i}`, `https://a.example/${i}`, 200, 1000 + i);
    }
    await flushNetworkDiagnostics();
    const result = await getNetworkRequests(1, 2);
    if (!result.ok) throw new Error("expected ok");
    expect(result.requests.map((r) => r.url)).toEqual([
      "https://a.example/4",
      "https://a.example/3",
    ]);
    expect(result.truncated).toBe(true);
  });

  it("flushes pending events after the 2s timer", async () => {
    vi.useFakeTimers();
    completed(1, "r1", "https://a.example/timer", 200, 5000);
    await vi.advanceTimersByTimeAsync(2100);
    const result = await getNetworkRequests(1, 50);
    if (!result.ok) throw new Error("expected ok");
    expect(result.requests[0]?.url).toBe("https://a.example/timer");
    vi.useRealTimers();
  });

  it("flushes pending events after 25 buffered events", async () => {
    for (let i = 0; i < 25; i++) {
      recordRequestStart({ tabId: 1, requestId: `r${i}`, timeStamp: i });
      recordRequestCompleted({
        tabId: 1,
        requestId: `r${i}`,
        url: `https://a.example/${i}`,
        method: "GET",
        statusCode: 200,
        timeStamp: i + 1,
      });
    }
    const result = await getNetworkRequests(1, 50);
    if (!result.ok) throw new Error("expected ok");
    expect(result.requests.length).toBeGreaterThan(0);
  });
});
