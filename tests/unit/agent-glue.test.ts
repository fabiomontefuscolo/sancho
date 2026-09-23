import { beforeEach, describe, expect, it } from "vitest";
import { installMockChrome } from "./helpers/mock-chrome";
import { menuIdForAction, rebuildContextMenus, seedBuiltinActions } from "../../src/agent/menus";
import { executeTool } from "../../src/agent/tools";
import {
  flushNetworkDiagnostics,
  recordRequestCompleted,
  recordRequestError,
  recordRequestStart,
} from "../../src/agent/diagnostics";
import { listActions, saveActions } from "../../src/storage/settings";
import { getActiveConversation, saveConversationRecord } from "../../src/storage/conversations";
import type { Action } from "../../src/types";

describe("menus", () => {
  beforeEach(() => installMockChrome());

  it("seeds the three built-in actions once", async () => {
    await seedBuiltinActions();
    const actions = await listActions();
    expect(actions.map((a) => a.id).sort()).toEqual([
      "fix-grammar",
      "improve-writing",
      "make-formal",
    ]);
    await saveActions([actions[0]!]);
    await seedBuiltinActions();
    expect(await listActions()).toHaveLength(1);
  });

  it("rebuilds context menus from enabled actions only", async () => {
    const { chromeMock } = installMockChrome();
    const enabled: Action = {
      id: "a",
      name: "A",
      prompt: "p",
      builtin: false,
      enabled: true,
    };
    const disabled: Action = { ...enabled, id: "b", name: "B", enabled: false };
    await saveActions([enabled, disabled]);
    await rebuildContextMenus();
    expect(chromeMock.contextMenus.create).toHaveBeenCalledTimes(1);
    expect(chromeMock.contextMenus.create).toHaveBeenCalledWith(
      expect.objectContaining({ id: menuIdForAction("a"), contexts: ["selection"] }),
    );
  });
});

describe("executeTool", () => {
  beforeEach(() => installMockChrome());

  it("routes readPage through the content script", async () => {
    const result = await executeTool("readPage", {}, 1);
    expect(result).toMatchObject({ chunks: ["text"] });
  });

  it("routes fillField through the content script", async () => {
    const result = (await executeTool("fillField", { selector: "#x", value: "v" }, 1)) as {
      ok: boolean;
    };
    expect(result.ok).toBe(true);
  });

  it("blocks screenshots without consent", async () => {
    const result = (await executeTool("captureScreenshot", {}, 1)) as {
      ok: boolean;
      error: string;
    };
    expect(result).toEqual({ ok: false, error: "consent_required" });
  });

  it("captures an in-memory screenshot with consent", async () => {
    const conversation = await getActiveConversation();
    conversation.screenshotConsent = true;
    await saveConversationRecord(conversation);
    const result = (await executeTool("captureScreenshot", {}, 1)) as {
      ok: boolean;
      imageBase64: string;
    };
    expect(result.ok).toBe(true);
    expect(result.imageBase64).toBe("QUJD");
  });

  it("blocks diagnostics tools without consent", async () => {
    const { chromeMock } = installMockChrome();
    const consoleResult = (await executeTool("getConsoleMessages", {}, 1)) as {
      ok: boolean;
      error: string;
    };
    expect(consoleResult).toEqual({ ok: false, error: "diagnostics_consent_required" });
    const networkResult = (await executeTool("getNetworkRequests", {}, 1)) as {
      ok: boolean;
      error: string;
    };
    expect(networkResult).toEqual({ ok: false, error: "diagnostics_consent_required" });
    expect(chromeMock.tabs.sendMessage).not.toHaveBeenCalledWith(
      1,
      expect.objectContaining({ type: "console.read" }),
    );
  });

  it("reads console messages with consent, applying limit and level filters", async () => {
    const conversation = await getActiveConversation();
    conversation.diagnosticsConsent = true;
    await saveConversationRecord(conversation);

    const all = (await executeTool("getConsoleMessages", {}, 1)) as {
      ok: boolean;
      entries: { level: string; text: string }[];
      truncated: boolean;
    };
    expect(all.ok).toBe(true);
    expect(all.entries).toHaveLength(3);
    expect(all.entries[0]?.text).toBe("boom 42");

    const errorsOnly = (await executeTool("getConsoleMessages", { level: "error" }, 1)) as {
      ok: boolean;
      entries: { level: string }[];
    };
    expect(errorsOnly.entries).toEqual([
      expect.objectContaining({ level: "error", text: "boom 42" }),
    ]);

    const limited = (await executeTool("getConsoleMessages", { limit: 1 }, 1)) as {
      entries: unknown[];
    };
    expect(limited.entries).toHaveLength(1);
  });

  it("reads network requests with consent, most recent first", async () => {
    const conversation = await getActiveConversation();
    conversation.diagnosticsConsent = true;
    await saveConversationRecord(conversation);

    recordRequestStart({ tabId: 1, requestId: "r1", timeStamp: 900 });
    recordRequestCompleted({
      tabId: 1,
      requestId: "r1",
      url: "https://a.example/ok",
      method: "GET",
      statusCode: 200,
      timeStamp: 1000,
    });
    recordRequestError({
      tabId: 1,
      requestId: "r2",
      url: "https://a.example/fail",
      method: "POST",
      error: "net::ERR_ABORTED",
      timeStamp: 2000,
    });
    await flushNetworkDiagnostics();

    const result = (await executeTool("getNetworkRequests", {}, 1)) as {
      ok: boolean;
      requests: { url: string; status: number | null; error: string | null }[];
    };
    expect(result.ok).toBe(true);
    expect(result.requests[0]).toMatchObject({ url: "https://a.example/fail", status: null });
    expect(result.requests[1]).toMatchObject({ url: "https://a.example/ok", status: 200 });

    const limited = (await executeTool("getNetworkRequests", { limit: 1 }, 1)) as {
      requests: unknown[];
    };
    expect(limited.requests).toHaveLength(1);
  });

  it("rejects invalid arguments", async () => {
    await expect(executeTool("fillField", { selector: 1 }, 1)).rejects.toThrow();
  });
});
