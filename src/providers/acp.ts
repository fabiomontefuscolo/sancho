import { ClientSideConnection, ndJsonStream, PROTOCOL_VERSION } from "@agentclientprotocol/sdk";
import { systemClockMessage } from "../agent/time";
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
  type McpServerSpec,
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

export interface ToolInvokeRequest {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export type ToolInvokeHandler = (request: ToolInvokeRequest) => Promise<unknown>;

function isToolInvoke(value: unknown): value is ToolInvokeRequest & { type: "tool.invoke" } {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.type === "tool.invoke" &&
    typeof candidate.id === "string" &&
    typeof candidate.name === "string"
  );
}

export class AcpProvider extends BaseLLMProvider {
  readonly id = "acp";
  private readonly options: AcpHostOptions;
  private connection: ClientSideConnection | null = null;
  private sessionId: string | null = null;
  private port: NativePort | null = null;
  private mcpServer: McpServerSpec | null = null;
  private toolInvokeHandler: ToolInvokeHandler | null = null;

  constructor(options: AcpHostOptions) {
    super();
    this.options = options;
  }

  setToolInvokeHandler(handler: ToolInvokeHandler | null): void {
    this.toolInvokeHandler = handler;
  }

  private onSessionText: ((text: string) => void) | null = null;

  private async ensureConnection(): Promise<ClientSideConnection> {
    if (this.connection) return this.connection;
    const port = openNativePort(this.options.hostName);
    const { mcpServer } = await connectAcpHost(port, this.options);
    this.port = port;
    this.mcpServer = mcpServer;

    port.onMessage.addListener((message: unknown) => {
      if (!isToolInvoke(message) || !this.toolInvokeHandler) return;
      const handler = this.toolInvokeHandler;
      void handler(message)
        .then((result) => {
          port.postMessage({ type: "tool.result", id: message.id, result });
        })
        .catch((error: unknown) => {
          port.postMessage({
            type: "tool.result",
            id: message.id,
            result: { ok: false, error: error instanceof Error ? error.message : String(error) },
          });
        });
    });

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
        const mcpServers = this.mcpServer
          ? [
              {
                name: this.mcpServer.name,
                command: this.mcpServer.command,
                args: this.mcpServer.args,
                env: Object.entries(this.mcpServer.env).map(([name, value]) => ({
                  name,
                  value,
                })),
              },
            ]
          : [];
        const session = await connection.newSession({ cwd: "/", mcpServers });
        this.sessionId = session.sessionId;
      }
      const sessionId = this.sessionId;
      this.onSessionText = (text) => events.onDelta(text);
      const clock = systemClockMessage().content;
      const preamble =
        `[${clock}] You are running inside a browser extension. ` +
        (this.mcpServer
          ? `Use the "${this.mcpServer.name}" MCP tools (read_page, fill_field, click_element, select_option, capture_screenshot) to read and interact with the user's active browser tab.`
          : "Browser tools are unavailable in this session.");

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
          prompt: [{ type: "text", text: `${preamble}\n\n${last.content}` }],
        });
      } finally {
        signal?.removeEventListener("abort", abort);
      }
      events.onDone();
    } catch (error) {
      this.connection = null;
      this.sessionId = null;
      this.port = null;
      this.mcpServer = null;
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
