import { beforeEach, describe, expect, it } from "vitest";
import { runSelectionAction, type ActionDeps } from "../../src/agent/actions";
import { BaseLLMProvider, type StreamEvents } from "../../src/providers/base";
import type { Action } from "../../src/types";

class ReplyProvider extends BaseLLMProvider {
  readonly id = "reply";
  lastPrompt = "";
  constructor(private readonly reply: string) {
    super();
  }
  async streamChat(
    messages: { role: string; content: string }[],
    _tools: never[],
    events: StreamEvents,
  ) {
    this.lastPrompt = messages[messages.length - 1]?.content ?? "";
    events.onDelta(this.reply);
    events.onDone();
  }
}

const action: Action = {
  id: "fix-grammar",
  name: "Fix grammar",
  prompt: "Fix grammar of: {{selection}}",
  builtin: true,
  enabled: true,
};

function makeDeps(overrides: Partial<ActionDeps> = {}) {
  const appended: string[] = [];
  const replaced: string[] = [];
  const deps: ActionDeps = {
    provider: new ReplyProvider("corrected text"),
    getSelection: async () => ({ text: "teh quick fox", editable: true }),
    replaceSelection: async (_tabId, replacement) => {
      replaced.push(replacement);
      return { ok: true };
    },
    appendToConversation: async (text) => {
      appended.push(text);
    },
    ...overrides,
  };
  return { deps, appended, replaced };
}

describe("runSelectionAction", () => {
  beforeEach(() => {});

  it("replaces the selection in place when editable", async () => {
    const { deps, replaced, appended } = makeDeps();
    const result = await runSelectionAction(action, 5, deps);
    expect(result).toEqual({ ok: true, replacement: "corrected text" });
    expect(replaced).toEqual(["corrected text"]);
    expect(appended).toEqual([]);
    expect((deps.provider as ReplyProvider).lastPrompt).toBe("Fix grammar of: teh quick fox");
  });

  it("posts the result to the conversation when read-only", async () => {
    const { deps, replaced, appended } = makeDeps({
      getSelection: async () => ({ text: "some article", editable: false }),
    });
    const result = await runSelectionAction(action, 5, deps);
    expect(result).toEqual({ ok: true, text: "corrected text" });
    expect(replaced).toEqual([]);
    expect(appended).toEqual(["corrected text"]);
  });

  it("leaves the selection untouched on provider error", async () => {
    class FailProvider extends BaseLLMProvider {
      readonly id = "fail";
      async streamChat(_m: never[], _t: never[], events: StreamEvents) {
        events.onError(new Error("provider down"));
      }
    }
    const { deps, replaced } = makeDeps({ provider: new FailProvider() });
    const result = await runSelectionAction(action, 5, deps);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("provider down");
    expect(replaced).toEqual([]);
  });

  it("rejects concurrent actions on the same tab", async () => {
    let release: () => void = () => {};
    const slow = new (class extends BaseLLMProvider {
      readonly id = "slow";
      async streamChat(_m: never[], _t: never[], events: StreamEvents) {
        await new Promise<void>((resolve) => {
          release = resolve as () => void;
        });
        events.onDelta("late");
        events.onDone();
      }
    })();
    const { deps } = makeDeps({ provider: slow });

    const first = runSelectionAction(action, 9, deps);
    const second = await runSelectionAction(action, 9, deps);
    expect(second.ok).toBe(false);
    expect(second.error).toMatch(/already running/i);
    release();
    await first;
  });
});
