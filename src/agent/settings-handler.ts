import { makeEnvelope, postToPort } from "../bridge/messages";
import { deleteAction, upsertAction } from "./action-crud";
import { getApiKey, saveApiKey } from "../storage/local";
import { getProviderConfig, listActions, saveProviderConfig } from "../storage/settings";
import { validateBaseUrl } from "../providers/factory";
import type { ProviderConfig } from "../types";

export async function handleActionsList(port: chrome.runtime.Port): Promise<void> {
  postToPort(port, makeEnvelope("event", "actions.state", await listActions()));
}

export async function handleActionUpsert(
  action: Parameters<typeof upsertAction>[0],
  port: chrome.runtime.Port,
): Promise<void> {
  const result = await upsertAction(action);
  if (!result.ok) {
    postToPort(
      port,
      makeEnvelope("event", "chat.error", { message: result.error ?? "invalid action" }),
    );
  }
  await handleActionsList(port);
}

export async function handleActionDelete(
  actionId: string,
  port: chrome.runtime.Port,
): Promise<void> {
  const result = await deleteAction(actionId);
  if (!result.ok) {
    postToPort(
      port,
      makeEnvelope("event", "chat.error", { message: result.error ?? "delete failed" }),
    );
  }
  await handleActionsList(port);
}

export async function handleSettingsGet(port: chrome.runtime.Port): Promise<void> {
  const config = await getProviderConfig();
  const hasApiKey = config ? (await getApiKey(config.apiKeyRef)) !== null : false;
  postToPort(port, makeEnvelope("event", "settings.state", { config, hasApiKey }));
}

export async function handleSettingsSet(
  payload: { config: ProviderConfig; apiKey?: string },
  port: chrome.runtime.Port,
): Promise<void> {
  try {
    if (payload.config.method === "api") {
      validateBaseUrl(payload.config.baseUrl);
      if (!payload.config.model.trim()) throw new Error("model is required");
    } else if (!payload.config.acp?.hostName.trim()) {
      throw new Error("native host name is required for the local agent");
    }
  } catch (error) {
    postToPort(
      port,
      makeEnvelope("event", "chat.error", {
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    return;
  }

  if (payload.apiKey !== undefined && payload.apiKey.length > 0) {
    await saveApiKey(payload.config.apiKeyRef, payload.apiKey);
  }
  await saveProviderConfig(payload.config);
  await handleSettingsGet(port);
}
