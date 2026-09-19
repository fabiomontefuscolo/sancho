import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installMockChrome } from "./helpers/mock-chrome";
import {
  isPersistentKeepAliveRunning,
  KEEPALIVE_GRACE_MS,
  startPersistentKeepAlive,
  stopPersistentKeepAlive,
  touchKeepAlive,
} from "../../src/agent/keepalive";

describe("persistent keep-alive with grace", () => {
  beforeEach(() => {
    installMockChrome();
    vi.useFakeTimers();
    stopPersistentKeepAlive();
  });
  afterEach(() => {
    stopPersistentKeepAlive();
    vi.useRealTimers();
  });

  it("starts idempotently and pings the runtime", async () => {
    startPersistentKeepAlive();
    startPersistentKeepAlive();
    expect(isPersistentKeepAliveRunning()).toBe(true);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(chrome.runtime.getPlatformInfo).toHaveBeenCalledTimes(1);
  });

  it("stops after the grace period without activity", async () => {
    startPersistentKeepAlive();
    await vi.advanceTimersByTimeAsync(KEEPALIVE_GRACE_MS + 1000);
    expect(isPersistentKeepAliveRunning()).toBe(false);
  });

  it("activity resets the grace timer", async () => {
    startPersistentKeepAlive();
    await vi.advanceTimersByTimeAsync(KEEPALIVE_GRACE_MS - 60_000);
    touchKeepAlive();
    await vi.advanceTimersByTimeAsync(KEEPALIVE_GRACE_MS - 60_000);
    expect(isPersistentKeepAliveRunning()).toBe(true);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(isPersistentKeepAliveRunning()).toBe(false);
  });

  it("stops immediately when asked", () => {
    startPersistentKeepAlive();
    stopPersistentKeepAlive();
    expect(isPersistentKeepAliveRunning()).toBe(false);
  });
});
