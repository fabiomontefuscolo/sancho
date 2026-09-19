import { describe, expect, it } from "vitest";
import { formatTimestamp, systemClockMessage } from "../../src/agent/time";

describe("formatTimestamp", () => {
  const now = new Date("2026-09-19T14:32:05");

  it("uses [HH:MM] for same-day messages", () => {
    const sameDay = new Date("2026-09-19T09:15:00").getTime();
    expect(formatTimestamp(sameDay, now)).toMatch(/^\[\d{2}:\d{2}\]$/);
  });

  it("prefixes the date for older messages", () => {
    const older = new Date("2026-09-17T09:15:00").getTime();
    expect(formatTimestamp(older, now)).toMatch(/^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}\]$/);
  });
});

describe("systemClockMessage", () => {
  it("contains a parseable date, a timezone name, and UTC offset", () => {
    const message = systemClockMessage();
    expect(message.role).toBe("system");
    expect(message.content).toContain("Current local time:");
    expect(message.content).toMatch(/UTC[+-]\d+/);
    expect(message.content).toMatch(/[A-Za-z_]+\/[A-Za-z_]+/);
  });

  it("includes the active tab when provided", () => {
    const message = systemClockMessage("Example", "https://example.com");
    expect(message.content).toContain("Example");
    expect(message.content).toContain("https://example.com");
  });
});
