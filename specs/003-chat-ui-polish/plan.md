# Implementation Plan: Chat UI Polish

**Branch**: `003-chat-ui-polish` | **Date**: 2026-09-19 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/003-chat-ui-polish/spec.md`

## Summary

Four visual fixes to the sidebar chat, done almost entirely inside assistant-ui's existing
primitives (`ThreadPrimitive`, `MessagePrimitive`, `ComposerPrimitive`) plus CSS: full-bleed
single-scrollbar layout, composer bottom gap, per-message timestamps sourced from the
already-persisted `Message.createdAt`, and horizontal-overflow containment (images fit,
`pre` scrolls internally). No protocol or storage changes.

## Technical Context

**Language/Version**: TypeScript strict, React 18
**Primary Dependencies**: @assistant-ui/react 0.11 (ExternalStoreRuntime + Thread/Message/Composer primitives)
**Storage**: unchanged (`Message.createdAt` already persisted)
**Testing**: Vitest + Testing Library (component), Playwright e2e (real layout assertions)
**Target Platform**: Chrome/Brave MV3 side panel
**Project Type**: browser extension (WXT 0.19)
**Constraints**: FR-010 — prefer assistant-ui primitives; custom code only where the library offers nothing

## Constitution Check

| Principle                      | Status | Notes                                               |
| ------------------------------ | ------ | --------------------------------------------------- |
| I. Provider-Agnostic Core      | ✅     | no provider changes                                 |
| II. Side Panel Chat Experience | ✅     | strengthens it — this feature is pure side-panel UX |
| III. Safety & Consent First    | ✅     | banner layout preserved                             |
| IV. Thin Background, Fat UI    | ✅     | all work in UI layer; background untouched          |
| V. Typed Contracts             | ✅     | no new message types; `createdAt` already typed     |
| VI. Test-First Quality         | ✅     | component tests + e2e layout assertions planned     |

No violations.

## Project Structure

### Documentation (this feature)

```text
specs/003-chat-ui-polish/
├── plan.md              # this file
├── research.md          # R1 timestamps, R2 layout, R3 overflow, R4 composer, R5 list
├── data-model.md        # no schema change; createdAt consumption
├── contracts/
│   └── ui-contract.md   # 11 visual invariants + test hooks
└── quickstart.md        # automated + manual validation
```

### Source Code (touched files)

```text
src/ui/
├── components/
│   ├── chat.tsx               # add timestamp label inside MessagePrimitive.Root (user + assistant)
│   ├── chat.css               # full-bleed reset, single scrollbar, overflow containment, composer gap
│   └── conversation-list.tsx  # full-width styles (margins removal)
├── hooks/
│   └── useSanchoRuntime.ts    # unchanged (already maps createdAt)
└── utils/
    └── format-time.ts         # NEW: formatMessageTime(epochMs) → "Sat Sep 19 22:56"

tests/
├── component/chat-timestamp.test.tsx   # NEW
└── e2e/layout.spec.ts                  # NEW: scrollbar/overflow invariants
```

## Design Decisions

1. **Timestamps via library message context (R1)**: a `MessageTimestamp` component rendered
   inside `MessagePrimitive.Root` reads the current message via assistant-ui's `useMessage`
   hook and formats `createdAt`. No custom message pipeline. Guard: missing `createdAt` →
   render nothing (FR-005 clarification).
2. **Layout via CSS only (R2, R4, R5)**: `html,body,#root { margin:0; height:100%; overflow:hidden }`;
   viewport stays the sole scroll region (`overflow-y:auto; overflow-x:hidden; min-height:0`);
   composer gets bottom padding. `ThreadPrimitive.Viewport` is the library's designated
   scroller — no custom scroll containers.
3. **Overflow containment via CSS (R3)**: bubbles `min-width:0; max-width:100%`;
   `img { max-width:100%; height:auto }`; `pre { overflow-x:auto; max-width:100% }`;
   `overflow-wrap:anywhere` on text. Holds regardless of renderer (no markdown renderer
   currently; guards are future-proof).
4. **Format util separated from agent time util**: `src/agent/time.ts#formatTimestamp`
   (bracketed, agent-context) is not reused; new `formatMessageTime` matches the spec's
   `EEE MMM d HH:mm` shape exactly.

## Phase 1 Artifacts

- `research.md` — R1–R5 resolved, no NEEDS CLARIFICATION remains
- `data-model.md` — no schema change documented
- `contracts/ui-contract.md` — 11 invariants, test hooks
- `quickstart.md` — validation guide

## Post-Design Constitution Check

All six principles still pass; nothing in the design introduces violations.
