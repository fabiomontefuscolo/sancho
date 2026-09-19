import { beforeEach, describe, expect, it } from "vitest";
import { installMockChrome } from "./helpers/mock-chrome";
import { deleteAction, upsertAction, validateActionDraft } from "../../src/agent/action-crud";
import { listActions, saveActions } from "../../src/storage/settings";
import type { Action } from "../../src/types";

const builtin: Action = {
  id: "fix-grammar",
  name: "Fix grammar",
  prompt: "Fix: {{selection}}",
  builtin: true,
  enabled: true,
};

const custom: Action = {
  id: "c1",
  name: "Translate to Spanish",
  prompt: "Translate: {{selection}}",
  builtin: false,
  enabled: true,
};

describe("validateActionDraft", () => {
  it("rejects empty and overlong names", () => {
    expect(validateActionDraft({ name: "", prompt: "x" }, [])).toMatch(/name/i);
    expect(validateActionDraft({ name: "a".repeat(51), prompt: "x" }, [])).toMatch(/50/);
  });

  it("rejects duplicate names but allows keeping the same name on edit", () => {
    expect(validateActionDraft({ name: "Fix grammar", prompt: "x" }, [builtin])).toMatch(/unique/i);
    expect(
      validateActionDraft({ name: "Fix grammar", prompt: "x" }, [builtin], "fix-grammar"),
    ).toBeNull();
  });

  it("rejects an empty prompt", () => {
    expect(validateActionDraft({ name: "X", prompt: "  " }, [])).toMatch(/prompt/i);
  });

  it("accepts a valid draft", () => {
    expect(
      validateActionDraft({ name: "Summarize", prompt: "Summarize {{selection}}" }, []),
    ).toBeNull();
  });
});

describe("upsertAction / deleteAction", () => {
  beforeEach(() => installMockChrome());

  it("creates and updates custom actions", async () => {
    await saveActions([builtin]);
    expect((await upsertAction(custom)).ok).toBe(true);
    expect((await listActions()).map((a) => a.id).sort()).toEqual(["c1", "fix-grammar"]);

    expect((await upsertAction({ ...custom, name: "Renamed" })).ok).toBe(true);
    const actions = await listActions();
    expect(actions.find((a) => a.id === "c1")?.name).toBe("Renamed");
  });

  it("rejects invalid upserts", async () => {
    const result = await upsertAction({ ...custom, name: "" });
    expect(result.ok).toBe(false);
    expect(await listActions()).toEqual([]);
  });

  it("deletes custom actions but refuses built-ins", async () => {
    await saveActions([builtin, custom]);
    expect((await deleteAction("c1")).ok).toBe(true);
    expect((await deleteAction("fix-grammar")).ok).toBe(false);
    expect((await listActions()).map((a) => a.id)).toEqual(["fix-grammar"]);
  });

  it("allows disabling a built-in instead of deleting", async () => {
    await saveActions([builtin]);
    expect((await upsertAction({ ...builtin, enabled: false })).ok).toBe(true);
    expect((await listActions())[0]?.enabled).toBe(false);
  });
});
