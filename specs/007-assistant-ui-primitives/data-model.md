# Data Model: Assistant-UI Primitives Alignment & Settings Polish

**Date**: 2026-09-21
**Feature**: `007-assistant-ui-primitives`

This feature is a UI/protocol refactor. **No persisted storage schema changes**: `Conversation`, `Message`, `UiPrefs`, and all `chrome.storage.local` records keep their current shape. All new fields are session-scoped (in-memory UI state and bridge payloads only).

## Entities

### Message (persisted — unchanged shape)

Existing `src/types.ts` shape retained: `{ id, role, parts: MessagePart[], tabId, createdAt }`. Persisted parts remain `text` and `image` only (the existing `ToolCallPart` type exists but is not written to history by the current handler — unchanged).

- **Validation**: existing storage round-trip rules unchanged.
- **Lifecycle**: unchanged; `chat.regenerate` truncates assistant messages after the last user message (in-place array edit, then normal save).

### Live message (session-scoped UI state)

The runtime-layer extension of Message used only inside the side panel while a run is live:

| Field         | Type                                                                   | Notes                                                   |
| ------------- | ---------------------------------------------------------------------- | ------------------------------------------------------- |
| id            | string                                                                 | assistant id issued at run start                        |
| role          | "assistant" \| "user"                                                  |                                                         |
| content parts | ordered list: `reasoning` \| `tool-call` \| `text` (+ `image`)         | reasoning/tool-call parts exist only during the session |
| status        | `{ type: "incomplete", reason: "error", error: unknown }` \| undefined | set on `chat.error`; never persisted                    |
| createdAt     | Date                                                                   |                                                         |

- **State transitions**: streaming (parts accumulate) → complete (`chat.done`) | errored (`chat.error` sets status) | cancelled (`chat.done` with `cancelled: true`; interrupted tool entries must reach a terminal, non-"running" display state).
- **Persistence rule**: on `chat.done`/error/cancel, only the final assistant text is appended to the persisted conversation (current behavior); reasoning and tool-call parts are discarded on reload/conversation switch (spec edge case).

### Tool invocation entry (session-scoped)

| Field      | Type                    | Notes                                                     |
| ---------- | ----------------------- | --------------------------------------------------------- |
| toolCallId | string                  | from provider (`toolCallId`) or generated UUID (ACP path) |
| toolName   | string                  |                                                           |
| argsText   | string                  | serialized arguments for display                          |
| result     | string \| undefined     | present once finished                                     |
| status     | "started" \| "finished" | interrupted runs render as terminal in the UI             |

### Appearance preferences (persisted — unchanged)

`UiPrefs { fontSize: "small" \| "medium" \| "large" }`. Font size is the only setting in scope; both the options-page Appearance section and the in-panel "Aa" quick view write the same record (spec FR-013).

## Relationships

- Live message 1—* tool invocation entries (ordered into the message's content parts).
- Live message 0—* reasoning entries (one reasoning part per contiguous reasoning block).
- Conversation 1—* persisted messages (unchanged).

## Validation Rules

- `chat.delta` with `part: "text" | "reasoning"` — unknown values are ignored by the UI (forward-compatible).
- `chat.error` must carry `messageId`; the UI falls back to the envelope id if absent (defensive, existing behavior parity).
- Regenerate with no user message in the active conversation is a no-op.
