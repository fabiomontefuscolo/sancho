# Implementation Plan: Rich Message Rendering

**Branch**: `004-rich-message-rendering` | **Date**: 2026-09-20 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/004-rich-message-rendering/spec.md`

## Summary

Render agent messages as sanitized markdown with syntax-highlighted code blocks, add copy controls (raw markdown per message, exact code per block), and switch typography to readable system font stacks with a persisted font-size preference editable from both a new sidebar settings view and the existing options page. Rendering plugs into the existing assistant-ui `MessagePrimitive.Parts` via its official markdown/syntax-highlighter companion packages pinned to the installed `@assistant-ui/react` 0.11.x line. UI-only feature: no background, protocol, or storage-schema changes beyond one new `uiPrefs` sync key.

## Technical Context

**Language/Version**: TypeScript 5 (strict mode), React 18

**Primary Dependencies**: WXT 0.19 (MV3), assistant-ui 0.11.58 (`MessagePrimitive.Parts`, `useMessage`), `@assistant-ui/react-markdown` 0.11.10, `@assistant-ui/react-syntax-highlighter` 0.11.10, `react-syntax-highlighter` 16 (Prism light build), `remark-gfm`, React 18

**Storage**: `chrome.storage.sync` (existing `providerConfig`; new `uiPrefs` key) — survives clearing browsing data; no `chrome.storage.local` schema change

**Testing**: Vitest + @testing-library/react (component) + jsdom; Playwright `chromium-extension` project (real extension e2e, `workers: 1`, extension loaded from `.output/chrome-mv3/` — run `pnpm build` first)

**Target Platform**: Chromium MV3 extension sidebar (`sidepanel.html`) + options page (`options.html`)

**Performance Goals**: 100 markdown-rich messages render < 1s and scroll smoothly (SC-005)

**Constraints**: No remote content loads at runtime (FR-003 — no web fonts, no remote images from markup execution); react-markdown safe-by-default (no `rehype-raw`); 003 layout guarantees preserved (single scrollbar, no horizontal list scroll); bundle stays reasonable via Prism light build with a curated language set

**Scale/Scope**: Sidebar chat panel UI only

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| #   | Principle                     | Verdict                                                                                                                 |
| --- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| I   | No markup injection           | PASS — react-markdown renders no raw HTML by default; `rehype-raw` is not used; unsafe markup degrades to text (FR-003) |
| II  | Local-first, explicit consent | PASS — UI-only; no new data flows                                                                                       |
| III | Provider-agnostic             | PASS — rendering is independent of provider                                                                             |
| IV  | No capability claims in UI    | PASS — copy/feedback labels state only what happened                                                                    |
| V   | Tests are executable          | PASS — component tests for rendering/copy/settings; e2e for clipboard + persistence                                     |
| VI  | Build/lint/test gates         | PASS — unchanged                                                                                                        |

## Project Structure

### Documentation (this feature)

```text
specs/004-rich-message-rendering/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── ui-contract.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── ui/
│   ├── components/
│   │   ├── chat.tsx              # add MarkdownText part override, message copy control, settings view
│   │   ├── chat.css              # markdown styles, code block styles, font-size scale, copy controls
│   │   ├── markdown-text.tsx     # NEW: MarkdownTextPrimitive config (remark-gfm, components map)
│   │   ├── code-block.tsx        # NEW: highlighted code block + language label + copy button
│   │   ├── copy-button.tsx       # NEW: shared copy control with confirmation
│   │   ├── settings-panel.tsx    # extend: font-size select (options page)
│   │   └── settings-view.tsx     # NEW: sidebar settings view (font-size control)
│   └── hooks/
│       └── use-ui-prefs.ts       # NEW: uiPrefs sync read/write + live subscription
├── storage/
│   └── settings.ts               # add uiPrefs key + defaults
└── types.ts                      # UiPrefs type (fontSize: 'small'|'medium'|'large')

tests/
├── component/
│   ├── markdown-rendering.test.tsx   # rendering, sanitization, streaming
│   ├── copy-controls.test.tsx        # message + code copy, failure feedback
│   └── font-size.test.tsx            # setting application + persistence wiring
└── e2e/
    └── rich-messages.spec.ts         # clipboard content, font-size persistence, no-hscroll
```

**Structure Decision**: UI-only feature; all new code under `src/ui/` + one storage key. No changes to `entrypoints/background.ts`, `src/agent/`, or the message envelope protocol.

## Complexity Tracking

No constitution violations — section intentionally empty.
