# Contract: Conversation Bridge Messages & Storage Keys

Extends `specs/001-ai-agent-extension/contracts/runtime-messages.md`. All messages use
the existing typed `Envelope` over the `sancho-ui` runtime port.

## UI → Background

### `conversations.list`

Payload: `{}`
Response event: `conversations.state` (also pushed after any mutation).

### `conversations.select`

Payload: `{ conversationId: string }`
Effects: sets `activeConversationId`; emits `conversations.state` and
`conversation.state` (full history of the selected conversation). Errors: unknown id →
`chat.error` with `message: "unknown conversation"`, active conversation unchanged.

### `conversations.new`

Payload: `{}`
Effects: creates empty conversation, sets it active, emits `conversations.state` +
`conversation.state` (empty history).

### `conversations.delete`

Payload: `{ conversationId: string }`
Effects: cancels any in-flight run bound to that id; removes record + index entry. If
it was active: creates a new empty conversation, sets active, emits `conversation.state`
(empty). Always emits `conversations.state`. Deleting the last conversation behaves as
"delete active".

### `chat.send` (amended)

Payload: `{ text: string; tabId: number; conversationId: string }`
The `conversationId` is required; the run and all appended messages bind to it
(research decision 3). Events for the run carry `conversationId`.

### `conversation.get` (amended)

Payload: `{ conversationId?: string }` — omitted means "active conversation".

### `chat.clear`

Semantics redefined: deletes the active conversation and creates a fresh empty one
(equivalent to `conversations.delete` on the active id).

## Background → UI

### `conversations.state`

Payload: `{ conversations: ConversationSummary[]; activeConversationId: string }`
Sorted by `updatedAt` descending. Pushed after `list`, `select`, `new`, `delete`, and
after any message append that changes ordering or title.

### `conversation.state` (amended)

Payload gains `conversationId` and `title`; UI uses `conversationId` to ignore stale
responses after a switch.

### `chat.delta` / `chat.done` / `chat.error` (amended)

Payload gains `conversationId` of the owning run.

## Storage Keys (`chrome.storage.local`)

| Key                            | Value                 |
| ------------------------------ | --------------------- |
| `conversation:<uuid>`          | Conversation record   |
| `conversations.index`          | ConversationSummary[] |
| `activeConversationId`         | string                |
| `conversation` (legacy)        | removed by migration  |
| `apiKey:<ref>`, `agentSession` | unchanged             |

## Invariants

1. `conversations.state` is always sorted by `updatedAt` desc.
2. `activeConversationId` in every `conversations.state` refers to an entry in the same
   payload's list.
3. After `conversations.delete`, the deleted id never appears in any subsequent
   `conversations.state`, including after browser restart (SC-004).
4. Events of a run (`chat.delta`, `chat.done`) always carry the `conversationId` given
   in the originating `chat.send`.
