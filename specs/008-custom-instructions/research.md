# Research: Custom Instructions

**Date**: 2026-09-22 | **Feature**: [spec.md](spec.md)

## R1. Injection point for built-in providers

**Decision**: Inject in `buildProviderMessages` (`src/agent/chat-handler.ts:119-133`), not inside providers.

**Rationale**: That function already builds the full per-run message array (`[systemClockMessage, ...history]`) and runs once per user turn (`src/agent/loop.ts:63`). Reading settings there gives live-edit pickup (FR-006) for free, keeps `BaseLLMProvider` untouched, and matches FR-018's existing clock-message precedent from spec 001.

**Alternatives rejected**: Injecting inside `OpenAICompatibleProvider.streamChat` would leak settings concerns into the provider layer and require duplicating the logic in the Copilot path; persisting a system message into conversation history would violate FR-009 (edits would retroactively alter history).

## R2. Exactly-once semantics

**Decision**: "Once" = a single instruction message at the top of each request prelude.

**Rationale**: Providers are stateless HTTP chat-completions calls; the full conversation is re-sent every turn, so the instructions must be present in every request to remain in effect. They appear exactly once per request (FR-004) — the AGENTS.md analogy the user asked for.

## R3. Storage location and size cap

**Decision**: `chrome.storage.sync`, key `customInstructions`, plain string, hard cap of 4,000 characters (`MAX_CUSTOM_INSTRUCTIONS`), clamped on read via a normalizer (same hand-rolled pattern as `normalizeUiPrefs` — zod is not used for settings in this codebase).

**Rationale**: FR-010 requires cross-device sync; all other non-secret settings already live in sync storage (`providerConfig`, `actions`, `uiPrefs`). Sync storage quotas: 8,192 bytes/item (`QUOTA_BYTES_PER_ITEM`), 120 sustained writes/min. 4,000 chars stays safely under the byte limit even for multi-byte UTF-8 (4,000 × 2 bytes = 8,000 < 8,192 worst case for BMP characters; supplementary-plane characters could exceed it, so the byte margin is the reason we don't go closer to 8 KB).

**Alternatives rejected**: `chrome.storage.local` (no sync, violates FR-010); no cap (risks silent `set()` failures at the quota boundary).

## R4. Save strategy for the textarea

**Decision**: Debounced save (~600 ms after the last keystroke) plus immediate save on blur, with a transient "Saved" indicator.

**Rationale**: Per-keystroke writes (the `AppearanceSection` select pattern) would hit sync storage's 120 writes/min sustained quota during normal typing. Debounce keeps the UX auto-saving while staying far under quota.

**Alternatives rejected**: Explicit Save button (more friction, inconsistent with the auto-save feel of the other sections); un-debounced writes (quota risk).

## R5. Message content format

**Decision**: Wrap the raw user text: `Custom instructions from the user (follow these in every reply):\n<text>`.

**Rationale**: A labeled header helps the model distinguish standing user policy from conversation content and from the clock/tab context message. The clock message stays a separate system message so existing tests and behavior around it remain identifiable.

## R6. ACP path

**Decision**: Extend the existing preamble in `AcpProvider.streamChat` (`src/providers/acp.ts:264-286`) with the instructions text when non-empty; applies on both fresh prompts and context-rebuild retries.

**Rationale**: ACP agents are prompted by appending context to the last user message text (there is no system role in the ACP prompt flow); the preamble is the established channel. Reading settings inside `streamChat` keeps per-run freshness.

## R7. Selection Actions exclusion

**Decision**: No changes to `src/agent/actions.ts`; `runSelectionAction` keeps sending a bare single user message.

**Rationale**: Confirmed with the user. One-shot actions frequently replace selected text in-place; global conversational instructions (e.g., "always explain your reasoning") would corrupt replacement output.

## R8. Options UI pattern

**Decision**: New `CustomInstructionsSection` component cloned from `AppearanceSection` (direct storage access + `onChanged` subscription, no background bridge), mounted in `entrypoints/options/main.tsx` between Appearance and Actions with a `#instructions` nav anchor.

**Rationale**: `AppearanceSection` is the proven pattern for a simple storage-backed setting; the port-bridge used by `SettingsPanel`/`ActionManager` is unnecessary overhead for a single sync-storage string.
