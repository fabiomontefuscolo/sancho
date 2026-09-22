# Data Model: Custom Instructions

**Date**: 2026-09-22 | **Feature**: [spec.md](spec.md)

## Entity: Custom Instructions

A single global, user-authored free-form text. One per browser profile — not per conversation, not per provider.

| Attribute    | Value                                        |
| ------------ | -------------------------------------------- |
| Storage area | `chrome.storage.sync`                        |
| Key          | `customInstructions`                         |
| Type         | `string`                                     |
| Default      | `""` (empty = feature inactive)              |
| Max length   | 4,000 characters (`MAX_CUSTOM_INSTRUCTIONS`) |

### Normalization rules (applied on every read)

- Non-string or missing value → `""`
- String longer than 4,000 chars → truncated to 4,000
- Whitespace-only string → treated as empty at injection time (no message sent)

### Save rules

- Value is trimmed and clamped to 4,000 chars before writing
- The UI additionally enforces the cap via `maxLength`, so clamping is a defense-in-depth measure

### Lifecycle

- **Created**: first save from the options page
- **Read**: once per chat run in `buildProviderMessages` (built-in/Copilot path); once per prompt in `AcpProvider.streamChat` (ACP path); on options-page load and via `storage.onChanged` subscription
- **Updated**: options page edits (debounced / on blur); takes effect on the next chat message
- **Deleted**: clearing the field stores `""` (key remains; empty means inactive)

### Non-goals

- Never written into `Conversation.messages` or any persisted conversation record (FR-009)
- Never read by the selection Actions path (`src/agent/actions.ts`) (FR-008)

## Type changes

`src/types.ts`: no new interface required — the value is a plain `string`. `MAX_CUSTOM_INSTRUCTIONS` is exported from `src/storage/settings.ts` for reuse by the UI and tests.
