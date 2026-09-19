import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installMockChrome } from "./helpers/mock-chrome";
import { startKeepAlive } from "../../src/agent/keepalive";

describe("keepalive", () => {
  beforeEach(() => {
    installMockChrome();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it("pings the runtime periodically to reset the service worker idle timer", async () => {
    const stop = startKeepAlive();
    expect(chrome.runtime.getPlatformInfo).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(chrome.runtime.getPlatformInfo).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(40_000);
    expect(chrome.runtime.getPlatformInfo).toHaveBeenCalledTimes(3);
    stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(chrome.runtime.getPlatformInfo).toHaveBeenCalledTimes(3);
  });
});
