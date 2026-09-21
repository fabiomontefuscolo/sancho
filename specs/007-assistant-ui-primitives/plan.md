# Implementation Plan: Assistant-UI Primitives Alignment & Settings Polish

**Branch**: `007-assistant-ui-primitives` | **Date**: 2026-09-21 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/007-assistant-ui-primitives/spec.md`

## Summary

Refactor the side-panel chat UI onto the current assistant-ui 0.15.x primitives: ChatGPT-style composer with stop control, per-message action bar (copy/regenerate), accessible in-message error display, grouped thought-process rendering (reasoning + tool calls, live-only), ThreadList-based conversation list, plus a settings-page Appearance section and thread polish (scroll-to-bottom, welcome state). The bridge protocol gains a `part` discriminator on `chat.delta`, a flattened `chat.tool` payload, `messageId` on `chat.error`, and a new `chat.regenerate` op. No storage schema changes — reasoning/tool parts are session-scoped and never persisted.

## Technical Context

**Language/Version**: TypeScript 5.6, strict mode (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`)

**Primary Dependencies**: `@assistant-ui/react` ^0.15.21 (from ^0.11.0), `@assistant-ui/react-markdown` ^0.14.16, `@assistant-ui/react-syntax-highlighter` ^0.14.6 (from 0.11.10), `lucide-react` (new); React 18.3, WXT 0.19, `ai` SDK 5, zod 4

**Storage**: chrome.storage.local — unchanged; no new persisted fields

**Testing**: Vitest 3 + @testing-library/react (jsdom) for unit/component; Playwright (workers: 1) for e2e; coverage gates ≥80% on `src/agent`, `src/providers`, `src/storage`

**Target Platform**: Manifest V3 Chrome/Brave extension (side panel + options page)

**Project Type**: Browser extension

**Performance Goals**: Composer/composer-state interactions at 60 fps; stop action visibly effective < 1 s

**Constraints**: All background work event-driven (MV3); reasoning availability varies by model — UI must degrade gracefully; live thought-process data must NOT be persisted to conversation history

**Scale/Scope**: Single-user side panel; ~6 UI files refactored, 3 bridge ops touched/added, 4 test files updated + new unit tests

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                         | Gate                                                                                                                                                                                                 | Status  |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| I. MV3 core architecture          | All changes live in sidepanel React UI and the existing event-driven background chat handler; no new persistent in-worker state (regenerate aborts/reuses existing run registry)                     | ✅ PASS |
| II. Unified multi-provider layer  | Reasoning extraction happens inside `OpenAICompatibleProvider.streamChat` via the AI SDK stream; provider interface gains an optional reasoning callback, keeping `BaseLLMProvider` contract uniform | ✅ PASS |
| III. Local agent / ACP            | Unchanged; ACP provider simply never emits reasoning — graceful degradation                                                                                                                          | ✅ PASS |
| IV. Browser automation & security | Unchanged; no new page-interaction surface; markdown rendering path untouched except import upgrades                                                                                                 | ✅ PASS |
| V. Testing & quality gates        | New unit tests (reasoning extraction, regenerate handler, threadList adapter), updated component/e2e suites, coverage gates retained                                                                 | ✅ PASS |
| VI. Licensing                     | No new third-party code beyond declared deps (lucide-react is ISC — GPL-compatible)                                                                                                                  | ✅ PASS |

No violations; Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/007-assistant-ui-primitives/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── bridge-messages.md  # Phase 1 output (bridge protocol changes)
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── bridge/
│   └── messages.ts            # ChatDeltaPayload.part, ChatToolPayload flatten, ChatErrorPayload.messageId, chat.regenerate op
├── providers/
│   ├── base.ts                # StreamEvents gains optional onReasoningDelta
│   └── openai-compatible.ts   # extract reasoning-delta parts from AI SDK fullStream
├── agent/
│   └── chat-handler.ts        # reasoning/tool event emission, chat.regenerate handler, error carries messageId
├── ui/
│   ├── hooks/
│   │   └── useSanchoRuntime.ts  # part-based streaming state, message status on error, onCancel/onReload, threadList adapter
│   └── components/
│       ├── chat.tsx             # composer, action bar, ErrorPrimitive, GroupedParts, ScrollToBottom, Empty, gear → options
│       ├── conversation-list.tsx  # rewrite on ThreadListPrimitive
│       ├── settings-view.tsx      # stays as in-panel "Aa" quick view (font-size)
│       ├── settings-panel.tsx     # Appearance top-level section + #appearance nav anchor
│       ├── markdown-text.tsx      # version-drift fixes only
│       ├── code-block.tsx         # version-drift fixes only
│       └── chat.css               # composer card, action bar, accordion, welcome state styles
entrypoints/
└── options/main.tsx           # nav gains Appearance anchor

tests/
├── component/                 # sidepanel, conversation-list, copy-controls, options updated
└── e2e/                       # conversations, rich-messages, agent-loop, layout updated
```

**Structure Decision**: Single WXT project, existing layout retained. All work is a refactor within `src/ui`, `src/bridge`, `src/agent`, `src/providers` — no new directories beyond the feature docs.

## Complexity Tracking

No constitution violations — section not applicable.
