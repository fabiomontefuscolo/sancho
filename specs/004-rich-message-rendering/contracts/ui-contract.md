# UI Contract: Rich Message Rendering (004)

Observable invariants for the sidebar chat panel. Extends the 003 contract; all 003 invariants still hold.

## Markdown rendering (assistant messages)

1. Headings, lists, links, emphasis, blockquotes, and fenced code render as formatted elements; no raw markdown syntax characters are visible for well-formed input.
2. During streaming, partial markdown never breaks layout; unclosed constructs render as plain text until closed.
3. Raw HTML and script-like markup in a message never executes and never loads remote resources; it is stripped or shown as text.
4. Rendered markdown never introduces horizontal scrolling of the message list; wide tables/code stay contained within the message.

## Code blocks

5. A fenced block tagged with a registered language shows visible syntax highlighting and a header with the language label.
6. An untagged or unknown-language block renders as plain monospaced code, error-free.
7. Every code block has a copy control at its top right; activating it places exactly the code content (no fences) on the clipboard and shows a brief confirmation; on failure it shows failure feedback.
8. Code lines wider than the block scroll horizontally within the block only.

## Message copy

9. Every assistant message has a copy control at its top right; activating it places the message's raw markdown source verbatim on the clipboard, with the same confirmation/failure feedback as code copy.

## Typography

10. Body text uses the system UI font stack; code uses a system monospaced stack; no font files are fetched or bundled.
11. The font-size preference (`small`/`medium`/`large`, default `medium`) is editable from both the sidebar settings view and the options page; a change in either surface applies to the sidebar within one second without reload, and persists across extension reloads.
12. At every font-size setting, messages, code blocks, timestamps, and the composer remain laid out correctly (003 invariants intact).

## Non-goals

- User-authored messages stay plain text (no markdown rendering, no copy affordance).
- Editing the rendered markdown is out of scope.
