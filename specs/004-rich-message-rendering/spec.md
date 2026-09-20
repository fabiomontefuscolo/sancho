# Feature Specification: Rich Message Rendering

**Feature Branch**: `004-rich-message-rendering`
**Created**: 2026-09-20
**Status**: Draft
**Input**: User description: "Refine the messages UI: markdown rendering for agent messages, syntax highlighting for code blocks, a copy icon on each message and code block that copies the raw markdown, and accessible readable fonts."

## Clarifications

### Session 2026-09-20

- Q: Where should the font-size setting live for users to adjust message text size? → A: Both — a control in the sidebar settings view and the options page, kept in sync.
- Q: For the readable body font, should the extension use the user's system fonts or bundle a dedicated accessibility typeface? → A: System font stacks for body and monospace code.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Reading a formatted agent answer (Priority: P1)

The agent replies with structured content — headings, bullet lists, links, bold terms. The user reads the answer with the formatting rendered visually instead of raw `##` and `**` characters, making structured answers scannable.

**Why this priority**: This is the primary way users consume agent output; raw markdown harms readability on almost every non-trivial answer.

**Independent Test**: Deliver one agent message containing a heading, a bulleted list, a link, and bold text; confirm each renders with its visual formatting and no raw markdown symbols remain.

**Acceptance Scenarios**:

1. **Given** an agent message containing a heading, list, link, and bold text, **When** the message is displayed, **Then** each element renders with its intended visual formatting and no raw markdown syntax is visible.
2. **Given** an agent message that is streaming, **When** the response is in progress, **Then** the partial markdown renders progressively without broken or flickering layout, and the final message renders complete.
3. **Given** an agent message containing malformed or unclosed markdown (e.g. an unclosed bold marker or incomplete link), **When** the message is displayed, **Then** it degrades gracefully to readable plain text instead of breaking the layout.

---

### User Story 2 - Reading and reusing code blocks (Priority: P1)

The agent includes a code block in a language such as TypeScript or Python. The user sees the code with syntax highlighting appropriate to the language, with the language visible, and can copy the code with one click on an icon at the top right of the code block. Long lines scroll horizontally within the code block without disturbing the message list.

**Why this priority**: Code is a core part of coding-assistant output; unreadable or hard-to-copy code blocks break the main workflow.

**Independent Test**: Deliver one agent message with a fenced code block tagged with a language; confirm highlighting is applied, the language label is visible, clicking the copy icon places exactly the code content on the clipboard, and a "copied" confirmation appears.

**Acceptance Scenarios**:

1. **Given** an agent message with a fenced code block tagged `typescript`, **When** it is displayed, **Then** the code renders with syntax highlighting and the language name is visible.
2. **Given** a displayed code block, **When** the user clicks its copy icon, **Then** exactly the code content (no markdown fences, no extra whitespace) is placed on the clipboard and a brief "copied" confirmation is shown.
3. **Given** a code block with lines wider than the message, **When** it is displayed, **Then** the block scrolls horizontally within itself and the message list does not scroll horizontally.
4. **Given** a fenced code block with no language tag, **When** it is displayed, **Then** it renders as readable monospaced code without errors.

---

### User Story 3 - Copying a whole message (Priority: P2)

The user wants to paste an agent answer into a note or an issue. They click a copy icon at the top right of the message and the message's raw markdown source is placed on the clipboard, ready to paste into any markdown-aware tool.

**Why this priority**: Copying preserves formatting for reuse; complements but does not block reading.

**Independent Test**: Given a rendered agent message, click its copy icon and paste the clipboard into a text field; the raw markdown source appears verbatim.

**Acceptance Scenarios**:

1. **Given** any displayed agent message, **When** the user clicks the message copy icon, **Then** the message's raw markdown source is placed on the clipboard and a brief "copied" confirmation is shown.
2. **Given** a message copy icon, **When** the clipboard write fails (e.g. permission denied), **Then** the user sees feedback that copying failed instead of a silent no-op.

---

### User Story 4 - Comfortable reading typography (Priority: P2)

The user reads long conversations comfortably. Body text and code use readable, accessibility-conscious fonts with adequate size and spacing; code uses a monospaced font. The user can adjust the message font size (small / medium / large) from the sidebar settings view or the options page (kept in sync), and the choice persists across sessions.

**Why this priority**: Readability affects every interaction; a font-size option serves users with low vision or dyslexia preferences without redesigning the layout.

**Independent Test**: Change the font-size setting to each option; confirm message text (and code) rescales immediately and the choice survives an extension reload.

