export interface NetworkRequestRecord {
  url: string;
  method: string;
  status: number | null;
  error: string | null;
  startTime: number;
  durationMs: number;
}

export interface NetworkDiagnosticsResult {
  ok: true;
  requests: NetworkRequestRecord[];
  truncated: boolean;
}

const MAX_NETWORK_ENTRIES = 100;
const MAX_URL_CHARS = 300;
const FLUSH_EVENT_THRESHOLD = 25;
const FLUSH_INTERVAL_MS = 2000;

const pending = new Map<number, NetworkRequestRecord[]>();
const startTimes = new Map<string, number>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function sessionKey(tabId: number): string {
  return `diagNet:${tabId}`;
}

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushNetworkDiagnostics();
  }, FLUSH_INTERVAL_MS);
}

function append(tabId: number, record: NetworkRequestRecord): void {
  const list = pending.get(tabId) ?? [];
  list.push(record);
  pending.set(tabId, list);
  if (list.length >= FLUSH_EVENT_THRESHOLD) {
    void flushNetworkDiagnostics();
  } else {
    scheduleFlush();
  }
}

export function recordRequestStart(details: {
  tabId: number;
  requestId: string;
  timeStamp: number;
}): void {
  if (details.tabId < 0) return;
  startTimes.set(details.requestId, details.timeStamp);
  if (startTimes.size > 1000) {
    const oldest = startTimes.keys().next().value;
    if (oldest !== undefined) startTimes.delete(oldest);
  }
}

export function recordRequestCompleted(details: {
  tabId: number;
  requestId: string;
  url: string;
  method: string;
  statusCode: number;
  timeStamp: number;
}): void {
  if (details.tabId < 0) return;
  const startTime = startTimes.get(details.requestId) ?? details.timeStamp;
  startTimes.delete(details.requestId);
  append(details.tabId, {
    url: details.url.slice(0, MAX_URL_CHARS),
    method: details.method,
    status: details.statusCode,
    error: null,
    startTime,
    durationMs: Math.max(0, Math.round(details.timeStamp - startTime)),
  });
}

export function recordRequestError(details: {
  tabId: number;
  requestId: string;
  url: string;
  method: string;
  error: string;
  timeStamp: number;
}): void {
  if (details.tabId < 0) return;
  const startTime = startTimes.get(details.requestId) ?? details.timeStamp;
  startTimes.delete(details.requestId);
  append(details.tabId, {
    url: details.url.slice(0, MAX_URL_CHARS),
    method: details.method,
    status: null,
    error: details.error,
    startTime,
    durationMs: Math.max(0, Math.round(details.timeStamp - startTime)),
  });
}

interface StoredNetworkBuffer {
  records: NetworkRequestRecord[];
  overflowed: boolean;
}

export async function flushNetworkDiagnostics(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  for (const [tabId, records] of pending) {
    const key = sessionKey(tabId);
    const stored = await chrome.storage.session.get(key);
    const buffer = (stored[key] as StoredNetworkBuffer | undefined) ?? {
      records: [],
      overflowed: false,
    };
    const merged = [...buffer.records, ...records];
    const trimmed = merged.slice(-MAX_NETWORK_ENTRIES);
    await chrome.storage.session.set({
      [key]: { records: trimmed, overflowed: buffer.overflowed || trimmed.length < merged.length },
    });
  }
  pending.clear();
}

export async function resetTabDiagnostics(tabId: number): Promise<void> {
  pending.delete(tabId);
  await chrome.storage.session.remove(sessionKey(tabId));
}

export async function getNetworkRequests(
  tabId: number,
  limit: number,
): Promise<NetworkDiagnosticsResult> {
  await flushNetworkDiagnostics();
  const stored = await chrome.storage.session.get(sessionKey(tabId));
  const buffer = (stored[sessionKey(tabId)] as StoredNetworkBuffer | undefined) ?? {
    records: [],
    overflowed: false,
  };
  const recent = [...buffer.records].reverse();
  return {
    ok: true,
    requests: recent.slice(0, limit),
    truncated: buffer.overflowed || recent.length > limit,
  };
}
