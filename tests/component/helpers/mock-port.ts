import { vi } from "vitest";

export interface MockPort {
  sent: unknown[];
  emit(message: unknown): void;
  postMessage(message: unknown): void;
  onMessage: { addListener(listener: (message: unknown) => void): void };
  onDisconnect: { addListener(listener: () => void): void };
  disconnect(): void;
  name: string;
}

export function installMockPort(): MockPort {
  const listeners: Array<(message: unknown) => void> = [];
  const port: MockPort = {
    name: "sancho-ui",
    sent: [],
    postMessage(message: unknown) {
      this.sent.push(message);
    },
    onMessage: {
      addListener(listener: (message: unknown) => void) {
        listeners.push(listener);
      },
    },
    onDisconnect: { addListener: () => {} },
    disconnect: () => {},
    emit(message: unknown) {
      listeners.forEach((listener) => listener(message));
    },
  };

  vi.stubGlobal("chrome", {
    runtime: {
      connect: vi.fn(() => port),
    },
  });
  return port;
}
