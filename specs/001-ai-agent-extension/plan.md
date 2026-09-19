# Implementation Plan: AI Agent Browser Extension

**Branch**: `001-ai-agent-extension` | **Date**: 2026-09-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-ai-agent-extension/spec.md`

## Summary

A Manifest V3 Chrome extension hosting an AI agent: a React side-panel chat (assistant-ui)
backed by an event-driven background service worker that runs a deterministic, capped
tool loop (Plan → Act → Verify). Providers are user-configured OpenAI-compatible cloud
APIs (Vercel AI SDK, BYO key) or a local ACP agent over Native Messaging
(`@agentclientprotocol/sdk`). Page interaction happens in a least-privilege, on-demand
content script using native browser events; screenshots are in-memory and gated by
per-conversation consent. Context-menu selection actions (built-in and user-defined)
transform selected text; settings and actions live in sync storage, secrets and history
in local storage.

## Technical Context

**Language/Version**: TypeScript 5.x, `strict: true`, `any` banned

**Primary Dependencies**: WXT (MV3 framework), React 18+, `assistant-ui`
(`@assistant-ui/react`), Vercel AI SDK v5 (`ai`, `@ai-sdk/openai-compatible`),
`@agentclientprotocol/sdk`, Zod (tool schemas)

**Storage**: `chrome.storage.sync` (settings, custom actions) + `chrome.storage.local`
(API keys, conversation history, transient agent session) via WXT typed storage

**Testing**: Vitest + React Testing Library (unit/component, ≥80% coverage on
orchestration); Playwright persistent-context E2E with the extension loaded

**Target Platform**: Chrome/Chromium, Manifest V3 (side panel, service worker, on-demand
content scripts)

**Project Type**: browser extension

**Performance Goals**: first streamed token < 5s (SC-001); selection actions < 10s
(SC-002); agent loop capped at 25 iterations (SC-006)

**Constraints**: MV3 CSP (no remote code, no `eval`); no persistent in-memory state in
the service worker; screenshots in-memory only, per-conversation opt-in; least-privilege
scripting injection

**Scale/Scope**: single user, one global conversation, ~6 entrypoints (background, side
panel, options, content script), 5 agent tools

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Status |
|-----------|------|--------|
| I. MV3 architecture | Event-driven background; session state in `chrome.storage.local`; least-privilege `content.js` | PASS — AgentSession persisted in local storage; content script injected on demand |
| II. Unified provider layer | `BaseLLMProvider` abstraction; deterministic loop with caps | PASS — AI SDK wrapped by `BaseLLMProvider`; loop capped at 25 iterations |
| III. ACP integration | JSON-RPC via official SDK; authenticated local channel | PASS — Native Messaging host with token handshake |
| IV. Automation security | Chunked/minified page reads; native events; in-memory screenshots with opt-in | PASS — enforced by tool contracts (`captureScreenshot` consent gate) |
| V. React UI sync | UI mirrors service-worker state via runtime bridge | PASS — assistant-ui `ExternalStoreRuntime` over a `chrome.runtime` port |
| VI. Hygiene & gates | strict TS, ESLint+Prettier hooks, ≥80% coverage, no `eval` | PASS — toolchain and gates in Technical Context |

No violations → Complexity Tracking not required. Post-design re-check: PASS (unchanged).

## Project Structure

### Documentation (this feature)

```text
specs/001-ai-agent-extension/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── runtime-messages.md
│   ├── tools.md
│   └── acp-transport.md
└── tasks.md             # Phase 2 output (/speckit.tasks - NOT created here)
```

### Source Code (repository root)

```text
entrypoints/                    # WXT entrypoints
├── background.ts               # orchestrator: tool loop, providers, screenshot capture
├── sidepanel/
│   ├── index.html
│   └── main.tsx                # assistant-ui chat, ExternalStoreRuntime bridge
├── options/
│   ├── index.html
│   └── main.tsx                # settings page styled like browser settings
└── content.ts                  # DOM ops: read, fill, click, select, selection replace

src/
├── providers/
│   ├── base.ts                 # BaseLLMProvider abstract class
│   ├── openai-compatible.ts    # AI SDK-backed cloud providers
│   └── acp.ts                  # @agentclientprotocol/sdk over Native Messaging
├── agent/
│   ├── loop.ts                 # Plan → Act → Verify state machine (capped)
│   └── tools.ts                # Zod schemas + executors for the 5 tools
├── storage/
│   ├── settings.ts             # sync area: ProviderConfig, Action
│   └── local.ts                # local area: ApiKey, Conversation, AgentSession
├── bridge/
│   └── messages.ts             # typed Envelope + port helpers (contracts/runtime-messages.md)
└── ui/
    ├── components/             # assistant-ui primitives + shared UI
    └── hooks/

tests/
├── unit/                       # Vitest: loop, providers, tool executors, storage
├── component/                  # RTL: sidepanel + options flows
└── e2e/                        # Playwright: extension loaded, context-menu + form fill
```

**Structure Decision**: WXT convention (`entrypoints/` + shared `src/`), single MV3
target. Tests split by layer to enforce the constitution's coverage gates on
`src/agent/`, `src/providers/`, and `src/storage/`.

## Artifacts

- [research.md](./research.md) — all technical decisions resolved
- [data-model.md](./data-model.md) — entities, fields, lifecycle
- [contracts/runtime-messages.md](./contracts/runtime-messages.md) — UI/background/content messaging
- [contracts/tools.md](./contracts/tools.md) — agent tool schemas and loop invariants
- [contracts/acp-transport.md](./contracts/acp-transport.md) — local agent transport & handshake
- [quickstart.md](./quickstart.md) — end-to-end validation scenarios
