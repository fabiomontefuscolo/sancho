export interface NativePort {
  postMessage(message: unknown): void;
  onMessage: { addListener(listener: (message: unknown) => void): void };
  disconnect(): void;
}

export interface AcpHostOptions {
  hostName: string;
  token?: string;
}

interface HandshakeOk {
  type: "handshake.ok";
}
interface HandshakeError {
  type: "handshake.error";
  message?: string;
}

function isHandshakeResponse(value: unknown): value is HandshakeOk | HandshakeError {
  if (typeof value !== "object" || value === null) return false;
  const type = (value as { type?: unknown }).type;
  return type === "handshake.ok" || type === "handshake.error";
}

export function connectAcpHost(
  port: NativePort,
  options: AcpHostOptions,
  timeoutMs = 10_000,
): Promise<NativePort> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      port.disconnect();
      reject(new Error("handshake timeout"));
    }, timeoutMs);

    port.onMessage.addListener(function onHandshake(message: unknown) {
      if (!isHandshakeResponse(message)) return;
      clearTimeout(timer);
      if (message.type === "handshake.ok") {
        resolve(port);
      } else {
        port.disconnect();
        reject(new Error(message.message ?? "handshake rejected"));
      }
    });

    const handshake: Record<string, unknown> = { type: "handshake" };
    if (options.token !== undefined) handshake.token = options.token;
    port.postMessage(handshake);
  });
}

export function openNativePort(hostName: string): NativePort {
  return chrome.runtime.connectNative(hostName);
}
