import {
  UI_PORT_NAME,
  onPortEnvelope,
  type AnyEnvelope,
  type UiToBackground,
} from "../src/bridge/messages";
import { handleChatSend } from "../src/agent/chat-handler";

type UiHandler = (envelope: UiToBackground, port: chrome.runtime.Port) => Promise<void>;

const handlers = new Map<UiToBackground["type"], UiHandler>();

export function registerHandler(type: UiToBackground["type"], handler: UiHandler): void {
  handlers.set(type, handler);
}

async function dispatch(envelope: UiToBackground, port: chrome.runtime.Port): Promise<void> {
  const handler = handlers.get(envelope.type);
  if (!handler) {
    console.warn(`no handler for message type ${envelope.type}`);
    return;
  }
  await handler(envelope, port);
}

export function handlePortConnection(port: chrome.runtime.Port): void {
  if (port.name !== UI_PORT_NAME) return;
  onPortEnvelope(port, (envelope: AnyEnvelope) => {
    if (envelope.kind !== "request") return;
    void dispatch(envelope as UiToBackground, port).catch((error: unknown) => {
      console.error("handler failed", envelope.type, error);
    });
  });
}

export default defineBackground(() => {
  registerHandler("chat.send", async (envelope, port) => {
    if (envelope.type !== "chat.send") return;
    await handleChatSend(envelope.payload, port);
  });
  chrome.runtime.onConnect.addListener(handlePortConnection);
});
