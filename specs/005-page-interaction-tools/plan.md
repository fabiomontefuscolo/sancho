# Implementation Plan: Page Interaction Tools

**Branch**: `005-page-interaction-tools` | **Date**: 2026-09-20 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/005-page-interaction-tools/spec.md`

## Summary

Give the agent two new capabilities: (A) a `snapshotPage` tool that returns a bounded, ARIA-style outline of the page's interactive elements with stable ephemeral references, with `clickElement`/`fillField`/`selectOption` extended to accept those references (re-resolved at action time, staleness reported); (B) a `setEditorText` tool that replaces or inserts text via synthetic input events so contenteditable-based editors (CodeMirror, Monaco) update their internal state, while plain inputs keep working with framework-compatible events. All logic lives in the existing on-demand content script; tool wiring reuses the established `toolDefinitions` + `executeTool` + `sendToContent` path. No new permissions, no manifest changes, no UI changes.

## Technical Context

**Language/Version**: TypeScript 5 (strict mode)

**Primary Dependencies**: WXT 0.19 (MV3, `chrome.scripting` on-demand content injection), zod 4 (tool arg schemas); no new runtime dependencies

**Storage**: None — refs are ephemeral, held in the content-script isolated world per tab (WeakRef registry); nothing persisted

**Testing**: Vitest + jsdom (unit: snapshot building, ref registry, editor text insertion); Playwright `chromium-extension` e2e against a locally served test page with a real contenteditable (CodeMirror stand-in) and labeled buttons

**Target Platform**: Chromium MV3; content script on arbitrary http(s) pages

**Performance Goals**: snapshot on a 500+ node page returns < 2s and ≤ ~300 outline lines (SC-003)

**Constraints**: MV3 CSP — no eval/new Function; interaction via dispatched DOM events only; no remote code; cross-origin iframes reported inaccessible; open shadow roots pierced

**Scale/Scope**: agent tool surface only (background `src/agent/tools.ts` + content script); no sidebar UI changes

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| #   | Principle                     | Verdict                                                                                                           |
| --- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| I   | No markup injection           | PASS — content script reads the DOM and dispatches input events; no HTML is injected, no eval                     |
| II  | Local-first, explicit consent | PASS — acts on the active tab like existing tools; no new data leaves the browser; consent model unchanged        |
| III | Provider-agnostic             | PASS — tools are advertised through the existing provider-neutral `ToolDefinition` path (OpenAI-compatible + ACP) |
| IV  | No capability claims in UI    | PASS — tool descriptions state exactly what they do (bounded snapshot, synthetic typing)                          |
| V   | Tests are executable          | PASS — jsdom unit tests for content logic; e2e on a real served page                                              |
| VI  | Build/lint/test gates         | PASS — unchanged                                                                                                  |

## Project Structure

### Documentation (this feature)

```text
specs/005-page-interaction-tools/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── tool-contract.md
└── tasks.md
```

### Source Code (repository root)

```text
entrypoints/
└── content.ts                # wire new message types into the existing switch

src/
├── agent/
│   └── tools.ts              # add snapshotPage + setEditorText definitions; extend click/fill/select schemas with optional ref; route in executeTool
└── content/
    ├── snapshot.ts           # NEW: interactive-element collection, accessible-name computation, outline serialization, truncation
    ├── refs.ts               # NEW: ref registry (WeakRef map), resolve/stale detection, per-tab lifetime
    └── edit-text.ts          # NEW: setEditorText — focus + beforeinput/insertText events; input/textarea native-setter path with framework events

tests/
├── unit/
│   ├── snapshot.test.ts      # outline contents, naming, truncation, shadow DOM, sensitive-field exclusion
│   ├── refs.test.ts          # registry lifetime, stale detection
│   └── edit-text.test.ts     # contenteditable replace/insert, input/textarea events
└── e2e/
    └── page-tools.spec.ts    # real served page: snapshot→click-by-ref, CodeMirror-like contenteditable replace, stale ref error
```

**Structure Decision**: Content-script logic is factored into `src/content/*` modules (pure, jsdom-testable) and wired by thin message cases in `entrypoints/content.ts`, following the existing single-injection `sendToContent` pattern. Background changes are confined to `src/agent/tools.ts`.

## Complexity Tracking

No constitution violations — section intentionally empty.
