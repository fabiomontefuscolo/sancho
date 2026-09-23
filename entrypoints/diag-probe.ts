export interface ConsoleEntry {
  level: "log" | "info" | "warn" | "error" | "exception";
  text: string;
  timestamp: number;
}

const MAX_ENTRIES = 200;
const MAX_ENTRY_CHARS = 500;

export function createConsoleBuffer() {
  const entries: ConsoleEntry[] = [];

  const push = (level: ConsoleEntry["level"], text: string) => {
    entries.push({ level, text: text.slice(0, MAX_ENTRY_CHARS), timestamp: Date.now() });
    if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
  };

  return { entries, push };
}

export function formatConsoleArgs(args: unknown[]): string {
  return args
    .map((arg) => {
      if (typeof arg === "string") return arg;
      try {
        return JSON.stringify(arg) ?? String(arg);
      } catch {
        return String(arg);
      }
    })
    .join(" ");
}

export function installConsoleCapture(): void {
  const marker = "__sanchoDiagProbeLoaded";
  const globalScope = window as unknown as Record<string, unknown>;
  if (globalScope[marker]) return;
  globalScope[marker] = true;

  const buffer = createConsoleBuffer();

  for (const level of ["log", "info", "warn", "error"] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      buffer.push(level, formatConsoleArgs(args));
      original(...args);
    };
  }

  window.addEventListener("error", (event) => {
    buffer.push("exception", event.message || "uncaught error");
  });
  window.addEventListener("unhandledrejection", (event) => {
    buffer.push("exception", `unhandled rejection: ${formatConsoleArgs([event.reason])}`);
  });

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data as { source?: string; type?: string } | null;
    if (data?.source !== "sancho-diag" || data.type !== "console.read") return;
    window.postMessage({
      source: "sancho-diag-probe",
      type: "console.entries",
      entries: [...buffer.entries],
    });
  });
}

export default defineUnlistedScript(() => {
  installConsoleCapture();
});
