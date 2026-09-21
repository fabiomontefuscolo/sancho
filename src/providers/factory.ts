import { getApiKey } from "../storage/local";
import { getProviderConfig } from "../storage/settings";
import {
  COPILOT_BASE_URL,
  COPILOT_CHAT_HEADERS,
  CopilotNotConnectedError,
  getCopilotToken,
} from "../auth/copilot";
import { AcpProvider } from "./acp";
import type { BaseLLMProvider } from "./base";
import { OpenAICompatibleProvider } from "./openai-compatible";

export class ProviderNotConfiguredError extends Error {
  constructor(
    message = "no provider configured — open the settings page to connect an API key or a local agent",
  ) {
    super(message);
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

let cachedAcp: { key: string; provider: AcpProvider } | null = null;

export function resetCachedAcpProvider(): void {
  cachedAcp?.provider.dispose();
  cachedAcp = null;
}

export async function createProvider(): Promise<BaseLLMProvider> {
  const config = await getProviderConfig();
  if (!config) throw new ProviderNotConfiguredError();

  if (config.method === "acp") {
    if (!config.acp?.hostName) {
      throw new ProviderNotConfiguredError();
    }
    const key = `${config.acp.hostName}:${config.acp.token ?? ""}`;
    if (cachedAcp?.key !== key) {
      cachedAcp?.provider.dispose();
      const acp: { hostName: string; token?: string } = { hostName: config.acp.hostName };
      if (config.acp.token !== undefined) acp.token = config.acp.token;
      cachedAcp = { key, provider: new AcpProvider(acp) };
    }
    return cachedAcp.provider;
  }

  resetCachedAcpProvider();

  if (config.method === "copilot") {
    if (!config.model) throw new ProviderNotConfiguredError();
    let sessionToken: string;
    try {
      sessionToken = await getCopilotToken();
    } catch (error) {
      if (error instanceof CopilotNotConnectedError) {
        throw new ProviderNotConfiguredError(
          "GitHub not connected — open Settings and connect with GitHub first",
        );
      }
      throw error;
    }
    return new OpenAICompatibleProvider({
      providerId: config.providerId,
      baseUrl: config.baseUrl || COPILOT_BASE_URL,
      model: config.model,
      apiKey: sessionToken,
      headers: COPILOT_CHAT_HEADERS,
    });
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
