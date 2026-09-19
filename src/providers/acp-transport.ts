export interface NativePort {
  postMessage(message: unknown): void;
  onMessage: { addListener(listener: (message: unknown) => void): void };
  onDisconnect: { addListener(listener: () => void): void };
  disconnect(): void;
}

export interface AcpHostOptions {
  hostName: string;
  token?: string;
}

export interface McpServerSpec {
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
}

interface HandshakeOk {
  type: "handshake.ok";
  mcpServer?: McpServerSpec;
}
interface HandshakeError {
  type: "handshake.error";
  message?: string;
}

export interface AcpHostConnection {
  port: NativePort;
  mcpServer: McpServerSpec | null;
}

function isHandshakeResponse(value: unknown): value is HandshakeOk | HandshakeError {
  if (typeof value !== "object" || value === null) return false;
  const type = (value as { type?: unknown }).type;
  return type === "handshake.ok" || type === "handshake.error";
}

function parseMcpServer(value: unknown): McpServerSpec | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.name !== "string" ||
    typeof candidate.command !== "string" ||
    !Array.isArray(candidate.args)
  ) {
    return null;
  }
  const env: Record<string, string> = {};
  if (typeof candidate.env === "object" && candidate.env !== null) {
    for (const [key, val] of Object.entries(candidate.env)) {
      if (typeof val === "string") env[key] = val;
    }
  }
  return {
    name: candidate.name,
    command: candidate.command,
    args: candidate.args.filter((arg): arg is string => typeof arg === "string"),
    env,
  };
}

export function connectAcpHost(
  port: NativePort,
  options: AcpHostOptions,
  timeoutMs = 10_000,
): Promise<AcpHostConnection> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      port.disconnect();
      reject(new Error("handshake timeout"));
    }, timeoutMs);

    port.onMessage.addListener(function onHandshake(message: unknown) {
      if (!isHandshakeResponse(message)) return;
      clearTimeout(timer);
      if (message.type === "handshake.ok") {
        resolve({ port, mcpServer: parseMcpServer(message.mcpServer ?? null) });
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
