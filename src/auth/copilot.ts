export interface CopilotAuth {
  githubToken: string;
  copilotToken?: string;
  copilotTokenExpiresAt?: number;
}

export interface DeviceFlowStart {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  interval: number;
  expiresIn: number;
}

export class CopilotNotConnectedError extends Error {
  constructor() {
    super("GitHub not connected — open Settings and connect with GitHub first");
    this.name = "CopilotNotConnectedError";
  }
}

export class CopilotTokenRejectedError extends Error {
  constructor() {
    super("GitHub token rejected (revoked or no Copilot subscription) — reconnect in Settings");
    this.name = "CopilotTokenRejectedError";
  }
}

export const COPILOT_CLIENT_ID = "Iv1.b507a08c87ecfe98";
export const COPILOT_SCOPE = "read:user";
export const COPILOT_BASE_URL = "https://api.githubcopilot.com";
export const COPILOT_VERSION = "0.26.7";
export const VSCODE_VERSION = "1.99.0";
export const GITHUB_API_VERSION = "2025-04-01";

const DEVICE_CODE_URL = "https://github.com/login/device/code";
const ACCESS_TOKEN_URL = "https://github.com/login/oauth/access_token";
const COPILOT_TOKEN_URL = "https://api.github.com/copilot_internal/v2/token";
const AUTH_KEY = "copilotAuth";
const EXPIRY_MARGIN_SECONDS = 60;

const EDITOR_HEADERS: Record<string, string> = {
  "editor-version": `vscode/${VSCODE_VERSION}`,
  "editor-plugin-version": `copilot-chat/${COPILOT_VERSION}`,
  "user-agent": `GitHubCopilotChat/${COPILOT_VERSION}`,
  "x-github-api-version": GITHUB_API_VERSION,
};

export const COPILOT_CHAT_HEADERS: Record<string, string> = {
  ...EDITOR_HEADERS,
  "copilot-integration-id": "vscode-chat",
  "openai-intent": "conversation-panel",
};

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
type SleepLike = (seconds: number) => Promise<void>;

const defaultSleep: SleepLike = (seconds) =>
  new Promise((resolve) => setTimeout(resolve, seconds * 1000));

export async function loadCopilotAuth(): Promise<CopilotAuth | null> {
  const result = await chrome.storage.local.get(AUTH_KEY);
  return (result[AUTH_KEY] as CopilotAuth | undefined) ?? null;
}

export async function saveCopilotAuth(auth: CopilotAuth): Promise<void> {
  await chrome.storage.local.set({ [AUTH_KEY]: auth });
}

export async function clearCopilotAuth(): Promise<void> {
  await chrome.storage.local.remove(AUTH_KEY);
}

async function postJson(fetchImpl: FetchLike, url: string, body: Record<string, string>) {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`GitHub auth request failed (${response.status})`);
  return (await response.json()) as Record<string, unknown>;
}

export async function startDeviceFlow(fetchImpl: FetchLike = fetch): Promise<DeviceFlowStart> {
  const data = await postJson(fetchImpl, DEVICE_CODE_URL, {
    client_id: COPILOT_CLIENT_ID,
    scope: COPILOT_SCOPE,
  });
  return {
    deviceCode: String(data.device_code ?? ""),
    userCode: String(data.user_code ?? ""),
    verificationUri: String(data.verification_uri ?? "https://github.com/login/device"),
    interval: Number(data.interval ?? 5),
    expiresIn: Number(data.expires_in ?? 900),
  };
}

export async function pollForDeviceToken(
  flow: DeviceFlowStart,
  options: {
    fetchImpl?: FetchLike;
    sleep?: SleepLike;
    signal?: AbortSignal;
  } = {},
): Promise<string> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const deadline = Date.now() + flow.expiresIn * 1000;
  let interval = flow.interval;

  for (;;) {
    if (options.signal?.aborted) throw new Error("authorization aborted");
    if (Date.now() >= deadline) throw new Error("authorization code expired — start again");
    await sleep(interval);

    const data = await postJson(fetchImpl, ACCESS_TOKEN_URL, {
      client_id: COPILOT_CLIENT_ID,
      device_code: flow.deviceCode,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    });

    if (typeof data.access_token === "string" && data.access_token) {
      return data.access_token;
    }
    switch (data.error) {
      case "authorization_pending":
        break;
      case "slow_down":
        interval += 5;
        break;
      case "access_denied":
        throw new Error("authorization denied on GitHub");
      case "expired_token":
        throw new Error("authorization code expired — start again");
      default:
        throw new Error(`authorization failed: ${String(data.error ?? "unknown error")}`);
    }
  }
}

let inflightToken: Promise<string> | null = null;

export function getCopilotToken(fetchImpl: FetchLike = fetch): Promise<string> {
  inflightToken ??= resolveCopilotToken(fetchImpl).finally(() => {
    inflightToken = null;
  });
  return inflightToken;
}

async function resolveCopilotToken(fetchImpl: FetchLike): Promise<string> {
  const auth = await loadCopilotAuth();
  if (!auth) throw new CopilotNotConnectedError();

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (
    auth.copilotToken &&
    auth.copilotTokenExpiresAt !== undefined &&
    auth.copilotTokenExpiresAt - EXPIRY_MARGIN_SECONDS > nowSeconds
  ) {
    return auth.copilotToken;
  }

  return exchangeCopilotToken(auth.githubToken, fetchImpl);
}

async function exchangeCopilotToken(githubToken: string, fetchImpl: FetchLike): Promise<string> {
  const response = await fetchImpl(COPILOT_TOKEN_URL, {
    headers: { ...EDITOR_HEADERS, authorization: `token ${githubToken}` },
  });
  if (response.status === 401 || response.status === 403) {
    throw new CopilotTokenRejectedError();
  }
  if (!response.ok) throw new Error(`Copilot token exchange failed (${response.status})`);
  const data = (await response.json()) as { token?: string; expires_at?: number };
  if (!data.token) throw new Error("Copilot token exchange returned no token");

  const auth: CopilotAuth = { githubToken, copilotToken: data.token };
  if (data.expires_at !== undefined) auth.copilotTokenExpiresAt = data.expires_at;
  await saveCopilotAuth(auth);
  return data.token;
}

export async function listCopilotModels(fetchImpl: FetchLike = fetch): Promise<string[]> {
  const token = await getCopilotToken(fetchImpl);
  const response = await fetchImpl(`${COPILOT_BASE_URL}/models`, {
    headers: { ...COPILOT_CHAT_HEADERS, authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`Copilot models request failed (${response.status})`);
  const data = (await response.json()) as {
    data?: {
      id?: string;
      capabilities?: { type?: string };
      supported_endpoints?: string[];
    }[];
  };
  return (data.data ?? [])
    .filter((entry) => (entry.capabilities?.type ? entry.capabilities.type === "chat" : true))
    .filter((entry) =>
      entry.supported_endpoints ? entry.supported_endpoints.includes("/chat/completions") : true,
    )
    .map((entry) => entry.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
}
