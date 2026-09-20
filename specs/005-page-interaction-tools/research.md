# Research: Page Interaction Tools (005)

## R1: Element references

**Decision**: Per-tab ephemeral registry in the content-script isolated world: `Map<string, WeakRef<Element>>` + `WeakMap<Element, string>` for idempotence. Refs are minted as `e1`, `e2`, … during a snapshot. Resolution: `WeakRef.deref()` → `element.isConnected` check → stale error otherwise. The registry dies with the page (navigation = new isolated world), which matches the spec's lifecycle for free.

**Rationale**: WeakRefs avoid leaking detached DOM and make staleness detection trivial. The registry lives on `globalThis` of the isolated world, guarded by the existing `__sanchoContentLoaded` injection guard, so repeated injections share one registry.

**Alternatives considered**: CSS-path/XPath refs (break on re-render, leak layout details); aria-ref snapshot files like Playwright (heavier than needed; we only need in-memory handles).

## R2: Snapshot content and format

**Decision**: Collect candidates — `a[href]`, `button`, `input`, `select`, `textarea`, `summary`, `[contenteditable]`, `[role=button|link|checkbox|tab|menuitem|option|switch|textbox|combobox]`, `[tabindex]` ≥ 0 — walking open shadow roots and same-origin iframes (entries marked `[frame N]`; cross-origin frames emit one `[frame inaccessible]` line). Accessible name resolution order: `aria-label` → `aria-labelledby` → associated `<label>` → text content (trimmed, ≤ 80 chars) → `placeholder`/`title`/`alt`/`value` for inputs. Role from implicit tag semantics or explicit `role`. Output: one line per element, `role "name" @eN`, capped at 300 lines with a `… truncated (N more elements)` notice. Password/sensitive inputs appear by role with no value (FR-010).

**Rationale**: One-line-per-element outline mirrors what LLM agents parse best (Playwright aria-snapshot convention) and keeps SC-003's compactness bound easy to enforce by line count.

## R3: Typing into contenteditable editors (CodeMirror/Monaco)

**Decision**: Focus the target, then:

- **Replace**: select-all (`document.execCommand("selectAll")` fallback: Range over the editable root), then dispatch a `beforeinput` `InputEvent` with `inputType: "insertReplacementText"` and `data: text` (cancelable, bubbles). Fallback if the editor ignored it (content unchanged): `document.execCommand("insertText", false, text)`.
- **Insert**: same `beforeinput` with `inputType: "insertText"` at the current caret.
- **Input/textarea**: native value setter from the element's prototype (React-compatible), then `input` + `change` bubbling events.

**Rationale**: CodeMirror 6 handles `beforeinput` `insertReplacementText`/`insertText` through its input pipeline, updating internal state (this is the same mechanism real typing and Playwright's `pressSequentially` exercise). MV3-safe: only DOM event dispatch, no eval. The native-setter path is the standard React-controlled-input workaround.

**Alternatives considered**: clipboard `paste` events (needs clipboard permissions and pollutes the user clipboard); per-editor adapters (CodeMirror-specific `view.dispatch` — requires page-context eval, blocked by CSP); `execCommand` as primary (deprecated, so kept as fallback only).

## R4: Ref-based actions on existing tools

**Decision**: Extend `clickElement`, `fillField`, `selectOption` schemas with an optional `ref` field; exactly one of `selector`/`ref` required (zod refinement). Content side resolves the ref to an element and reuses the existing click/fill/select handlers. Every ref-based result includes `{ ok, role, name }` (FR-009).

## R5: Tool surface for the snapshot

**Decision**: One new tool `snapshotPage` with optional `maxElements` (default 300). `readPage` stays for content reading; `snapshotPage` is for interaction. The tool description explicitly tells the agent to snapshot before interacting (steers behavior without protocol changes).

## R6: Testing strategy

**Decision**: jsdom unit tests for all three content modules (jsdom supports contenteditable events and `beforeinput` dispatch). One Playwright e2e spec against a locally served page (real button + contenteditable stand-in for CodeMirror) driving the tools through the real background `executeTool` path via a test conversation. SC-002's "live state reflects new content" is asserted by a test page that mirrors editor state into a DOM element through its own `beforeinput` listener (the way CM6 would).
