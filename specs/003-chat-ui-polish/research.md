# Research: Chat UI Polish

## R1 — Timestamp source and display

**Decision**: Use the existing `Message.createdAt` (epoch ms, already required and persisted since feature 001) mapped through `toThreadMessage()` into assistant-ui's `ThreadMessageLike.createdAt`, and render it with a small presentational component inside `MessagePrimitive.Root`.

**Rationale**: `src/types.ts:50-57` already carries `createdAt`; `src/ui/hooks/useSanchoRuntime.ts:8-22` already passes it to the runtime. assistant-ui 0.11 exposes the current message to descendants of `MessagePrimitive.Root` (via `useMessage`), so no protocol, storage, or data-model change is needed. The clarification (legacy messages show nothing) is defensive: every stored message in practice has `createdAt`; the render guard (`if (!createdAt) return null`) satisfies FR-005's no-backfill rule for any record lacking one.

**Alternatives considered**: adding a new persisted field (rejected — duplicate data, migration churn); computing display time at send time (rejected — loses the real instant for reloaded history).

**Format**: new `formatMessageTime(epochMs)` in a shared UI util producing exactly `Sat Sep 19 22:56` (locale weekday short + month short + day + 24h HH:MM via `Intl.DateTimeFormat`). Distinct from `src/agent/time.ts#formatTimestamp` (agent-context bracket format); not reused to avoid coupling agent prompt formatting to UI copy.

## R2 — Full-bleed single-scrollbar layout

**Decision**: Pure CSS fix in `src/ui/components/chat.css` (and the conversation list stylesheet): reset `html, body, #root` to `margin:0; height:100%; overflow:hidden`, keep `.sancho-chat-root` as `height:100vh` flex column, and make `ThreadPrimitive.Viewport` the only scroll container (`flex:1; min-height:0; overflow-y:auto; overflow-x:hidden`).

**Rationale**: the double scrollbar comes from the browser's default 8px body margin plus a growing flex child; assistant-ui's `ThreadPrimitive.Viewport` is already the designated scroll region — the fix is constraining everything above it, not adding custom scroll logic (FR-010).

**Alternatives considered**: `overscroll-behavior`/JS scroll management (rejected — custom solution where CSS suffices).

## R3 — Horizontal overflow containment

**Decision**: CSS containment, three rules on existing classes: messages get `min-width:0; max-width:100%` within the viewport's column flex; image parts `max-width:100%; height:auto; display:block`; code/pre and long unbroken text contained with `pre { overflow-x:auto; max-width:100% }` and `overflow-wrap:anywhere` on text.

**Rationale**: no renderer change needed — assistant-ui's default image part emits a plain `<img>` and text parts flow into the existing bubble divs; the guards hold regardless of whether a markdown renderer is introduced later.

**Alternatives considered**: custom `MessagePrimitive.Parts` components per part type (rejected — custom solution where the library default works; revisit only if a markdown renderer is added).

## R4 — Composer bottom gap

**Decision**: `padding-bottom` on `.sancho-composer` (e.g. 12px total bottom padding), no structural change.

## R5 — Conversation list full width

**Decision**: same body/root reset plus removing side margins in `conversation-list` styles so FR-001 holds for every view (list, chat, error, prompt, consent banner).
