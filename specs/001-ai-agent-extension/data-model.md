# Data Model: AI Agent Browser Extension

**Date**: 2026-09-19 | **Spec**: [spec.md](./spec.md)

All records are stored via `chrome.storage` (sync or local area as noted). Types are
TypeScript interfaces; no `any`.

## ProviderConfig (sync storage, single record)

Connection method selection and provider settings (FR-005, FR-006, FR-013).

| Field | Type | Notes |
|-------|------|-------|
| `method` | `"api" \| "acp"` | connection method |
| `providerId` | `string` | e.g. `openai`, `kimi`, `deepseek`, `openrouter`, `custom` (api method only) |
| `baseUrl` | `string` | OpenAI-compatible endpoint; defaults per providerId, editable |
| `model` | `string` | model identifier |
| `apiKeyRef` | `string` | key under which the secret is stored in local storage (never the key itself) |
| `acp` | `{ hostName: string; token?: string }` | native host name + handshake token (acp method only) |

Validation: `baseUrl` must be https (or http on loopback); `model` non-empty; exactly one
method active.

## ApiKey (local storage, keyed by `apiKeyRef`)

| Field | Type | Notes |
|-------|------|-------|
| `key` | `string` | raw API key; never synced, never logged (FR-012) |

## Action (sync storage, collection)

Built-in and user-defined selection actions share one shape (FR-008, FR-010).

| Field | Type | Notes |
|-------|------|-------|
| `id` | `string` (uuid) | unique |
| `name` | `string` | context-menu label; 1–50 chars, unique per user |
| `prompt` | `string` | instruction template; may embed the selected text |
| `builtin` | `boolean` | built-ins (`improve-writing`, `make-formal`, `fix-grammar`) can be hidden but not deleted |
| `enabled` | `boolean` | toggles menu visibility |

Lifecycle: created → enabled/disabled → edited → deleted (custom only). Context menu is
rebuilt from enabled actions on every storage change.

## Conversation (local storage, single global record)

One conversation shared across tabs (FR-016), persistent across restarts (FR-017).

| Field | Type | Notes |
|-------|------|-------|
| `id` | `string` | constant `global` in v1 |
| `messages` | `Message[]` | append-only, oldest first |
| `screenshotConsent` | `boolean` | per-conversation opt-in; reset to `false` when the user clears the conversation (FR-004) |
| `createdAt` / `updatedAt` | `number` | epoch ms |

## Message (embedded in Conversation)

| Field | Type | Notes |
|-------|------|-------|
| `id` | `string` | uuid |
| `role` | `"user" \| "assistant" \| "tool" \| "system"` | |
| `parts` | `MessagePart[]` | text, tool-call, screenshot-image parts |
| `tabId` | `number \| null` | tab whose page context the message relates to |
| `createdAt` | `number` | |

## AgentSession (local storage, transient)

Survives service-worker restarts; cleared when the run completes or stops (Article I).

| Field | Type | Notes |
|-------|------|-------|
| `conversationId` | `string` | owning conversation |
| `state` | `"idle" \| "planning" \| "acting" \| "verifying" \| "done" \| "stopped" \| "error"` | deterministic loop state |
| `iteration` | `number` | must never exceed `maxIterations` |
| `maxIterations` | `number` | default 25 (FR-007, SC-006) |
| `pendingToolCall` | `ToolCall \| null` | tool awaiting execution/result |

State transitions: `idle → planning → acting → verifying → planning … → done|stopped|error`.
`stopped` is forced when `iteration >= maxIterations`.

## ToolCall (embedded)

| Field | Type | Notes |
|-------|------|-------|
| `name` | `string` | `readPage`, `fillField`, `clickElement`, `selectOption`, `captureScreenshot` |
| `arguments` | `Record<string, unknown>` | validated per tool schema before execution |
| `tabId` | `number` | target tab |

## Relationships

- `ProviderConfig.apiKeyRef` → `ApiKey` (local, optional when method = `acp`)
- `Conversation` 1—n `Message`
- `AgentSession` n—1 `Conversation` (at most one active session per conversation)
