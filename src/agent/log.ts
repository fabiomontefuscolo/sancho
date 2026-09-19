export function logEvent(event: string, details?: Record<string, unknown>): void {
  if (details) {
    console.info("[sancho]", event, details);
  } else {
    console.info("[sancho]", event);
  }
}
