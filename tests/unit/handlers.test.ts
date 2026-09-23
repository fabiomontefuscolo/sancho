import { beforeEach, describe, expect, it, vi } from "vitest";
import { installMockChrome } from "./helpers/mock-chrome";

vi.mock("../../src/providers/factory", async () => {
  const actual = await vi.importActual("../../src/providers/factory");
  return { ...actual };
});

import { handleSettingsGet, handleSettingsSet } from "../../src/agent/settings-handler";
import {
  handleChatClear,
  handleDiagnosticsConsent,
  handleScreenshotConsent,
} from "../../src/agent/chat-handler";
import { getActiveConversation } from "../../src/storage/conversations";
import { getProviderConfig } from "../../src/storage/settings";
import type { AnyEnvelope } from "../../src/bridge/messages";

function makePort() {
  const posted: AnyEnvelope[] = [];
  const port = {
    posted,
    postMessage: (message: unknown) => posted.push(message as AnyEnvelope),
  } as unknown as chrome.runtime.Port & { posted: AnyEnvelope[] };
  return port;
}

const validConfig = {
  method: "api" as const,
  providerId: "openai",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4o-mini",
  apiKeyRef: "openai",
};

describe("settings handlers", () => {
  beforeEach(() => installMockChrome());

  it("stores the api key in local storage and returns only the ref", async () => {
    installMockChrome();
    const port = makePort();
    await handleSettingsSet({ config: validConfig, apiKey: "sk-secret" }, port);

    const saved = await getProviderConfig();
    expect(saved).toEqual(validConfig);
    const state = port.posted.find((envelope) => envelope.type === "settings.state");
    expect(state).toMatchObject({ payload: { config: validConfig, hasApiKey: true } });
    expect(JSON.stringify(port.posted)).not.toContain("sk-secret");
  });

  it("rejects an invalid endpoint without saving", async () => {
    const port = makePort();
    await handleSettingsSet(
      { config: { ...validConfig, baseUrl: "http://remote.example.com" } },
      port,
    );
    expect(await getProviderConfig()).toBeNull();
    expect(port.posted.some((envelope) => envelope.type === "chat.error")).toBe(true);
  });

  it("rejects acp method without a host name", async () => {
    const port = makePort();
    await handleSettingsSet(
      {
        config: { method: "acp", providerId: "acp", baseUrl: "", model: "", apiKeyRef: "acp" },
      },
      port,
    );
    expect(port.posted.some((envelope) => envelope.type === "chat.error")).toBe(true);
  });

  it("reports hasApiKey=false when no key stored", async () => {
    const port = makePort();
    await handleSettingsGet(port);
    expect(port.posted[0]).toMatchObject({
      type: "settings.state",
      payload: { config: null, hasApiKey: false },
    });
  });
});

describe("conversation handlers", () => {
  beforeEach(() => installMockChrome());

  it("chat.clear resets conversation and consent", async () => {
    const conversation = await getActiveConversation();
    conversation.screenshotConsent = true;
    conversation.messages.push({
      id: "m1",
      role: "user",
      parts: [{ type: "text", text: "hi" }],
      tabId: 1,
      createdAt: 1,
    });
    const { saveConversationRecord } = await import("../../src/storage/conversations");
    await saveConversationRecord(conversation);

    const port = makePort();
    await handleChatClear(port);
    const cleared = await getActiveConversation();
    expect(cleared.messages).toEqual([]);
    expect(cleared.screenshotConsent).toBe(false);
  });

  it("screenshot.consent grants and persists consent", async () => {
    const port = makePort();
    await handleScreenshotConsent({ granted: true }, port);
    expect((await getActiveConversation()).screenshotConsent).toBe(true);
    expect(
      port.posted.some(
        (envelope) =>
          envelope.type === "conversation.state" && envelope.payload.screenshotConsent === true,
      ),
    ).toBe(true);
  });

  it("diagnostics.consent grants and persists consent", async () => {
    const port = makePort();
    await handleDiagnosticsConsent({ granted: true }, port);
    expect((await getActiveConversation()).diagnosticsConsent).toBe(true);
    expect(
      port.posted.some(
        (envelope) =>
          envelope.type === "conversation.state" && envelope.payload.diagnosticsConsent === true,
      ),
    ).toBe(true);
  });
});
