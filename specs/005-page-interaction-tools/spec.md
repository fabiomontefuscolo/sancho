# Feature Specification: Page Interaction Tools

**Feature Branch**: `005-page-interaction-tools`
**Created**: 2026-09-20
**Status**: Draft
**Input**: User description: "Make page interaction easier for the agent: (A) a structured page snapshot with stable element references so the agent can find elements (e.g. a play button) instead of guessing CSS selectors, with click/fill accepting those references; (B) an editor-aware text tool that works on rich text editors like CodeMirror, where setting an input value does nothing."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Agent finds and acts on elements by reference (Priority: P1)

The user asks the agent to interact with a page (e.g. "press play on strudel.cc"). The agent requests a page snapshot, receives a structured outline of interactive elements (role, name, and a stable reference for each), picks the right element by its visible name, and acts on it via the reference — no CSS selector guessing.

**Why this priority**: Blind selector guessing is the main cause of failed interactions; a findable, referenceable element list fixes it on every site.

**Independent Test**: On a page with a labeled button, the agent takes a snapshot, receives an entry naming that button with a reference, and clicks it by reference; the button's action fires.

**Acceptance Scenarios**:

1. **Given** a page with interactive elements (buttons, links, inputs, selects), **When** the agent requests a page snapshot, **Then** it receives a structured list where each interactive element has a role, an accessible name, and a stable reference.
2. **Given** a snapshot reference for an element, **When** the agent clicks or fills by that reference, **Then** the action targets exactly that element.
3. **Given** a snapshot was taken and the page changed since, **When** the agent acts on a stale reference, **Then** the tool reports that the element is gone instead of acting on the wrong element or failing silently.
4. **Given** a page with hundreds of interactive elements, **When** the agent requests a snapshot, **Then** the result stays compact enough for the agent's context (interactive elements prioritized, noise omitted).

---

### User Story 2 - Agent edits rich text editors (Priority: P1)

The user asks the agent to change code in a rich text editor (e.g. the CodeMirror editor on strudel.cc). The agent focuses the editor and inserts or replaces text the way a real user would type or paste, so the editor's internal state updates and the change takes effect.

**Why this priority**: Rich editors (CodeMirror, Monaco, contenteditable) are where coding-assistant interactions most often fail; setting `.value` silently does nothing.

**Independent Test**: On a page with a CodeMirror editor containing code, the agent replaces the editor content via the tool; the editor's live state reflects the new content (e.g. pressing play runs the new code).

**Acceptance Scenarios**:

1. **Given** a CodeMirror-style contenteditable editor with existing content, **When** the agent replaces its text, **Then** the editor's internal state holds the new content (not just the DOM).
2. **Given** a plain input or textarea, **When** the agent uses the same text tool, **Then** it still works (no regression on simple fields), including firing the events frameworks listen to.
3. **Given** an editor, **When** the agent inserts text at the cursor without replacing all content, **Then** the existing content is preserved around the insertion.

---

### User Story 3 - Agent narrates what it acted on (Priority: P3)

After acting via a reference, the agent's tool result includes the element's role and name (e.g. clicked button "Play"), so the agent can confirm to the user what happened and the chat log stays auditable.

**Why this priority**: Nice-to-have traceability; depends on US1/US2 working first.

**Independent Test**: After a click by reference, the tool result names the element acted on.

**Acceptance Scenarios**:

1. **Given** a successful click by reference, **When** the tool returns, **Then** the result includes the target's role and accessible name.

---

### Edge Cases

- Element moved or re-rendered between snapshot and action (React re-render): the reference must be re-resolved at action time and report staleness if the element is gone.
- Snapshot on a page with iframes: elements inside same-origin iframes are included (marked with their frame); cross-origin frames are reported as inaccessible.
- Snapshot size on huge pages: output must be bounded (cap on element count with a clear truncation notice).
- Editors inside shadow DOM (some CodeMirror setups): the tool should pierce open shadow roots when focusing and typing.
- Password and sensitive fields: snapshot includes them by role but never includes their current values.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The agent MUST be able to request a structured snapshot of the active page's interactive elements, where each entry includes a role, an accessible name, and a stable reference usable in subsequent actions.
- **FR-002**: Snapshot output MUST be bounded: interactive elements are prioritized, non-interactive noise is omitted, and oversized results are truncated with a visible truncation notice.
- **FR-003**: Click, fill, and select tools MUST accept a snapshot reference as an alternative to a CSS selector.
- **FR-004**: References MUST be re-resolved at action time; acting on an element that no longer exists MUST return a clear "element not found / stale reference" result rather than acting elsewhere or failing silently.
- **FR-005**: The agent MUST be able to set or replace the text content of rich text editors (contenteditable-based, e.g. CodeMirror/Monaco) such that the editor's internal state updates, using synthetic user input events rather than property assignment.
- **FR-006**: The same text tool MUST keep working on plain inputs and textareas, firing the input/change events web frameworks listen to.
- **FR-007**: The text tool MUST support both full-content replacement and insertion at the current cursor position.
- **FR-008**: Interaction tools MUST work on elements inside open shadow roots.
- **FR-009**: Tool results for reference-based actions MUST include the target element's role and accessible name.
- **FR-010**: Snapshots MUST NOT include the values of password or otherwise sensitive fields.

### Key Entities _(include if feature involves data)_

- **Page snapshot**: an ephemeral, per-tab, per-request structure listing interactive elements; not persisted.
- **Element reference**: a short-lived opaque handle valid from snapshot time until the page navigates or the element disappears; scoped to the tab it was created on.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: On a test page with a labeled button among 50+ elements, the agent locates and clicks the correct button on the first attempt using snapshot + reference, with no selector guessing.
- **SC-002**: On a CodeMirror-based editor, the agent replaces the editor content and the editor's live state (as observed by the host application, e.g. the code that runs on play) reflects the new content 100% of the time in tests.
- **SC-003**: On a representative busy page (500+ DOM nodes), a snapshot returns in under 2 seconds and fits within a compact outline (at most a few hundred lines).
- **SC-004**: 100% of actions attempted on stale references return a clear staleness result and act on no element.

## Assumptions

- Snapshot references are ephemeral by design; long-lived element bookmarks are out of scope.
- Only same-origin iframes are traversed; cross-origin frames are reported as inaccessible.
- The existing consent model (screenshot consent, per-run tools) is unchanged; these tools act on the active tab like the current ones.
- Selector-based interaction remains available for backward compatibility; references are additive.
