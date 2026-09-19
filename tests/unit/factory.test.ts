import { beforeEach, describe, expect, it } from "vitest";
import { installMockChrome } from "./helpers/mock-chrome";
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
