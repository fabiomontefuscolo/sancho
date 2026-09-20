# Tool Contract: Page Interaction Tools (005)

Observable behavior of the new/changed agent tools. All results are JSON-serializable values returned through `executeTool`.

## snapshotPage

1. Returns `{ elements, truncated }`; every entry has `ref`, `role`, `name`, `frame`.
2. Only interactive elements appear (links, buttons, inputs, selects, textareas, contenteditables, ARIA-widget roles, tabindex ≥ 0, summary); password/sensitive fields appear with role and name but never their value.
3. Output is capped (default 300); truncation is reported in `truncated`.
4. Same-origin iframes contribute entries marked with their frame; cross-origin frames produce exactly one inaccessible marker line.

## clickElement / fillField / selectOption (extended)

5. Accept `ref` as an alternative to `selector`; supplying neither or both is a validation error.
6. A `ref` is re-resolved at action time: a stale ref returns `{ ok: false, error: "stale reference" }` and acts on nothing.
7. Successful ref-based results include `{ ok: true, role, name }` of the acted element.
8. Selector-based behavior is unchanged (backward compatible).

## setEditorText

9. `mode: "replace"` on a contenteditable editor replaces all content such that the editor's own input pipeline observes the change (its internal state updates, verifiable by the host app's behavior).
10. `mode: "insert"` inserts at the caret, preserving surrounding content.
11. On plain inputs/textareas it sets the value and fires `input` and `change` bubbling events.
12. Works inside open shadow roots (targets resolved by snapshot refs already pierce them).
13. On a missing/stale target returns `{ ok: false, error }` and changes nothing.

## Non-goals

- No long-lived element bookmarks; refs die with the page.
- No cross-origin iframe interaction.
- No per-site adapters or hardcoded editor integrations.
