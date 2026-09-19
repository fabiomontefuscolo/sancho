import type { ProviderMessage } from "../providers/base";

export function formatTimestamp(epochMs: number, now: Date = new Date()): string {
  const date = new Date(epochMs);
  const time = date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) return `[${time}]`;
  const datePart = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return `[${datePart} ${time}]`;
}

export function systemClockMessage(tabTitle?: string, tabUrl?: string): ProviderMessage {
  const now = new Date();
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const offsetMinutes = -now.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const hours = Math.abs(Math.trunc(offsetMinutes / 60));
  const local = now.toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZoneName: "short",
  });
  let content = `Current local time: ${local} (UTC${sign}${hours}, ${zone}).`;
  if (tabTitle && tabUrl) content += ` Active tab: ${tabTitle} (${tabUrl}).`;
  return { role: "system", content };
}
