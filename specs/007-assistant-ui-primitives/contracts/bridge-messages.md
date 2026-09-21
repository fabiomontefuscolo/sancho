# Contracts: Bridge Message Protocol Changes

**Date**: 2026-09-21
**Feature**: `007-assistant-ui-primitives`

The extension's external interface is the UI↔background envelope protocol (`src/bridge/messages.ts`, port `sancho-ui`). This feature changes three event payloads and adds one request op. All changes are backward-compatible within the extension (single-version deployment; UI and background ship together).

## Changed: `chat.delta` (event, background → UI)

```ts
interface ChatDeltaPayload {
  messageId: string;
  text: string;
  part?: "text" | "reasoning"; // new; absent means "text"
  conversationId: string;
}
```

- `part: "reasoning"` deltas accumulate into a reasoning entry; `part: "text"` (or absent) into the visible answer.
- Ordering: background emits deltas in stream order; the UI groups contiguous same-kind deltas.

## Changed: `chat.tool` (event, background → UI)

```ts
interface ChatToolPayload {
  toolCallId: string; // was toolCall.id
  toolName: string; // was toolCall.name
  argsText: string; // JSON-serialized arguments
  result?: string; // serialized result, present on "finished"
  status: "started" | "finished";
  conversationId?: string;
}
```

- Replaces the nested `{ toolCall: ToolCall, status }` shape.
- ACP path: background generates the `toolCallId` (UUID) per invocation.

## Changed: `chat.error` (event, background → UI)

```ts
interface ChatErrorPayload {
  message: string;
  messageId?: string; // new; assistant message the error belongs to
  conversationId?: string;
}
```

- On receipt (except `message === "consent_required"`, which keeps the banner path), the UI sets the targeted assistant message's status to `{ type: "incomplete", reason: "error", error }` instead of appending fake text.
- When `messageId` is absent, the UI targets the current in-flight assistant message (fallback).

## Added: `chat.regenerate` (request, UI → background)

```ts
type ChatRegenerate = Envelope<"chat.regenerate", Record<string, never>>;
```

Background behavior:

1. Resolve the active conversation; no-op if it has no user message.
2. Abort any active run for that conversation (existing abort registry).
3. Truncate `conversation.messages` after the most recent user message; save the record; emit `conversation.state` + `conversations.state`.
4. Run the agent loop with the same path as `chat.send` (shared `runConversation` helper), streaming `chat.delta`/`chat.tool` events with a fresh assistant id.

## Unchanged

`chat.send`, `chat.cancel`, `chat.clear`, `chat.done` (including `cancelled`), `chat.state`, `conversation.*`, `conversations.*`, `screenshot.consent`, `permission.*`, `settings.*`, `actions.*`, `copilot.*`.

## UI contract notes

- Gear button: `chrome.runtime.openOptionsPage()` — options page honors `#appearance` nav anchor (`Connection | Appearance | Actions | About`).
- Composer: Enter sends, Shift+Enter newline, send disabled when empty, stop action while `isRunning` (wired to `chat.cancel`).
- Action bar: Copy on all messages; Reload (→ `chat.regenerate`) on assistant messages only; hidden/disabled while running; auto-hide except on last message.
