import {
  UI_PORT_NAME,
  onPortEnvelope,
  type AnyEnvelope,
  type UiToBackground,
} from "../src/bridge/messages";
import {
  handleChatCancel,
  handleChatClear,
  handleChatRegenerate,
  handleChatSend,
  handleConversationGet,
  handleConversationsDelete,
  handleConversationsList,
  handleConversationsNew,
  handleConversationsSelect,
  handlePermissionResponse,
  handleScreenshotConsent,
  handleDiagnosticsConsent,
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
import { makeCopilotAuthHandlers } from "../src/agent/copilot-auth-handler";
import { logEvent } from "../src/agent/log";
import {
  startPersistentKeepAlive,
  stopPersistentKeepAlive,
  touchKeepAlive,
} from "../src/agent/keepalive";
import { getProviderConfig } from "../src/storage/settings";
import {
  recordRequestCompleted,
  recordRequestError,
  recordRequestStart,
  resetTabDiagnostics,
} from "../src/agent/diagnostics";

type UiHandler = (envelope: UiToBackground, port: chrome.runtime.Port) => Promise<void>;

interface CmEditResult {
  ok: boolean;
  error?: string;
}

function applyCodeMirrorText(
  marker: string,
  text: string,
  mode: "replace" | "insert",
): CmEditResult {
  const element = document.querySelector(`[data-sancho-cm="${marker}"]`);
  if (!element) return { ok: false, error: "CodeMirror target not found in page" };
  const holder = (element as { cmView?: { view?: unknown } }).cmView;
  const view = (holder?.view ?? holder) as
    | {
        state?: { doc: { length: number }; selection: { main: { head: number } } };
        dispatch?: (transaction: {
          changes: { from: number; to: number; insert: string };
          userEvent: string;
          scrollIntoView: boolean;
        }) => void;
      }
    | undefined;
  if (!view || typeof view.dispatch !== "function" || !view.state) {
    return { ok: false, error: "CodeMirror view unavailable on target element" };
  }
  const head = mode === "insert" ? view.state.selection.main.head : 0;
  const from = mode === "insert" ? head : 0;
  const to = mode === "insert" ? head : view.state.doc.length;
  view.dispatch({
    changes: { from, to, insert: text },
    userEvent: "input.type",
    scrollIntoView: true,
  });
  return { ok: true };
}

const handlers = new Map<UiToBackground["type"], UiHandler>();

export function registerHandler(type: UiToBackground["type"], handler: UiHandler): void {
  handlers.set(type, handler);
}

async function applyKeepAliveForConfig(): Promise<void> {
  const config = await getProviderConfig();
  if (config?.method === "acp") {
    startPersistentKeepAlive();
  } else {
    stopPersistentKeepAlive();
  }
}

async function dispatch(envelope: UiToBackground, port: chrome.runtime.Port): Promise<void> {
  touchKeepAlive();
  const handler = handlers.get(envelope.type);
  if (!handler) {
    console.warn(`no handler for message type ${envelope.type}`);
    return;
  }
  await handler(envelope, port);
}

const SEQUENTIAL_OPS = new Set([
  "conversation.get",
  "conversations.list",
  "conversations.select",
  "conversations.new",
  "conversations.delete",
  "chat.send",
  "chat.regenerate",
  "screenshot.consent",
  "diagnostics.consent",
]);

export function handlePortConnection(port: chrome.runtime.Port): void {
  if (port.name !== UI_PORT_NAME) return;
  logEvent("ui port connected");
  port.onDisconnect.addListener(() => logEvent("ui port disconnected"));
  let queue: Promise<void> = Promise.resolve();
  onPortEnvelope(port, (envelope: AnyEnvelope) => {
    if (envelope.kind !== "request") return;
    const request = envelope as UiToBackground;
    if (SEQUENTIAL_OPS.has(request.type)) {
      queue = queue
        .then(() => dispatch(request, port))
        .catch((error: unknown) => {
          console.error("handler failed", request.type, error);
        });
    } else {
      void dispatch(request, port).catch((error: unknown) => {
        console.error("handler failed", request.type, error);
      });
    }
  });
}

export default defineBackground(() => {
  logEvent("background started");
  void applyKeepAliveForConfig();
  chrome.storage.sync.onChanged.addListener((changes) => {
    if ("providerConfig" in changes) void applyKeepAliveForConfig();
  });
  registerHandler("chat.send", async (envelope, port) => {
    if (envelope.type !== "chat.send") return;
    await handleChatSend(envelope.payload, port);
  });
  registerHandler("chat.cancel", async (_envelope, port) => handleChatCancel(port));
  registerHandler("chat.regenerate", async (_envelope, port) => handleChatRegenerate(port));
  registerHandler("chat.clear", async (_envelope, port) => handleChatClear(port));
  registerHandler("conversation.get", async (envelope, port) => {
    if (envelope.type !== "conversation.get") return;
    await handleConversationGet(envelope.payload, port);
  });
  registerHandler("conversations.list", async (_envelope, port) => handleConversationsList(port));
  registerHandler("conversations.select", async (envelope, port) => {
    if (envelope.type !== "conversations.select") return;
    await handleConversationsSelect(envelope.payload, port);
  });
  registerHandler("conversations.new", async (_envelope, port) => handleConversationsNew(port));
  registerHandler("conversations.delete", async (envelope, port) => {
    if (envelope.type !== "conversations.delete") return;
    await handleConversationsDelete(envelope.payload, port);
  });
  registerHandler("screenshot.consent", async (envelope, port) => {
    if (envelope.type !== "screenshot.consent") return;
    await handleScreenshotConsent(envelope.payload, port);
  });
  registerHandler("diagnostics.consent", async (envelope, port) => {
    if (envelope.type !== "diagnostics.consent") return;
    await handleDiagnosticsConsent(envelope.payload, port);
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
  registerHandler("permission.response", async (envelope) => {
    if (envelope.type !== "permission.response") return;
    handlePermissionResponse(envelope.payload);
  });
  const copilotAuth = makeCopilotAuthHandlers();
  registerHandler("copilot.auth.start", async (_envelope, port) => copilotAuth.handleStart(port));
  registerHandler("copilot.auth.status", async (_envelope, port) => copilotAuth.handleStatus(port));
  registerHandler("copilot.auth.disconnect", async (_envelope, port) =>
    copilotAuth.handleDisconnect(port),
  );
  registerHandler("copilot.models.list", async (_envelope, port) => copilotAuth.handleModels(port));
  chrome.runtime.onConnect.addListener((port) => {
    handlePortConnection(port);
    setActiveUiPort(port);
    port.onDisconnect.addListener(() => setActiveUiPort(null));
  });
  chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    if (
      typeof message !== "object" ||
      message === null ||
      (message as { type?: unknown }).type !== "sancho:cmSetText"
    ) {
      return false;
    }
    const tabId = sender.tab?.id;
    if (tabId === undefined) {
      sendResponse({ ok: false, error: "no tab for CodeMirror edit" });
      return false;
    }
    const { marker, text, mode } = message as { marker: string; text: string; mode: string };
    void chrome.scripting
      .executeScript({
        target: { tabId },
        world: "MAIN",
        func: applyCodeMirrorText,
        args: [marker, text, mode === "insert" ? "insert" : "replace"],
      })
      .then(
        (results) => {
          const first = results[0];
          sendResponse(
            first && "result" in first && first.result
              ? first.result
              : { ok: false, error: "CodeMirror edit produced no result" },
          );
        },
        (error: unknown) =>
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          }),
      );
    return true;
  });
  chrome.runtime.onInstalled.addListener(() => {
    void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    void seedBuiltinActions().then(rebuildContextMenus);
    void registerDiagnosticsProbe();
  });
  chrome.runtime.onStartup.addListener(() => {
    void rebuildContextMenus();
    void registerDiagnosticsProbe();
  });
  void seedBuiltinActions().then(rebuildContextMenus);
  void registerDiagnosticsProbe();
  watchActionChanges();
  registerContextMenuClickListener();
  registerDiagnosticsListeners();
});

function registerDiagnosticsListeners(): void {
  chrome.webRequest.onBeforeRequest.addListener(recordRequestStart, { urls: ["<all_urls>"] });
  chrome.webRequest.onCompleted.addListener(recordRequestCompleted, { urls: ["<all_urls>"] });
  chrome.webRequest.onErrorOccurred.addListener(recordRequestError, { urls: ["<all_urls>"] });
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === "loading" && changeInfo.url) {
      void resetTabDiagnostics(tabId);
    }
  });
  chrome.tabs.onRemoved.addListener((tabId) => {
    void resetTabDiagnostics(tabId);
  });
}

async function registerDiagnosticsProbe(): Promise<void> {
  try {
    await chrome.scripting.unregisterContentScripts({ ids: ["sancho-diag-probe"] });
  } catch {
    // not registered yet
  }
  try {
    await chrome.scripting.registerContentScripts([
      {
        id: "sancho-diag-probe",
        js: ["diag-probe.js"],
        matches: ["<all_urls>"],
        runAt: "document_start",
        world: "MAIN",
        allFrames: false,
      },
    ]);
  } catch (error) {
    logEvent("diagnostics probe registration failed", {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
