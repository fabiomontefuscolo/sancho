import {
  clearCopilotAuth,
  listCopilotModels,
  loadCopilotAuth,
  pollForDeviceToken,
  saveCopilotAuth,
  startDeviceFlow,
} from "../auth/copilot";
import { makeEnvelope, postToPort, type CopilotAuthStatePayload } from "../bridge/messages";

interface PendingSession {
  abort: AbortController;
  userCode: string;
  verificationUri: string;
}

export interface CopilotAuthHandlerDeps {
  startFlow?: typeof startDeviceFlow;
  pollFlow?: typeof pollForDeviceToken;
  listModels?: typeof listCopilotModels;
}

export interface CopilotAuthHandlers {
  handleStart(port: chrome.runtime.Port): Promise<void>;
  handleStatus(port: chrome.runtime.Port): Promise<void>;
  handleDisconnect(port: chrome.runtime.Port): Promise<void>;
  handleModels(port: chrome.runtime.Port): Promise<void>;
}

function postAuthState(port: chrome.runtime.Port, payload: CopilotAuthStatePayload): void {
  postToPort(port, makeEnvelope("event", "copilot.auth.state", payload));
}

export function makeCopilotAuthHandlers(deps: CopilotAuthHandlerDeps = {}): CopilotAuthHandlers {
  const startFlow = deps.startFlow ?? startDeviceFlow;
  const pollFlow = deps.pollFlow ?? pollForDeviceToken;
  const listModels = deps.listModels ?? listCopilotModels;

  let pending: PendingSession | null = null;
  let lastError: string | null = null;

  return {
    async handleStart(port) {
      pending?.abort.abort();
      pending = null;
      lastError = null;
      let flow;
      try {
        flow = await startFlow();
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        postAuthState(port, { status: "error", message: lastError });
        return;
      }
      const abort = new AbortController();
      const onPortDisconnect = () => abort.abort();
      port.onDisconnect.addListener(onPortDisconnect);
      pending = { abort, userCode: flow.userCode, verificationUri: flow.verificationUri };
      postAuthState(port, {
        status: "pending",
        userCode: flow.userCode,
        verificationUri: flow.verificationUri,
      });
      try {
        const githubToken = await pollFlow(flow, { signal: abort.signal });
        await saveCopilotAuth({ githubToken });
        pending = null;
        postAuthState(port, { status: "connected" });
      } catch (error) {
        pending = null;
        if (abort.signal.aborted) return;
        lastError = error instanceof Error ? error.message : String(error);
        postAuthState(port, { status: "error", message: lastError });
      } finally {
        port.onDisconnect.removeListener(onPortDisconnect);
      }
    },

    async handleStatus(port) {
      const auth = await loadCopilotAuth();
      if (auth) {
        postAuthState(port, { status: "connected" });
      } else if (pending) {
        postAuthState(port, {
          status: "pending",
          userCode: pending.userCode,
          verificationUri: pending.verificationUri,
        });
      } else if (lastError) {
        postAuthState(port, { status: "error", message: lastError });
      } else {
        postAuthState(port, { status: "disconnected" });
      }
    },

    async handleDisconnect(port) {
      pending?.abort.abort();
      pending = null;
      lastError = null;
      await clearCopilotAuth();
      postAuthState(port, { status: "disconnected" });
    },

    async handleModels(port) {
      try {
        const models = await listModels();
        postToPort(port, makeEnvelope("event", "copilot.models.state", { models }));
      } catch (error) {
        postToPort(
          port,
          makeEnvelope("event", "copilot.models.state", {
            models: [],
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    },
  };
}
