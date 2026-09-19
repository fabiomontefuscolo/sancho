import { makeEnvelope, postToPort } from "../bridge/messages";
import { createProvider } from "../providers/factory";
import { listActions } from "../storage/settings";
import { getActiveConversation, saveConversationRecord } from "../storage/conversations";
import { sendToContent } from "./inject";
import { menuIdForAction } from "./menus";
import { runSelectionAction } from "./actions";

export async function runActionById(
  actionId: string,
  tabId: number,
  port: chrome.runtime.Port | null,
): Promise<void> {
  const actions = await listActions();
  const action = actions.find((candidate) => candidate.id === actionId);
  if (!action) {
    if (port) {
      postToPort(port, makeEnvelope("event", "chat.error", { message: "unknown action" }));
    }
    return;
  }

  const provider = await createProvider();
  const outcome = await runSelectionAction(action, tabId, {
    provider,
    getSelection: (target) =>
      sendToContent(target, { type: "selection.get" }) as Promise<{
        text: string;
        editable: boolean;
      }>,
    replaceSelection: (target, replacement) =>
      sendToContent(target, { type: "selection.replace", replacement }) as Promise<{
        ok: boolean;
        error?: string;
      }>,
    appendToConversation: async (text) => {
      const conversation = await getActiveConversation();
      conversation.messages.push({
        id: crypto.randomUUID(),
        role: "assistant",
        parts: [{ type: "text", text }],
        tabId,
        createdAt: Date.now(),
      });
      await saveConversationRecord(conversation);
      if (port) {
        postToPort(port, makeEnvelope("event", "conversation.state", conversation));
      }
    },
  });

  if (!port) return;
  if (outcome.ok) {
    postToPort(
      port,
      makeEnvelope("event", "action.result", {
        actionId,
        ...(outcome.replacement !== undefined ? { replacement: outcome.replacement } : {}),
        ...(outcome.text !== undefined ? { text: outcome.text } : {}),
      }),
    );
  } else {
    postToPort(
      port,
      makeEnvelope("event", "chat.error", { message: outcome.error ?? "action failed" }),
    );
  }
}

let activePort: chrome.runtime.Port | null = null;

export function setActiveUiPort(port: chrome.runtime.Port | null): void {
  activePort = port;
}

export function registerContextMenuClickListener(): void {
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (!tab?.id) return;
    const menuId = String(info.menuItemId);
    if (!menuId.startsWith("sancho-action:")) return;
    const actionId = menuId.slice(menuIdForAction("").length);
    void runActionById(actionId, tab.id, activePort).catch((error: unknown) => {
      console.error("action failed", error);
    });
  });
}
