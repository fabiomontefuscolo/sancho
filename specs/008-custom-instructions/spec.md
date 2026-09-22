# Feature Specification: Custom Instructions

**Feature Branch**: `008-custom-instructions`

**Created**: 2026-09-22

**Status**: Draft

**Input**: User description: "Allow the user some freedom to instruct the agent how to reply: a user-editable prelude for the chat, sent like a system message at the start of every chat — similar in purpose to an AGENTS.md file. Named 'Custom instructions'."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Define how the agent replies in every chat (Priority: P1)

A user wants the agent to consistently follow personal preferences — for example "always reply in Portuguese", "be terse", or "never suggest deleting files". They open the extension's options page, type their preferences into a "Custom instructions" text area, and save. From then on, every chat message they send is answered under the influence of those instructions, without the user repeating them.

**Why this priority**: This is the entire core value of the feature — persistent, user-controlled behavioral guidance for the agent, analogous to an AGENTS.md file for a coding agent. Without it, there is no feature.

**Independent Test**: Set instructions to "Always reply in exactly one sentence.", send any chat message, and verify the reply reflects the instruction. Delivers full standalone value.

**Acceptance Scenarios**:

1. **Given** no custom instructions are set, **When** the user opens the Custom instructions section on the options page, **Then** they see an empty text area with helper text explaining the purpose.
2. **Given** the user has entered and saved instructions, **When** they send a chat message, **Then** the agent's reply is influenced by those instructions.
3. **Given** saved instructions exist, **When** the user starts a brand-new conversation, **Then** the instructions still apply to the first reply of that new conversation.

---

### User Story 2 - Update or remove instructions at any time (Priority: P2)

A user's needs change: they edit the instructions (e.g., switch from "reply in Portuguese" to "reply in English") or clear them entirely. The change takes effect on the very next chat message they send — no browser restart, no need to start a new conversation.

**Why this priority**: Instructions are only useful if they remain a living preference. Requiring a restart or a new conversation would make the feature feel broken and erode trust.

**Independent Test**: With instructions "always reply in Portuguese" active and mid-conversation, change them to "always reply in English", send the next message in the same conversation, and verify the reply switches to English. Then clear the instructions and verify replies return to default behavior.

**Acceptance Scenarios**:

1. **Given** a conversation in progress with instructions saved, **When** the user edits the instructions and sends the next message in the same conversation, **Then** the new instructions govern that reply.
2. **Given** instructions are saved, **When** the user clears the text area and saves, **Then** subsequent replies show no influence from the previous instructions.
3. **Given** instructions were saved in a previous browser session, **When** the browser restarts, **Then** the instructions are still present and still applied.

---

### User Story 3 - Instructions follow the user across devices (Priority: P3)

A user who runs the extension on multiple machines (e.g., work and home, same browser profile) finds their custom instructions already present on the second machine, consistent with how their other extension settings behave.

**Why this priority**: Convenience and consistency with existing settings behavior, but the feature delivers its core value on a single device; cross-device sync is an enhancement.

**Independent Test**: Save instructions on one synced browser profile and verify they appear and apply on a second browser signed into the same profile.

**Acceptance Scenarios**:

1. **Given** browser profile syncing is enabled, **When** instructions are saved on device A, **Then** device B receives the same instructions through normal settings sync.

---

### Edge Cases

- **Empty or whitespace-only instructions**: treated as "no instructions"; nothing extra is sent to the model.
- **Instructions exceeding the length limit**: the user is prevented from entering more than 4,000 characters, with a live character count visible while typing.
- **Edit made while a reply is streaming**: the in-flight reply completes under the old instructions; the new instructions apply from the next message onward.
- **Selection Actions (e.g., "fix grammar" on selected text)**: custom instructions MUST NOT affect one-shot selection actions, so that in-place text replacements are not polluted by conversational preferences.
- **External (ACP) agents**: instructions are passed along to externally connected agents as well, so behavior stays consistent regardless of which provider backend is active.
- **Instruction content vs. stored history**: instructions are not written into the saved conversation history; they are applied fresh to each request, so editing them never retroactively alters what past messages look like.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: Users MUST be able to enter, edit, and clear free-form custom instructions from a dedicated "Custom instructions" section on the extension's options page.
- **FR-002**: The options UI MUST display a live character count and MUST NOT allow saving instructions longer than 4,000 characters.
- **FR-003**: Custom instructions MUST persist across browser restarts.
- **FR-004**: When instructions are non-empty, the agent MUST include them as leading instruction context on every chat request, positioned before the built-in contextual information (current time, active tab), and exactly once per request — never repeated within a request.
- **FR-005**: When instructions are empty or whitespace-only, the agent MUST NOT send any additional instruction content.
- **FR-006**: Saved changes MUST take effect on the next chat message without requiring a browser restart or a new conversation.
- **FR-007**: Custom instructions MUST apply uniformly across all chat-capable provider backends, including externally connected (ACP) agents.
- **FR-008**: Custom instructions MUST NOT be applied to one-shot selection Actions (context-menu actions operating on selected text).
- **FR-009**: Custom instructions MUST NOT be persisted into conversation history; they are applied at request time only.
- **FR-010**: Custom instructions MUST synchronize across the user's browser profiles using the same settings synchronization mechanism as the extension's other preferences.
- **FR-011**: The options UI MUST describe the feature's purpose to the user (instructions the agent follows in every chat, like an AGENTS.md file).

### Key Entities

- **Custom Instructions**: A single global, user-authored free-form text (max 4,000 characters). Empty by default. One per user profile — not per conversation.
- **Request Prelude**: The ordered set of leading context sent with each chat request: custom instructions (if any) first, then built-in context (current time, active tab), then conversation history.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A user can locate, set, and save custom instructions in under 1 minute without documentation.
- **SC-002**: 100% of chat replies sent after saving instructions are generated with the instructions present in the request; 0% of requests contain the instructions more than once.
- **SC-003**: Edited instructions are reflected in the very next reply in 100% of cases, with no restart or new conversation required.
- **SC-004**: 100% of attempts to save instructions over 4,000 characters are blocked, with the limit visible to the user before saving.
- **SC-005**: 0% of selection Action invocations include the custom instructions in their requests.

## Assumptions

- A single global instructions field (not per-conversation or per-provider) matches the user's intent, per the AGENTS.md analogy.
- The feature name and UI label is "Custom instructions" (confirmed with the user); UI copy is English-only, consistent with the rest of the extension.
- Editing happens on the options page only; exposing the field in the side panel settings view is out of scope for this feature (may be added later).
- The 4,000-character limit is chosen to stay safely within the underlying synchronized-settings storage quota (~8 KB per item).
- Applying instructions to external (ACP) agents is desired; excluding one-shot selection Actions is desired (both confirmed with the user).
- No validation of instruction _content_ is performed (no profanity filters, prompt-injection screening, etc.) — the user is instructing their own agent on their own data.
