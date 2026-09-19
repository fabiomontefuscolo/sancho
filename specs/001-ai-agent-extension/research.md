# Research: AI Agent Browser Extension

**Date**: 2026-09-19 | **Spec**: [spec.md](./spec.md)

## Decision 1: Extension framework & build tooling

- **Decision**: WXT (Vite-based MV3 framework) with the React template.
- **Rationale**: First-class Manifest V3 support (side panel, service-worker background,
  dynamically injected content scripts), typed `browser` APIs, built-in storage wrapper
  over `chrome.storage`, per-entrypoint bundling that satisfies MV3 CSP (no remote code,
  no eval), and HMR during development. Keeps us in control (unlike Plasmo's heavier
  abstraction) while removing manifest/bundling boilerplate (unlike raw CRXJS).
- **Alternatives considered**: CRXJS + Vite (more manual manifest work), Plasmo (more
  magic, weaker control over CSP/entrypoints), esbuild by hand (too much tooling debt).

## Decision 2: Chat UI

- **Decision**: `assistant-ui` (`@assistant-ui/react`) with a custom
  `ExternalStoreRuntime` bridged to the background service worker over a
  `chrome.runtime` port.
- **Rationale**: User-mandated. Production-grade chat UX (streaming, markdown, tool-call
  rendering, attachments) as composable React primitives; strongly typed; MIT licensed.
  `ExternalStoreRuntime` lets the background worker remain the single source of truth
  (constitution Article V) — the UI only mirrors conversation state it receives.
  Styles ship locally (Tailwind/shadcn-flavored components copied into the repo), so MV3
  CSP is satisfied.
- **Alternatives considered**: Hand-rolled chat UI (slow, accessibility debt), Vercel AI
  Elements (couples to Next.js server components), chat-ui-kit (unmaintained).

## Decision 3: LLM provider layer

- **Decision**: Vercel AI SDK v5 (`ai` + `@ai-sdk/openai-compatible`) executed in the
  background service worker, wrapped by our own `BaseLLMProvider` abstract class.
- **Rationale**: `@ai-sdk/openai-compatible` covers OpenAI, Kimi, Deepseek, OpenRouter
  and any custom base URL with a single client factory (BYO key + endpoint), satisfying
  the spec's "probably already a good library" hint. The AI SDK provides streaming and
  `tools` with Zod schemas, which maps cleanly onto our deterministic tool loop. Our
  `BaseLLMProvider` wrapper preserves constitution Article II (uniform message schema,
  provider-agnostic orchestration) and gives the ACP provider the same interface.
- **Alternatives considered**: LangChain.js (heavyweight, poor fit for service worker),
  hand-written fetch per provider (duplicated streaming/tool-call parsing, exactly what
  Article II forbids).

## Decision 4: Local agent (ACP) transport

- **Decision**: `@agentclientprotocol/sdk` (official TypeScript SDK) in the background
  worker, transported over Native Messaging (`chrome.runtime.connectNative`) stdio pipes
  to a user-installed host script that spawns/bridges to the local ACP agent daemon.
- **Rationale**: ACP is NDJSON over stdio; browsers cannot open raw stdio, and Native
  Messaging is the only MV3-sanctioned stdio channel. A tiny host script also supplies
  the token handshake required by constitution Article III. WebSocket-to-loopback was
  rejected as primary transport because pages/ports are probe-able; Native Messaging
  keeps the channel off the network entirely.
- **Alternatives considered**: WebSocket to `127.0.0.1` with token auth (kept as a future
  fallback transport), chrome.debugger (unrelated, wrong tool).

## Decision 5: Storage

- **Decision**: `chrome.storage.sync` (via WXT's typed `storage` wrapper) for settings
  and custom actions; `chrome.storage.local` for API keys and conversation history.
- **Rationale**: FR-011 requires a synchronizable solution from day one — sync storage
  makes settings/actions roam later with zero migration. API keys and chat history are
  device-local secrets/data (Assumptions), so they stay in local storage. Agent session
  state (transient loop state) also lives in local storage because the service worker is
  ephemeral (constitution Article I).
- **Alternatives considered**: IndexedDB (overkill for small structured records, not
  sync-capable), `chrome.storage.local` only (fails FR-011's future-sync requirement).

## Decision 6: Page interaction & capture

- **Decision**: On-demand `chrome.scripting.executeScript` injection of `content.js`
  (least privilege); tools = `readPage` (Readability-style structural minification +
  semantic chunking), `fillField` / `clickElement` / `selectOption` (native
  `InputEvent`/`ChangeEvent`/`MouseEvent` dispatch), `captureScreenshot`
  (`chrome.tabs.captureVisibleTab`, in-memory base64, per-conversation opt-in gate).
- **Rationale**: Native events pass reactive-form validation (FR-003); on-demand
  injection honors constitution Article I least-privilege; screenshot gating implements
  FR-004 and the clarified per-conversation permission.
- **Alternatives considered**: `chrome.debugger`/CDP (shows a "debugging" banner, blocks
  DevTools — unacceptable UX), static all-sites content script (over-privileged).

## Decision 7: Testing

- **Decision**: Vitest + React Testing Library for unit/component tests (80% coverage on
  orchestration logic); Playwright with a persistent Chromium context
  (`--load-extension`) for E2E of context-menu actions and form filling.
- **Rationale**: Matches constitution Article VI gates; Playwright is the standard way to
  drive a browser hosting an unpacked extension.
- **Alternatives considered**: Jest (slower, ESM friction), Puppeteer (weaker extension
  ergonomics than Playwright persistent contexts).

## Decision 8: Linting & hygiene

- **Decision**: ESLint (`@typescript-eslint`, `eslint-plugin-react-hooks`) + Prettier via
  `husky` + `lint-staged`; `tsc --strict`; `any` banned (`no-explicit-any` error).
- **Rationale**: Direct constitution Article VI requirement.
- **Alternatives considered**: Biome (fast but React-hooks rule parity incomplete).

## Open risks

- assistant-ui CSS in a side panel requires scoping so page styles never leak in (side
  panel is an isolated extension page, so risk is low).
- AI SDK streaming inside a service worker: supported via fetch streams; must verify no
  Node-only APIs are pulled in (use the edge/browser build).
