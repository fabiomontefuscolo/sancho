const KEEPALIVE_INTERVAL_MS = 20_000;

export function startKeepAlive(): () => void {
  const interval = setInterval(() => {
    void chrome.runtime.getPlatformInfo();
  }, KEEPALIVE_INTERVAL_MS);
  return () => clearInterval(interval);
}
