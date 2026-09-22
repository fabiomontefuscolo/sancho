# Implementation Plan: Custom Instructions

**Branch**: `008-custom-instructions` | **Date**: 2026-09-22 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/008-custom-instructions/spec.md`

## Summary

Add a user-editable "Custom instructions" field (options page) whose content is injected as a leading system message into every chat request — AGENTS.md-style persistent behavioral guidance. Storage follows the existing `uiPrefs` pattern in `chrome.storage.sync` (new `customInstructions` string key, 4,000-char cap). Injection happens in `buildProviderMessages` (built-in/Copilot path, before the clock message) and in the ACP provider's preamble. Selection Actions are untouched by design. No bridge protocol changes — the options UI reads/writes storage directly.

## Technical Context

**Language/Version**: TypeScript 5.6, strict mode (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`)

**Primary Dependencies**: React 18.3, WXT 0.19, `ai` SDK 5; no new dependencies

**Storage**: chrome.storage.sync — new key `customInstructions` (string, max 4,000 chars)

**Testing**: Vitest 3 + @testing-library/react (jsdom) for unit/component; coverage gates ≥80% on `src/agent`, `src/providers`, `src/storage`

**Target Platform**: Manifest V3 Chrome/Brave extension (side panel + options page)

**Project Type**: Browser extension

**Performance Goals**: No measurable latency added to chat send (one extra sync-storage read per run, ~1 ms)

**Constraints**: All background work event-driven (MV3); sync storage quotas (~8 KB/item, 120 writes/min sustained) drive the char cap and debounced save; instructions must never be persisted into conversation history

**Scale/Scope**: ~5 source files touched, 1 new component, 1 new storage module section, 3 test files updated/added

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                           | Gate                                                                                                                                                                           | Status  |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| I. MV3 core architecture            | Instructions read fresh per run inside the event-driven chat handler; no new in-worker state                                                                                   | ✅ PASS |
| II. Unified multi-provider layer    | Injection happens in `buildProviderMessages` above the provider interface; `BaseLLMProvider` contract unchanged; ACP receives instructions via its existing preamble mechanism | ✅ PASS |
| III. Local agent / ACP              | ACP preamble extended in `acp.ts`; transport and auth untouched                                                                                                                | ✅ PASS |
| IV. Browser automation & security   | No page-interaction surface added; user-authored text only                                                                                                                     | ✅ PASS |
| V. React UI & state sync            | New options section reads/writes chrome.storage.sync directly with an `onChanged` listener (same pattern as `AppearanceSection`)                                               | ✅ PASS |
| VI. Typing, hygiene & quality gates | Strict typing, no `any`; unit tests for storage + injection, component test for the section; coverage gates retained                                                           | ✅ PASS |

No violations; Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/008-custom-instructions/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── request-prelude.md  # Phase 1 output (prompt prelude composition)
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── storage/
│   └── settings.ts            # customInstructions key + get/save/onChanged + MAX_CUSTOM_INSTRUCTIONS
├── agent/
│   └── chat-handler.ts        # buildProviderMessages prepends instructions system message
├── providers/
│   └── acp.ts                 # preamble includes instructions when non-empty
├── ui/
│   └── components/
│       └── custom-instructions-section.tsx  # NEW: textarea + counter, debounced save
entrypoints/
└── options/
    └── main.tsx               # nav anchor + section mount (#instructions)

tests/
├── unit/
│   ├── storage.test.ts        # round-trip, default, normalization, clamp
│   ├── chat-flow.test.ts      # injection order, absent-when-empty, live-edit pickup
│   └── acp.test.ts            # preamble includes/excludes instructions
└── component/
    └── custom-instructions-section.test.tsx  # NEW: render/edit/counter/save flow
```

**Structure Decision**: Existing single-project extension layout; one new UI component following the `AppearanceSection` pattern, one new storage key following the `uiPrefs` pattern. No new directories.

## Design Details

### Storage (`src/storage/settings.ts`)

- Key: `customInstructions` (plain string, not an object — no other fields needed).
- `export const MAX_CUSTOM_INSTRUCTIONS = 4000;`
- `normalizeCustomInstructions(raw: unknown): string` — non-string → `""`; string → `raw.slice(0, MAX_CUSTOM_INSTRUCTIONS)`.
- `getCustomInstructions(): Promise<string>` (normalized), `saveCustomInstructions(text)` (stores trimmed, clamped value), `onCustomInstructionsChanged(listener)` mirroring `onUiPrefsChanged`.

### Injection — built-in/Copilot path (`src/agent/chat-handler.ts`)

`buildProviderMessages` becomes:

```text
[instructions?] + [systemClockMessage] + [...history]
```

- Read via `getCustomInstructions()` at message-build time (per run) → edits apply to the next turn automatically (FR-006).
- When non-empty, prepend `{ role: "system", content: `Custom instructions from the user (follow these in every reply):\n${instructions}` }` as index 0; clock message shifts to index 1 (FR-004 ordering).
- Empty/whitespace → no message added (FR-005).
- Instructions are never written into `conversation.messages` (FR-009) — they exist only in the transient request payload.

### Injection — ACP path (`src/providers/acp.ts`)

In `streamChat`, extend the preamble construction: when `getCustomInstructions()` returns non-empty, append `User's custom instructions: ${instructions}` to the preamble block before the user message text. Applies equally on fresh prompts and context-rebuild retries (FR-007).

### Options UI (`custom-instructions-section.tsx`)

- Mirrors `AppearanceSection`: direct storage access + `onChanged` subscription, no background bridge.
- Elements: `<h2>Custom instructions</h2>`, hint text ("Instructions the agent follows in every chat, like an AGENTS.md file."), `<textarea maxLength={4000}>` (browser-enforced cap, FR-002), live counter `123 / 4000`.
- Save strategy: debounced write (~600 ms after last keystroke) + immediate save on blur, to respect sync storage write quotas; transient "Saved" indicator after each successful write.
- Mounted in `entrypoints/options/main.tsx` between Appearance and Actions with `#instructions` nav anchor.

### Out of scope (per spec)

- Selection Actions path (`src/agent/actions.ts`) — deliberately untouched (FR-008).
- Side panel settings view — options page only.
- Per-conversation instructions — single global field only.
