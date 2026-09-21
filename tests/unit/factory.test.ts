import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installMockChrome } from "./helpers/mock-chrome";
import { saveCopilotAuth } from "../../src/auth/copilot";
import {
  ApiKeyMissingError,
  createProvider,
  isLoopbackUrl,
  ProviderNotConfiguredError,
  validateBaseUrl,
} from "../../src/providers/factory";
import { AcpProvider } from "../../src/providers/acp";
import { OpenAICompatibleProvider } from "../../src/providers/openai-compatible";
import { saveProviderConfig } from "../../src/storage/settings";
import { saveApiKey } from "../../src/storage/local";

describe("validateBaseUrl", () => {
  it("accepts https and loopback http", () => {
    expect(() => validateBaseUrl("https://api.openai.com/v1")).not.toThrow();
    expect(() => validateBaseUrl("http://127.0.0.1:8080/v1")).not.toThrow();
    expect(() => validateBaseUrl("http://localhost:11434/v1")).not.toThrow();
  });

  it("rejects non-https remote endpoints and garbage", () => {
    expect(() => validateBaseUrl("http://example.com/v1")).toThrow(/https/);
    expect(() => validateBaseUrl("not a url")).toThrow(/invalid/);
  });

  it("detects loopback hosts", () => {
    expect(isLoopbackUrl("http://127.0.0.1:1")).toBe(true);
    expect(isLoopbackUrl("http://localhost")).toBe(true);
    expect(isLoopbackUrl("https://example.com")).toBe(false);
    expect(isLoopbackUrl("garbage")).toBe(false);
  });
});

describe("createProvider", () => {
  beforeEach(() => installMockChrome());

  it("throws when nothing is configured", async () => {
    await expect(createProvider()).rejects.toBeInstanceOf(ProviderNotConfiguredError);
  });

  it("creates an OpenAI-compatible provider when api method with key", async () => {
    await saveProviderConfig({
      method: "api",
      providerId: "openai",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o-mini",
      apiKeyRef: "openai",
    });
    await saveApiKey("openai", "sk-x");
    const provider = await createProvider();
    expect(provider).toBeInstanceOf(OpenAICompatibleProvider);
    expect(provider.id).toBe("openai");
  });

  it("throws ApiKeyMissingError when the key is absent", async () => {
    await saveProviderConfig({
      method: "api",
      providerId: "openai",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o-mini",
      apiKeyRef: "openai",
    });
    await expect(createProvider()).rejects.toBeInstanceOf(ApiKeyMissingError);
  });

  it("creates an ACP provider for the acp method", async () => {
    await saveProviderConfig({
      method: "acp",
      providerId: "acp",
      baseUrl: "",
      model: "",
      apiKeyRef: "acp",
      acp: { hostName: "sancho-host", token: "t" },
    });
    const provider = await createProvider();
    expect(provider).toBeInstanceOf(AcpProvider);
  });

  it("rejects acp without a host name", async () => {
    await saveProviderConfig({
      method: "acp",
      providerId: "acp",
      baseUrl: "",
      model: "",
      apiKeyRef: "acp",
    });
    await expect(createProvider()).rejects.toBeInstanceOf(ProviderNotConfiguredError);
  });
});

describe("createProvider copilot method", () => {
  beforeEach(() => installMockChrome());
  afterEach(() => vi.unstubAllGlobals());

  const copilotConfig = {
    method: "copilot" as const,
    providerId: "copilot",
    baseUrl: "https://api.githubcopilot.com",
    model: "gpt-4.1",
    apiKeyRef: "copilot",
  };

  it("builds an OpenAI-compatible provider from the cached session token", async () => {
    await saveProviderConfig(copilotConfig);
    await saveCopilotAuth({
      githubToken: "gho_abc",
      copilotToken: "ct_cached",
      copilotTokenExpiresAt: Math.floor(Date.now() / 1000) + 600,
    });
    const provider = await createProvider();
    expect(provider).toBeInstanceOf(OpenAICompatibleProvider);
    expect(provider.id).toBe("copilot");
  });

  it("throws ProviderNotConfiguredError when GitHub is not connected", async () => {
    await saveProviderConfig(copilotConfig);
    await expect(createProvider()).rejects.toBeInstanceOf(ProviderNotConfiguredError);
    await expect(createProvider()).rejects.toThrow(/connect with GitHub/);
  });

  it("refreshes an expiring session token before constructing the provider", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ token: "ct_new", expires_at: Math.floor(Date.now() / 1000) + 1800 }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchImpl);
    await saveProviderConfig(copilotConfig);
    await saveCopilotAuth({
      githubToken: "gho_abc",
      copilotToken: "ct_old",
      copilotTokenExpiresAt: Math.floor(Date.now() / 1000) + 5,
    });
    const provider = await createProvider();
    expect(provider).toBeInstanceOf(OpenAICompatibleProvider);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe("https://api.github.com/copilot_internal/v2/token");
  });

  it("requires a model", async () => {
    await saveProviderConfig({ ...copilotConfig, model: "" });
    await expect(createProvider()).rejects.toBeInstanceOf(ProviderNotConfiguredError);
  });
});
