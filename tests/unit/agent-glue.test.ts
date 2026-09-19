import { beforeEach, describe, expect, it } from "vitest";
import { installMockChrome } from "./helpers/mock-chrome";
import { menuIdForAction, rebuildContextMenus, seedBuiltinActions } from "../../src/agent/menus";
import { executeTool } from "../../src/agent/tools";
import { listActions, saveActions } from "../../src/storage/settings";
import { saveConversation, getConversation } from "../../src/storage/local";
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
    const conversation = await getConversation();
    conversation.screenshotConsent = true;
    await saveConversation(conversation);
    const result = (await executeTool("captureScreenshot", {}, 1)) as {
      ok: boolean;
      imageBase64: string;
    };
    expect(result.ok).toBe(true);
    expect(result.imageBase64).toBe("QUJD");
  });

  it("rejects invalid arguments", async () => {
    await expect(executeTool("fillField", { selector: 1 }, 1)).rejects.toThrow();
  });
});
