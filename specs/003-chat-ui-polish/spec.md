# Feature Specification: Chat UI Polish

**Feature Branch**: `003-chat-ui-polish`
**Created**: 2026-09-19
**Status**: Draft
**Input**: User description: "UI improvements using the assistant-ui library as much as possible, avoiding custom solutions where one is already available: (1) chat view must occupy the sidebar completely — remove side margins/padding and eliminate the double vertical scrollbar; (2) input box needs a little padding from the bottom; (3) messages show the date/time they were sent or received (e.g. 'Sat Sep 19 22:56'); (4) message content must never cause horizontal scrolling of the whole message list — images fit the message max-width, and horizontal scrolling for wide content like code blocks happens inside the message itself."

## User Scenarios & Testing _(mandatory)_

### User Story 1 — Chat fills the sidebar with a single scrollbar (Priority: P1)

When the user opens the sidebar, the chat surface fills the entire panel — no unused margins on the sides, and exactly one vertical scrollbar (the message history). The header, message list, and composer each stay within the panel height without the outer view itself scrolling.

**Why this priority**: The double scrollbar and wasted horizontal space are the most visible layout defects and make the app feel broken.

**Independent Test**: Open the sidebar and the conversation list and chat views; verify no element overflows the panel horizontally, the page-level scrollbar never appears, and only the message list scrolls.

**Acceptance Scenarios**:

1. **Given** the sidebar is open on a conversation, **When** the conversation is longer than the panel, **Then** only the message history scrolls vertically; the header and composer remain fixed in place and the outer view does not scroll.
2. **Given** the sidebar is open on any view (list, chat, error, prompt), **When** the user looks at the left and right edges, **Then** the content spans the full panel width with no dead margins.
3. **Given** a narrow sidebar (user drags it to minimum width), **When** any view renders, **Then** no horizontal scrollbar appears anywhere.

---

### User Story 2 — Composer has comfortable bottom spacing (Priority: P2)

The message input area sits slightly above the bottom edge of the sidebar instead of being flush against it.

**Why this priority**: Cosmetic comfort; quick win.

**Independent Test**: Open the chat view and verify visible spacing between the composer's bottom edge and the panel's bottom edge.

**Acceptance Scenarios**:

1. **Given** the chat view is open, **When** the user looks at the input box, **Then** there is a small, visually clear gap between the input box and the bottom edge of the sidebar.

---

### User Story 3 — Messages show when they were sent (Priority: P2)

Each message bubble displays the date and time it was sent (user messages) or received (assistant messages), in a compact human-readable form such as "Sat Sep 19 22:56".

**Why this priority**: Conversations persist across days (feature 002); timestamps are essential for users to orient themselves in history.

**Independent Test**: Send a message, receive a reply, and reload a conversation from history; verify every message shows a timestamp in the specified format.

**Acceptance Scenarios**:

1. **Given** a conversation with user and assistant messages, **When** the user views it, **Then** every message shows its sent/received date-time in the "Sat Sep 19 22:56" style format.
2. **Given** a conversation reopened from history, **When** the messages render, **Then** the timestamps reflect the original send/receive times, not the reload time.
3. **Given** a message is streaming in, **When** it finishes, **Then** it displays its timestamp like any other message.

---

### User Story 4 — Wide content never scrolls the whole list (Priority: P1)

Message content adapts to the message's maximum width: images shrink to fit, and content that is intrinsically wider (such as code blocks) scrolls horizontally within its own container only — never making the entire message list scroll sideways.

**Why this priority**: A list-wide horizontal scrollbar breaks the chat metaphor and hides content; this is a core readability defect once the agent returns screenshots or wide code.

**Independent Test**: Produce a message containing a wide image and a message containing a long unbroken code line; verify the message list never gains a horizontal scrollbar, the image fits, and the code block scrolls internally.

**Acceptance Scenarios**:

1. **Given** a message containing an image wider than the message area, **When** it renders, **Then** the image scales down to fit the message width and no horizontal scrollbar appears on the list.
2. **Given** a message containing a code block with lines wider than the message area, **When** it renders, **Then** the code block scrolls horizontally inside its own container and the message list does not scroll horizontally.
3. **Given** a message containing a very long unbroken word or URL, **When** it renders, **Then** the text wraps or truncates within the message without widening the list.

---

### Edge Cases

- Sidebar resized to its minimum width while content is visible — no overflow or layout breakage.
- Multiple wide elements (image + code block) in the same message — each constrained independently.
- Timestamps around midnight/day boundaries — the day-of-week and date shown are the send date, unambiguous.
- The conversation list view must also occupy the full panel width (no dead margins there either).

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The chat view MUST occupy the full width of the sidebar with no external side margins or padding creating dead space; this applies to all sidebar views (conversation list, chat, error and prompt states).
- **FR-002**: The sidebar MUST present exactly one vertical scrolling region — the message history. The outer view MUST NOT scroll; the header and composer MUST remain visible at all times.
- **FR-003**: The composer (message input area) MUST have a small visible gap between its bottom edge and the bottom of the sidebar.
- **FR-004**: Every user and assistant message MUST display the date and time it was sent or received in a compact format including day-of-week, month, day, and time (e.g. "Sat Sep 19 22:56").
- **FR-005**: Timestamps of persisted messages MUST reflect the original send/receive time after a conversation is reloaded from storage (requires send/receive time to be recorded with the message).
- **FR-006**: The message list MUST NEVER display a horizontal scrollbar regardless of message content.
- **FR-007**: Images inside messages MUST scale to fit the message's maximum width while preserving aspect ratio.
- **FR-008**: Horizontally overflowing content such as code blocks MUST scroll horizontally only within its own container inside the message.
- **FR-009**: Long unbroken text (URLs, tokens) MUST wrap or be contained within the message width without widening the list.
- **FR-010**: UI changes MUST prefer components, primitives, and styling hooks already provided by the chat UI library in use over custom-built equivalents; custom solutions are acceptable only where the library offers nothing suitable.

### Key Entities

- **Chat message**: gains (or already carries) a creation timestamp used for display; persisted with the conversation so history renders original times.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: In the sidebar at any width, zero horizontal scrollbars appear on any view, and exactly one vertical scrollbar region exists (the message history).
- **SC-002**: 100% of messages (user, assistant, streamed, reloaded from history) display a timestamp in the specified format.
- **SC-003**: A message containing an image 3× wider than the panel renders with the image fully visible at message width; the list remains horizontally static.
- **SC-004**: A code block with a 200-character line scrolls only inside its own container; the list's horizontal scroll position never changes.
- **SC-005**: The visual gap below the composer is perceptible (at least a few pixels) at all sidebar widths.

## Assumptions

- Timestamp display uses the user's locale conventions for day/month names and 24-hour time, matching the "Sat Sep 19 22:56" shape (day-of-week, month, day-of-month, HH:MM); seconds and year are omitted for compactness.
- Timestamps appear in a subdued style near the message (header or footer of the bubble) so they don't compete with content.
- Existing assistant-ui primitives (Thread, Message, Composer and their part components) already expose the layout structure needed; work is primarily configuration and CSS within those primitives rather than new components, per FR-010.
- Messages already carry enough data to know when they were created; if not, a creation timestamp is added to the stored message shape with a sensible fallback (e.g. migration/default for old messages).
- No changes to message content, markdown rendering features, or theming beyond what the four fixes require.
