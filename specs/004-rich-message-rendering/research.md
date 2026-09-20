# Research: Rich Message Rendering (004)

## R1: Markdown rendering library

**Decision**: `@assistant-ui/react-markdown@0.11.10` (`MarkdownTextPrimitive`), wired as the `Text` component override of `MessagePrimitive.Parts`.

**Rationale**: Official assistant-ui companion package; its peer range `^0.11.58` matches the installed `@assistant-ui/react@0.11.58` exactly. It wraps `react-markdown` 10, which is safe-by-default (raw HTML is not rendered unless `rehype-raw` is added — we will not add it), satisfying FR-003 without a separate sanitizer. Overrides keep the runtime (`useExternalStoreRuntime`) untouched: `<MessagePrimitive.Parts components={{ Text: MarkdownText }} />` on assistant messages only.

**Alternatives considered**:

- `marked` / `markdown-it` + `dangerouslySetInnerHTML`: rejected — violates the no-markup-injection principle unless paired with a sanitizer (extra dependency, more risk).
- Upgrading `@assistant-ui/react` to 0.15 to use the latest companion packages: rejected — out of scope churn for a UI feature.
- Custom mini-parser: rejected — unjustified complexity per 003's FR-010-style rule (prefer library primitives).

## R2: GitHub-flavored markdown

**Decision**: `remark-gfm` passed via `MarkdownTextPrimitive`'s `remarkPlugins` prop.

**Rationale**: Agent output routinely contains tables, strikethrough, and autolinks; GFM is the de-facto dialect for coding assistants. `remark-gfm` is not bundled in `@assistant-ui/react-markdown@0.11.10`, so it is an explicit dependency.

## R3: Syntax highlighting

**Decision**: `@assistant-ui/react-syntax-highlighter@0.11.10` (`makePrismAsyncLightSyntaxHighlighter` / light Prism build from `react-syntax-highlighter@16`), registering a curated set: typescript, javascript, python, rust, go, java, c, cpp, json, bash (covers SC-002). Untagged/unknown languages fall back to plain `<pre><code>` with monospace styling (FR: AC4).

**Rationale**: Matches installed assistant-ui version, provides the default code-header UI pattern (language label + copy button slot) that we customize. Light async build keeps the extension bundle lean and avoids loading grammars we don't register.

**Alternatives considered**:

- Full Prism build: rejected — adds ~1MB of grammars.
- highlight.js via `react-syntax-highlighter` hljs build: viable but Prism light-async has better tree-shaking; both share the same wrapper.
- Shiki: best highlighting quality, but heavy (WASM/oniguruma) and awkward in MV3 CSP — rejected.

## R4: Copy to clipboard

**Decision**: `navigator.clipboard.writeText` in the sidebar/options extension pages, with a fallback to a temporary `<textarea>` + `document.execCommand("copy")`. Confirmation = transient "Copied" label swap on the button (~1.5s); failure shows "Copy failed" (FR-007).

**Rationale**: Extension pages can use the async clipboard API when focused (the sidebar is focused on click). No extra manifest permission needed for `clipboard.writeText` from a user gesture; the fallback covers edge environments. Raw markdown source for message copy comes from the persisted `Message.parts` text (the source of truth), not from re-serializing the DOM.

## R5: Streaming markdown

**Decision**: Render markdown on every delta via the existing `appendDelta` flow — `MarkdownTextPrimitive` re-parses the partial text each render.

**Rationale**: react-markdown handles incomplete constructs gracefully (an unclosed `**` or fence renders as plain text until closed). No special streaming mode needed for AC2/FR-002; the component test asserts a mid-stream unclosed fence doesn't break layout.

## R6: Font-size preference

**Decision**: New `chrome.storage.sync` key `uiPrefs: { fontSize: "small" | "medium" | "large" }` (default `"medium"`). Applied as a class on `.sancho-chat-root` (`sancho-font-small|medium|large`) that scales a `--chat-font-size` variable consumed by messages, code, and the composer. Edited in two places kept in sync by the storage layer itself: the existing options-page `SettingsPanel` and a new sidebar settings view (added to the existing `"chat" | "list"` view state). The sidebar subscribes via `chrome.storage.sync.onChanged` so changes from either surface apply immediately.

**Rationale**: CSS variable scaling avoids touching every component; storage.sync satisfies the survive-browsing-data-clear pattern established in 002. Class-based theming matches how 003 styles are structured.

## R7: Fonts

**Decision**: System stacks only — body: `-apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`; code: `ui-monospace, "SF Mono", "Cascadia Mono", Consolas, monospace`. No bundled or downloaded fonts (clarification 2026-09-20; also required by FR-003's no-remote-content rule).

## R8: Syntax highlighting theme

**Decision**: A single bundled Prism theme whose token colors are overridden with the existing `var(--chat-*)` CSS variables where feasible, so highlighting follows the extension's light/dark color scheme instead of shipping two themes.

**Rationale**: The sidebar already follows the system color scheme via CSS variables; duplicating Prism themes per scheme is unnecessary weight.
