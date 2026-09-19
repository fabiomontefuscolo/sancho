import { beforeEach, describe, expect, it, vi } from "vitest";
import { installMockChrome } from "./helpers/mock-chrome";
import {
  getProviderConfig,
  listActions,
  onActionsChanged,
  saveActions,
  saveProviderConfig,
} from "../../src/storage/settings";
import {
  clearAgentSession,
  clearConversation,
  getAgentSession,
  getApiKey,
  getConversation,
  newAgentSession,
  saveAgentSession,
  saveApiKey,
  saveConversation,
} from "../../src/storage/local";
import type { Action, ProviderConfig } from "../../src/types";

const config: ProviderConfig = {
  method: "api",
  providerId: "openai",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4o-mini",
  apiKeyRef: "openai",
};

const action: Action = {
  id: "a1",
  name: "Fix grammar",
  prompt: "Fix grammar: {{selection}}",
  builtin: true,
  enabled: true,
};

describe("settings storage (sync)", () => {
  beforeEach(() => installMockChrome());

  it("round-trips provider config", async () => {
    expect(await getProviderConfig()).toBeNull();
    await saveProviderConfig(config);
    expect(await getProviderConfig()).toEqual(config);
  });

  it("round-trips actions", async () => {
    expect(await listActions()).toEqual([]);
    await saveActions([action]);
    expect(await listActions()).toEqual([action]);
  });

  it("notifies on action changes and unsubscribes", async () => {
    const seen: Action[][] = [];
    const unsubscribe = onActionsChanged((actions) => seen.push(actions));
    await saveActions([action]);
    unsubscribe();
    await saveActions([]);
    expect(seen).toEqual([[action]]);
  });
});

describe("local storage", () => {
  beforeEach(() => installMockChrome());

  it("keeps api keys in the local area only", async () => {
    const { stores } = installMockChrome();
    await saveApiKey("openai", "sk-secret");
    expect(await getApiKey("openai")).toBe("sk-secret");
    expect(Object.keys(stores.sync)).toHaveLength(0);
  });

  it("returns an empty global conversation by default and clears consent on clear", async () => {
    const conversation = await getConversation();
    expect(conversation.id).toBe("global");
    expect(conversation.screenshotConsent).toBe(false);

    await saveConversation({ ...conversation, screenshotConsent: true });
    expect((await getConversation()).screenshotConsent).toBe(true);

    const cleared = await clearConversation();
    expect(cleared.screenshotConsent).toBe(false);
    expect(cleared.messages).toEqual([]);
  });

  it("round-trips and clears agent session with default maxIterations 25", async () => {
    expect(await getAgentSession()).toBeNull();
    const session = newAgentSession("global");
    expect(session.maxIterations).toBe(25);
    await saveAgentSession(session);
    expect(await getAgentSession()).toEqual(session);
    await clearAgentSession();
    expect(await getAgentSession()).toBeNull();
  });

  it("touches updatedAt when saving a conversation", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const conversation = await getConversation();
    vi.setSystemTime(2000);
    await saveConversation(conversation);
    expect((await getConversation()).updatedAt).toBe(2000);
    vi.useRealTimers();
  });
});
