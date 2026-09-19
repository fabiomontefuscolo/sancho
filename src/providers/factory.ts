import { getApiKey } from "../storage/local";
import { getProviderConfig } from "../storage/settings";
import { AcpProvider } from "./acp";
import type { BaseLLMProvider } from "./base";
import { OpenAICompatibleProvider } from "./openai-compatible";

export class ProviderNotConfiguredError extends Error {
  constructor() {
    super("no provider configured — open the settings page to connect an API key or a local agent");
    this.name = "ProviderNotConfiguredError";
  }
}

export class ApiKeyMissingError extends Error {
  constructor(ref: string) {
    super(`API key missing for ${ref} — add it on the settings page`);
    this.name = "ApiKeyMissingError";
  }
}

export function isLoopbackUrl(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl);
    return url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1";
  } catch {
    return false;
  }
}

export function validateBaseUrl(baseUrl: string): void {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error(`invalid endpoint URL: ${baseUrl}`);
  }
  if (url.protocol !== "https:" && !isLoopbackUrl(baseUrl)) {
    throw new Error("endpoint must use https (http allowed only on loopback)");
  }
}

export async function createProvider(): Promise<BaseLLMProvider> {
  const config = await getProviderConfig();
  if (!config) throw new ProviderNotConfiguredError();

  if (config.method === "acp") {
    if (!config.acp?.hostName) {
      throw new ProviderNotConfiguredError();
    }
    const acp: { hostName: string; token?: string } = { hostName: config.acp.hostName };
    if (config.acp.token !== undefined) acp.token = config.acp.token;
    return new AcpProvider(acp);
  }

  if (!config.model) throw new ProviderNotConfiguredError();
  validateBaseUrl(config.baseUrl);
  const apiKey = await getApiKey(config.apiKeyRef);
  if (!apiKey) throw new ApiKeyMissingError(config.apiKeyRef);

  return new OpenAICompatibleProvider({
    providerId: config.providerId,
    baseUrl: config.baseUrl,
    model: config.model,
    apiKey,
  });
}
