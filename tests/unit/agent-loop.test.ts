import { describe, expect, it } from "vitest";
import { runAgentLoop, type LoopDeps } from "../../src/agent/loop";
import { BaseLLMProvider, type ProviderMessage, type StreamEvents } from "../../src/providers/base";
import type { AgentSession, AgentSessionState, ToolCall } from "../../src/types";
import { newAgentSession } from "../../src/storage/local";

class ScriptedProvider extends BaseLLMProvider {
  readonly id = "scripted";
  calls = 0;
  constructor(private readonly toolCallsPerRound: number) {
    super();
  }
  async streamChat(
    _messages: ProviderMessage[],
    _tools: never[],
    events: StreamEvents,
  ): Promise<void> {
    this.calls += 1;
    if (this.calls <= this.toolCallsPerRound) {
      events.onToolCall({ name: "readPage", arguments: {}, tabId: 1 });
    } else {
      events.onDelta("final answer");
    }
    events.onDone();
  }
}

function makeDeps(provider: BaseLLMProvider) {
  const states: AgentSessionState[] = [];
  const deltas: string[] = [];
  const executed: ToolCall[] = [];
  const saved: AgentSession[] = [];
  const deps: LoopDeps = {
    provider,
    executeTool: async (call) => {
      executed.push(call);
      return { ok: true };
    },
    onDelta: (text) => deltas.push(text),
    onStateChange: (state) => states.push(state),
    saveSession: async (session) => {
      saved.push({ ...session });
    },
    getMessages: async () => [{ role: "user", content: "do it" }],
  };
  return { deps, states, deltas, executed, saved };
}

describe("agent loop", () => {
  it("runs plan → act → verify cycles and finishes done when no tool calls remain", async () => {
    const provider = new ScriptedProvider(2);
    const { deps, states, deltas, executed } = makeDeps(provider);
    const session = newAgentSession("global");

    const result = await runAgentLoop(deps, session);

    expect(result.state).toBe("done");
    expect(executed).toHaveLength(2);
    expect(deltas).toEqual(["final answer"]);
    expect(states[0]).toBe("planning");
    expect(states).toContain("acting");
    expect(states).toContain("verifying");
  });

  it("forces stopped at maxIterations with no further tool execution", async () => {
    const provider = new ScriptedProvider(100);
    const { deps, executed } = makeDeps(provider);
    const session = { ...newAgentSession("global"), maxIterations: 3 };

    const result = await runAgentLoop(deps, session);

    expect(result.state).toBe("stopped");
    expect(result.iteration).toBe(3);
    expect(executed.length).toBeLessThanOrEqual(3);
  });

  it("records error state when the provider fails", async () => {
    class FailingProvider extends BaseLLMProvider {
      readonly id = "failing";
      async streamChat(
        _messages: ProviderMessage[],
        _tools: never[],
        events: StreamEvents,
      ): Promise<void> {
        events.onError(new Error("boom"));
      }
    }
    const { deps } = makeDeps(new FailingProvider());
    const result = await runAgentLoop(deps, newAgentSession("global"));
    expect(result.state).toBe("error");
  });

  it("persists the session on every transition so a service worker restart can resume", async () => {
    const provider = new ScriptedProvider(1);
    const { deps, saved } = makeDeps(provider);
    await runAgentLoop(deps, newAgentSession("global"));
    expect(saved.length).toBeGreaterThan(0);
    expect(saved.every((session) => session.conversationId === "global")).toBe(true);
  });
});
