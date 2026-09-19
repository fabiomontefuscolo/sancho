import {
  UI_PORT_NAME,
  onPortEnvelope,
  type AnyEnvelope,
  type UiToBackground,
} from "../src/bridge/messages";
import {
  handleChatCancel,
  handleChatClear,
  handleChatSend,
  handleConversationGet,
  handleScreenshotConsent,
} from "../src/agent/chat-handler";
import { rebuildContextMenus, seedBuiltinActions, watchActionChanges } from "../src/agent/menus";
import {
  registerContextMenuClickListener,
  runActionById,
  setActiveUiPort,
} from "../src/agent/action-handler";
import {
  handleActionDelete,
  handleActionsList,
  handleActionUpsert,
  handleSettingsGet,
  handleSettingsSet,
} from "../src/agent/settings-handler";

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
  registerHandler("chat.cancel", async (_envelope, port) => handleChatCancel(port));
  registerHandler("chat.clear", async (_envelope, port) => handleChatClear(port));
  registerHandler("conversation.get", async (_envelope, port) => handleConversationGet(port));
  registerHandler("screenshot.consent", async (envelope, port) => {
    if (envelope.type !== "screenshot.consent") return;
    await handleScreenshotConsent(envelope.payload, port);
  });
  registerHandler("action.run", async (envelope, port) => {
    if (envelope.type !== "action.run") return;
    await runActionById(envelope.payload.actionId, envelope.payload.tabId, port);
  });
  registerHandler("actions.list", async (_envelope, port) => handleActionsList(port));
  registerHandler("actions.upsert", async (envelope, port) => {
    if (envelope.type !== "actions.upsert") return;
    await handleActionUpsert(envelope.payload.action, port);
  });
  registerHandler("actions.delete", async (envelope, port) => {
    if (envelope.type !== "actions.delete") return;
    await handleActionDelete(envelope.payload.actionId, port);
  });
  registerHandler("settings.get", async (_envelope, port) => handleSettingsGet(port));
  registerHandler("settings.set", async (envelope, port) => {
    if (envelope.type !== "settings.set") return;
    await handleSettingsSet(envelope.payload, port);
  });
  chrome.runtime.onConnect.addListener((port) => {
    handlePortConnection(port);
    setActiveUiPort(port);
    port.onDisconnect.addListener(() => setActiveUiPort(null));
  });
  chrome.runtime.onInstalled.addListener(() => {
    void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    void seedBuiltinActions().then(rebuildContextMenus);
  });
  chrome.runtime.onStartup.addListener(() => {
    void rebuildContextMenus();
  });
  void seedBuiltinActions().then(rebuildContextMenus);
  watchActionChanges();
  registerContextMenuClickListener();
});
