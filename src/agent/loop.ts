import type { BaseLLMProvider, ProviderMessage } from "../providers/base";
import type { AgentSession, AgentSessionState, ToolCall } from "../types";
import { toolDefinitions } from "./tools";

export interface LoopDeps {
  provider: BaseLLMProvider;
  executeTool: (call: ToolCall) => Promise<unknown>;
  onDelta: (text: string) => void;
  onStateChange: (state: AgentSessionState) => void;
  saveSession: (session: AgentSession) => Promise<void>;
  getMessages: () => Promise<ProviderMessage[]>;
}

interface RoundResult {
  text: string;
  toolCalls: ToolCall[];
  error: Error | null;
}

async function runRound(
  provider: BaseLLMProvider,
  messages: ProviderMessage[],
  deps: LoopDeps,
): Promise<RoundResult> {
  let text = "";
  const toolCalls: ToolCall[] = [];
  let error: Error | null = null;

  await provider.streamChat(messages, toolDefinitions as never[], {
    onDelta: (delta) => {
      text += delta;
      deps.onDelta(delta);
    },
    onToolCall: (call) => toolCalls.push(call),
    onDone: () => {},
    onError: (err) => {
      error = err;
    },
  });

  return { text, toolCalls, error };
}

async function transition(
  session: AgentSession,
  state: AgentSessionState,
  deps: LoopDeps,
): Promise<void> {
  session.state = state;
  deps.onStateChange(state);
  await deps.saveSession(session);
}

export async function runAgentLoop(deps: LoopDeps, session: AgentSession): Promise<AgentSession> {
  const messages: ProviderMessage[] = await deps.getMessages();

  while (true) {
    if (session.iteration >= session.maxIterations) {
      await transition(session, "stopped", deps);
      deps.onDelta(
        "\n\n[agent stopped: reached the safety limit of " +
          `${session.maxIterations} actions — ask me to continue if needed]`,
      );
      return session;
    }

    await transition(session, "planning", deps);
    const round = await runRound(deps.provider, messages, deps);

    if (round.error) {
      await transition(session, "error", deps);
      return session;
    }

    session.iteration += 1;

    if (round.toolCalls.length === 0) {
      if (round.text) messages.push({ role: "assistant", content: round.text });
      await transition(session, "done", deps);
      return session;
    }

    if (round.text) messages.push({ role: "assistant", content: round.text });

    for (const call of round.toolCalls) {
      await transition(session, "acting", deps);
      session.pendingToolCall = call;
      await deps.saveSession(session);

      let output: unknown;
      try {
        output = await deps.executeTool(call);
      } catch (error) {
        output = { ok: false, error: error instanceof Error ? error.message : String(error) };
      }

      await transition(session, "verifying", deps);
      session.pendingToolCall = null;
      messages.push({
        role: "tool",
        toolCallId: call.name,
        content: JSON.stringify(output),
      });
    }
  }
}
