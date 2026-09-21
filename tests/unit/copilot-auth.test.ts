import { beforeEach, describe, expect, it, vi } from "vitest";
import { installMockChrome } from "./helpers/mock-chrome";
import {
  clearCopilotAuth,
  COPILOT_BASE_URL,
  COPILOT_CLIENT_ID,
  CopilotNotConnectedError,
  CopilotTokenRejectedError,
  getCopilotToken,
  listCopilotModels,
  loadCopilotAuth,
  pollForDeviceToken,
  saveCopilotAuth,
  startDeviceFlow,
  type DeviceFlowStart,
} from "../../src/auth/copilot";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const noSleep = () => Promise.resolve();

const FLOW: DeviceFlowStart = {
  deviceCode: "dc",
  userCode: "ABCD-EFGH",
  verificationUri: "https://github.com/login/device",
  interval: 5,
  expiresIn: 900,
};

describe("startDeviceFlow", () => {
  beforeEach(() => installMockChrome());

  it("posts client_id and scope and maps the response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        device_code: "dc",
        user_code: "ABCD-EFGH",
        verification_uri: "https://github.com/login/device",
        interval: 5,
        expires_in: 900,
      }),
    );
    const flow = await startDeviceFlow(fetchImpl);
    expect(flow.userCode).toBe("ABCD-EFGH");
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://github.com/login/device/code");
    expect(JSON.parse(String(init.body))).toEqual({
      client_id: COPILOT_CLIENT_ID,
      scope: "read:user",
    });
  });

  it("throws on a non-ok response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, 500));
    await expect(startDeviceFlow(fetchImpl)).rejects.toThrow(/500/);
  });
});

describe("pollForDeviceToken", () => {
  beforeEach(() => installMockChrome());

  it("keeps polling through authorization_pending until a token arrives", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: "authorization_pending" }))
      .mockResolvedValueOnce(jsonResponse({ error: "authorization_pending" }))
      .mockResolvedValueOnce(jsonResponse({ access_token: "gho_abc" }));
    const token = await pollForDeviceToken(FLOW, { fetchImpl, sleep: noSleep });
    expect(token).toBe("gho_abc");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body)).grant_type).toBe(
      "urn:ietf:params:oauth:grant-type:device_code",
    );
  });

  it("grows the interval on slow_down", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: "slow_down" }))
      .mockResolvedValueOnce(jsonResponse({ access_token: "gho_abc" }));
    const slept: number[] = [];
    const token = await pollForDeviceToken(FLOW, {
      fetchImpl,
      sleep: (s) => {
        slept.push(s);
        return Promise.resolve();
      },
    });
    expect(token).toBe("gho_abc");
    expect(slept).toEqual([5, 10]);
  });

  it("rejects on access_denied and expired_token", async () => {
    const denied = vi.fn().mockResolvedValue(jsonResponse({ error: "access_denied" }));
    await expect(pollForDeviceToken(FLOW, { fetchImpl: denied, sleep: noSleep })).rejects.toThrow(
      /denied/,
    );
    const expired = vi.fn().mockResolvedValue(jsonResponse({ error: "expired_token" }));
    await expect(pollForDeviceToken(FLOW, { fetchImpl: expired, sleep: noSleep })).rejects.toThrow(
      /expired/,
    );
  });

  it("rejects when aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      pollForDeviceToken(FLOW, { sleep: noSleep, signal: controller.signal }),
    ).rejects.toThrow(/aborted/);
  });
});

describe("getCopilotToken", () => {
  beforeEach(() => installMockChrome());

  it("throws CopilotNotConnectedError without stored auth", async () => {
    await expect(getCopilotToken(vi.fn())).rejects.toBeInstanceOf(CopilotNotConnectedError);
  });

  it("returns a fresh cached token without any fetch", async () => {
    await saveCopilotAuth({
      githubToken: "gho_abc",
      copilotToken: "ct_cached",
      copilotTokenExpiresAt: Math.floor(Date.now() / 1000) + 600,
    });
    const fetchImpl = vi.fn();
    await expect(getCopilotToken(fetchImpl)).resolves.toBe("ct_cached");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("exchanges when the cached token is expiring and persists the new one", async () => {
    await saveCopilotAuth({
      githubToken: "gho_abc",
      copilotToken: "ct_old",
      copilotTokenExpiresAt: Math.floor(Date.now() / 1000) + 10,
    });
    const expiresAt = Math.floor(Date.now() / 1000) + 1800;
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ token: "ct_new", expires_at: expiresAt }));
    await expect(getCopilotToken(fetchImpl)).resolves.toBe("ct_new");
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.github.com/copilot_internal/v2/token");
    expect((init.headers as Record<string, string>).authorization).toBe("token gho_abc");
    expect((init.headers as Record<string, string>)["copilot-integration-id"]).toBeUndefined();
    const stored = await loadCopilotAuth();
    expect(stored).toEqual({
      githubToken: "gho_abc",
      copilotToken: "ct_new",
      copilotTokenExpiresAt: expiresAt,
    });
  });

  it("dedupes concurrent exchanges into a single request", async () => {
    await saveCopilotAuth({ githubToken: "gho_abc" });
    let resolveExchange: (r: Response) => void = () => {};
    const fetchImpl = vi.fn().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveExchange = resolve;
        }),
    );
    const first = getCopilotToken(fetchImpl);
    const second = getCopilotToken(fetchImpl);
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    resolveExchange(
      jsonResponse({ token: "ct_new", expires_at: Math.floor(Date.now() / 1000) + 1800 }),
    );
    await expect(first).resolves.toBe("ct_new");
    await expect(second).resolves.toBe("ct_new");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("maps 401/403 on the exchange to CopilotTokenRejectedError", async () => {
    await saveCopilotAuth({ githubToken: "gho_revoked" });
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, 401));
    await expect(getCopilotToken(fetchImpl)).rejects.toBeInstanceOf(CopilotTokenRejectedError);
  });
});

describe("listCopilotModels", () => {
  beforeEach(() => installMockChrome());

  it("returns model ids from the models endpoint", async () => {
    await saveCopilotAuth({
      githubToken: "gho_abc",
      copilotToken: "ct_cached",
      copilotTokenExpiresAt: Math.floor(Date.now() / 1000) + 600,
    });
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [
          {
            id: "gpt-4.1",
            capabilities: { type: "chat" },
            supported_endpoints: ["/chat/completions"],
          },
          { id: "claude-sonnet-4", capabilities: { type: "chat" } },
          {
            id: "gpt-5.4-mini",
            capabilities: { type: "chat" },
            supported_endpoints: ["/responses"],
          },
          { id: "text-embedding-3", capabilities: { type: "embeddings" } },
          {},
        ],
      }),
    );
    await expect(listCopilotModels(fetchImpl)).resolves.toEqual(["gpt-4.1", "claude-sonnet-4"]);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${COPILOT_BASE_URL}/models`);
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer ct_cached");
    expect(headers["copilot-integration-id"]).toBe("vscode-chat");
  });

  it("throws when the models request fails", async () => {
    await saveCopilotAuth({
      githubToken: "gho_abc",
      copilotToken: "ct_cached",
      copilotTokenExpiresAt: Math.floor(Date.now() / 1000) + 600,
    });
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, 500));
    await expect(listCopilotModels(fetchImpl)).rejects.toThrow(/500/);
  });
});

describe("disconnect", () => {
  it("clearCopilotAuth wipes the stored auth", async () => {
    installMockChrome();
    await saveCopilotAuth({ githubToken: "gho_abc" });
    await clearCopilotAuth();
    expect(await loadCopilotAuth()).toBeNull();
  });
});
