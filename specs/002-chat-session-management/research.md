# Research: Chat Session Management

All Technical Context items were already resolved by feature 001 (same stack). The
decisions below are the feature-specific design choices.

## Decision 1: Storage layout for multiple conversations

**Decision**: One record per conversation under `conversation:<uuid>`, plus a metadata
index `conversations.index: Array<{ id, title, updatedAt, createdAt, messageCount }>`,
plus `activeConversationId: string`. Index is the source of truth for list ordering
(sort by `updatedAt` desc at read time, not stored order).

**Rationale**: `chrome.storage.local` is key-value; a single monolithic record holding
all conversations would rewrite every history on each message (write amplification and
race risk with concurrent runs). Per-conversation keys keep message writes O(1) in
other conversations; the small index makes list rendering fast without deserializing
full histories.

**Alternatives considered**: (a) single `conversations` record with map — rejected,
rewrites all histories per message; (b) scan all `conversation:*` keys for the list —
rejected, requires reading full message arrays just to show titles.

## Decision 2: Migration of the legacy single conversation

**Decision**: On background startup, if legacy key `conversation` exists and
`conversations.index` does not, wrap it as `conversation:<uuid>` (preserving messages,
`screenshotConsent`, timestamps), derive its title from the first user message, seed
the index and `activeConversationId`, then remove the legacy key. Migration is
idempotent (guard on index existence).

**Rationale**: Zero data loss for existing users; single code path afterwards.

**Alternatives considered**: keep dual-read fallback — rejected, permanent branching
for a one-time upgrade.

## Decision 3: Run affinity while switching conversations (FR-012)

**Decision**: A `chat.send` binds the run to the conversation id carried in the
request. The background appends streamed messages to that conversation record as the
run progresses and emits `chat.*` events tagged with `conversationId`. The side panel
renders events only when they match its active conversation; on switching, it issues
`conversation.get` for the target id and renders persisted state. A run therefore
completes correctly even if the user opens the list or switches away and back.

**Rationale**: The service worker owns truth; the panel is a view. Persisting per
message (already the pattern from feature 001's `saveConversation`) means reloads and
switches never lose streamed content.

**Alternatives considered**: cancel the run on switch — rejected, violates FR-012;
buffer events per conversation in memory — rejected, violates the MV3 no-persistent-
in-memory-state constraint.

## Decision 4: Title derivation and placeholder

**Decision**: Title = first user message text, collapsed whitespace, truncated to 40
characters with ellipsis. Conversations with no user message display "New
conversation". Title is computed lazily at index-update time (after the first user
message is persisted) and stored in the index entry.

**Rationale**: Spec FR-009; 40 chars fits the side-panel width at default font.

## Decision 5: ACP session binding

**Decision**: ACP `session/new` is keyed by conversation id; the ACP provider keeps a
map of conversationId → ACP session id (persisted alongside the conversation record as
`acpSessionId`). Resuming a conversation reuses its session; a new conversation starts
a new session. The OpenAI-compatible provider is stateless per request and needs no
session handling.

**Rationale**: ACP agents hold conversational state server-side; reusing the session
preserves the agent's context when resuming, matching user expectations for "resume".

## Decision 6: Deleting the active conversation / conversation with live run

**Decision**: Deleting the active conversation cancels any in-flight run for it
(existing abort path), removes its record and index entry, creates a fresh empty
conversation, and sets it active. Deleting a non-active conversation with a live run
also cancels that run first. Delete is single-click (no confirmation), per spec
assumption.

**Rationale**: A run cannot complete into a deleted record; cancelling first keeps the
store consistent.

## Decision 7: UI view model

**Decision**: The side panel holds local view state `chat | list`. The hamburger
button switches to `list`; select/new switch back to `chat` (after a
`conversations.select`/`conversations.new` round trip); back button and `Escape`
keypress switch back with no message sent. Delete issues `conversations.delete` and
updates from the pushed `conversations.state` event.

**Rationale**: View switching is pure presentation — no background round trip needed
for dismiss (FR-005 zero side effects); list data is background-owned and pushed,
satisfying Constitution V.
