# Data Model: Chat Session Management

## Entities

### Conversation (persisted at `conversation:<id>`)

Extends the feature-001 `Conversation` record.

| Field               | Type              | Notes                                                                                                |
| ------------------- | ----------------- | ---------------------------------------------------------------------------------------------------- |
| `id`                | string (UUID)     | Generated via `crypto.randomUUID()`                                                                  |
| `title`             | string            | Derived from first user message (≤40 chars, ellipsis); `"New conversation"` when no user message yet |
| `messages`          | Message[]         | Unchanged from feature 001                                                                           |
| `screenshotConsent` | boolean           | Per-conversation, unchanged semantics                                                                |
| `acpSessionId`      | string \| null    | ACP session binding (null for cloud providers)                                                       |
| `createdAt`         | number (epoch ms) | Set at creation                                                                                      |
| `updatedAt`         | number (epoch ms) | Bumped on every persisted message append                                                             |

### ConversationSummary (index entry)

| Field          | Type   | Notes                           |
| -------------- | ------ | ------------------------------- |
| `id`           | string | FK to Conversation              |
| `title`        | string | Denormalized for list rendering |
| `updatedAt`    | number | Sort key (descending)           |
| `createdAt`    | number | Display/fallback ordering       |
| `messageCount` | number | Optional display aid            |

### ConversationsIndex (persisted at `conversations.index`)

Array of `ConversationSummary`. Rebuilt derivable from conversation records but stored
for fast list loads; kept consistent transactionally with conversation writes.

### ActiveConversation (persisted at `activeConversationId`)

String UUID pointing at the currently active conversation. Always refers to an existing
index entry after any mutation completes.

## Validation Rules

- Conversation ids are unique (UUID v4 collision probability negligible; store asserts
  absence before insert).
- `title` is never empty: falls back to `"New conversation"`.
- `updatedAt >= createdAt` invariant holds after every write.
- Index and records are consistent: every index id resolves to a record and vice versa
  (verified by unit tests).
- After delete of the active conversation, `activeConversationId` points to the freshly
  created empty conversation.

## State Transitions

```
[none] --(new conversation)--> Empty
Empty --(first user message persisted)--> Titled (title set from message)
Titled --(message appended)--> Titled (updatedAt bumped, moves to top of list)
Any --(delete)--> [removed] (+ new Empty conversation if it was active)
```

## Lifecycle & Migration

- Legacy `conversation` record (feature 001) migrates once on startup into
  `conversation:<uuid>` + index + active pointer, then is removed.
- Conversations persist indefinitely in the browser profile until explicitly deleted
  (FR-011); no automatic pruning in v1.
