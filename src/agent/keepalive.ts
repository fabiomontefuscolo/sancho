import { logEvent } from "./log";

const KEEPALIVE_INTERVAL_MS = 20_000;
export const KEEPALIVE_GRACE_MS = 15 * 60_000;

export function startKeepAlive(): () => void {
  const interval = setInterval(() => {
    void chrome.runtime.getPlatformInfo();
  }, KEEPALIVE_INTERVAL_MS);
  return () => clearInterval(interval);
}

let persistentInterval: ReturnType<typeof setInterval> | null = null;
let graceTimer: ReturnType<typeof setTimeout> | null = null;

export function startPersistentKeepAlive(): void {
  if (!persistentInterval) {
    persistentInterval = setInterval(() => {
      void chrome.runtime.getPlatformInfo();
    }, KEEPALIVE_INTERVAL_MS);
    logEvent("persistent keep-alive started");
  }
  touchKeepAlive();
}

export function touchKeepAlive(): void {
  if (!persistentInterval) return;
  if (graceTimer) clearTimeout(graceTimer);
  graceTimer = setTimeout(() => {
    stopPersistentKeepAlive();
  }, KEEPALIVE_GRACE_MS);
}

export function stopPersistentKeepAlive(): void {
  if (graceTimer) {
    clearTimeout(graceTimer);
    graceTimer = null;
  }
  if (persistentInterval) {
    clearInterval(persistentInterval);
    persistentInterval = null;
    logEvent("persistent keep-alive stopped");
  }
}

export function isPersistentKeepAliveRunning(): boolean {
  return persistentInterval !== null;
}