**Acceptance Scenarios**:

1. **Given** the chat view, **When** messages are displayed, **Then** body text and code render in clearly readable fonts with adequate size and line spacing at the default setting.
2. **Given** the sidebar settings view or the options page, **When** the user selects a different message font size, **Then** message text rescales immediately in the chat view.
3. **Given** a non-default font size was selected, **When** the extension is reloaded, **Then** the previously selected size is applied.
4. **Given** any font-size setting, **When** messages contain headings, lists, code, and timestamps, **Then** the layout does not break and content does not overflow (003 layout guarantees are preserved).

---

### Edge Cases

- What happens when the agent message contains raw HTML or a script-like payload? The rendered output must not execute scripts or load remote resources — unsafe markup is stripped or shown as text.
- What happens with very large messages (thousands of lines of markdown or a huge code block)? Rendering must remain responsive and the message list must keep scrolling smoothly.
- What happens to the existing timestamp and overflow guarantees from 003? Timestamps remain visible and wide content still never scrolls the message list.
- What happens when markdown contains images? Images render constrained to the message width; remote image loading follows the same no-remote-content safety rule.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The system MUST render markdown content of agent messages (headings, lists, links, emphasis, blockquotes, code) as formatted visual content instead of raw syntax.
- **FR-002**: The system MUST render markdown progressively while a message is streaming, without broken layout on partial input.
- **FR-003**: Rendered markdown MUST be safe: scripts, event handlers, and remote content loads from message markup MUST NOT execute; unsafe markup degrades to plain text.
- **FR-004**: Fenced code blocks MUST render with syntax highlighting for common programming languages and MUST display the language label when one is provided.
- **FR-005**: Each code block MUST provide a copy control at its top right that copies exactly the code content to the clipboard and shows a brief confirmation.
- **FR-006**: Each agent message MUST provide a copy control at its top right that copies the message's raw markdown source to the clipboard and shows a brief confirmation.
- **FR-007**: Copy failures MUST surface visible feedback to the user rather than failing silently.
- **FR-008**: Code blocks wider than the message MUST scroll horizontally within the block; the message list MUST NOT scroll horizontally (003 guarantees preserved).
- **FR-009**: User-authored messages MAY render as plain text; markdown rendering is required for agent messages.
- **FR-010**: Message body text and code MUST use readable, accessibility-conscious system font stacks (no bundled or downloaded font files); code MUST use a system monospaced font.
- **FR-011**: The user MUST be able to choose a message font size from at least three options in both the sidebar settings view and the options page (a single synced preference); the choice MUST persist across sessions and apply immediately.
- **FR-012**: Message timestamps and all layout guarantees from feature 003 MUST remain intact with the new rendering.

### Key Entities _(include if feature involves data)_

- **Font-size preference**: a persisted user setting with at least three discrete values, defaulting to the middle option; stored alongside existing settings (per-002 pattern, survives clearing browsing data).

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: An agent message containing headings, lists, links, and emphasis renders with all elements formatted and zero visible raw markdown symbols.
- **SC-002**: A code block tagged with one of the ten most common languages (e.g. TypeScript, JavaScript, Python, Rust, Go, Java, C, C++, JSON, Bash) renders with visible syntax highlighting.
- **SC-003**: Clicking a code block's copy icon places exactly the code content on the clipboard; clicking a message's copy icon places the exact raw markdown source on the clipboard; both paste verbatim into a text field.
- **SC-004**: Switching the font-size setting rescales message text visibly within one second, and the choice is still applied after the extension is reloaded.
- **SC-005**: Rendering a conversation of 100 markdown-rich messages keeps the message list scroll smooth and initial render under one second on typical hardware.
- **SC-006**: A message containing script-like markup renders harmlessly — nothing executes and no remote request is made.

## Assumptions

- Markdown rendering applies to agent messages; user-authored messages continue to render as plain text (their content is typed by the user, not authored as markdown).
- Copy icons are required on agent messages; user messages already hold user-typed text and do not need a copy affordance (copying the user's own input is rarely useful).
- Syntax highlighting covers a curated set of common languages; unknown or untagged code blocks render as plain monospaced code.
- Font-size adjustment is offered as a discrete setting (small / medium / large) in the sidebar settings view and the options page (kept in sync) rather than free-form zoom.
- Fonts use curated locally available system stacks (readable UI stack for body, system monospace for code); no font files are bundled or downloaded at runtime (consistent with the no-remote-content safety rule).
- Copy confirmations use the existing lightweight feedback patterns of the sidebar (transient label on the control).
