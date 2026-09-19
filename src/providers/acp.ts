import { ClientSideConnection, ndJsonStream, PROTOCOL_VERSION } from "@agentclientprotocol/sdk";
import {
  BaseLLMProvider,
  type ProviderMessage,
  type StreamEvents,
  type ToolDefinition,
} from "./base";
import {
  connectAcpHost,
  openNativePort,
  type AcpHostOptions,
  type NativePort,
} from "./acp-transport";

interface PortStreams {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
}

function portToStreams(port: NativePort): PortStreams {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;

  const readable = new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller;
    },
  });

  port.onMessage.addListener((message: unknown) => {
    if (typeof message !== "string") return;
    controllerRef?.enqueue(encoder.encode(message + "\n"));
  });

  const writable = new WritableStream<Uint8Array>({
    write(chunk) {
      port.postMessage(decoder.decode(chunk));
    },
  });

  return { readable, writable };
}

export class AcpProvider extends BaseLLMProvider {
  readonly id = "acp";
  private readonly options: AcpHostOptions;
  private connection: ClientSideConnection | null = null;
  private sessionId: string | null = null;

  constructor(options: AcpHostOptions) {
    super();
    this.options = options;
  }

  private onSessionText: ((text: string) => void) | null = null;

  private async ensureConnection(): Promise<ClientSideConnection> {
    if (this.connection) return this.connection;
    const port = openNativePort(this.options.hostName);
    await connectAcpHost(port, this.options);
    const { readable, writable } = portToStreams(port);
    const stream = ndJsonStream(writable, readable);
    this.connection = new ClientSideConnection(
      () => ({
        readTextFile: async () => ({ content: "" }),
        writeTextFile: async () => ({}),
        requestPermission: async () => ({ outcome: { outcome: "cancelled" } }),
        sessionUpdate: async (params) => {
          const update = params.update;
          if (update.sessionUpdate === "agent_message_chunk" && update.content.type === "text") {
            this.onSessionText?.(update.content.text);
          }
        },
      }),
      stream,
    );
    await this.connection.initialize({
      protocolVersion: PROTOCOL_VERSION,
      clientCapabilities: { fs: { readTextFile: false, writeTextFile: false } },
    });
    return this.connection;
  }

  async streamChat(
    messages: ProviderMessage[],
    _tools: ToolDefinition[],
    events: StreamEvents,
    signal?: AbortSignal,
  ): Promise<void> {
    try {
      const connection = await this.ensureConnection();
      if (!this.sessionId) {
        const session = await connection.newSession({ cwd: "/", mcpServers: [] });
        this.sessionId = session.sessionId;
      }
      const sessionId = this.sessionId;
      this.onSessionText = (text) => events.onDelta(text);

      const last = messages[messages.length - 1];
      if (!last) {
        events.onDone();
        return;
      }

      const abort = () => {
        void connection.cancel({ sessionId });
      };
      signal?.addEventListener("abort", abort, { once: true });

      try {
        await connection.prompt({
          sessionId,
          prompt: [{ type: "text", text: last.content }],
        });
      } finally {
        signal?.removeEventListener("abort", abort);
      }
      events.onDone();
    } catch (error) {
      this.connection = null;
      this.sessionId = null;
      events.onError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async cancelSession(): Promise<void> {
    if (this.connection && this.sessionId) {
      await this.connection.cancel({ sessionId: this.sessionId });
    }
  }

  resetSession(): void {
    this.sessionId = null;
  }
}
