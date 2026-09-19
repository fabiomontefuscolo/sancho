# Sancho (AI Agent Chrome Extension) Constitution

<!--
Sync Impact Report
- Version change: none (new) → 1.0.0
- Modified principles: none (initial ratification; all principles are new)
- Added sections: Core Principles (I-VI), Additional Constraints, Development Workflow & Quality Gates, Governance
- Removed sections: none
- Follow-up TODOs: none — ratification date set to adoption date (2026-09-19); confirm with maintainers
  if a different original ratification date applies.
-->

## Core Principles

### I. Manifest V3 Core Architecture

All extension components MUST strictly leverage Manifest V3 architectures; traditional blocking
APIs are deprecated. The background service worker (`background.js`) MUST be entirely
event-driven — persistent or global in-memory state is forbidden, as the worker may terminate
at any time; transient agent session state MUST live in `chrome.storage.local`. Contexts are
isolated by role: `popup/` or `sidepanel/` is the React UI control hub for provider selection,
conversation logs, and execution monitoring; `background.js` is the orchestrator and central
router for LLM tool loops, screenshot execution, and external connections (cloud APIs and
local ACP JSON-RPC over Native Messaging/WebSockets); `content.js` performs isolated DOM
operations only and MUST be loaded dynamically or injected with strict least-privilege
configurations.

**Rationale**: MV3's ephemeral service worker and context isolation are the security and
reliability backbone of the extension; violating them produces lost state and privilege leaks.

### II. Unified Multi-Provider LLM & Tool Calling Layer

All cloud LLM integrations (OpenAI, Kimi, Deepseek, OpenRouter) MUST inherit from a unified
`BaseLLMProvider` interface to standardise token streams, message history schemas, and
structural tool output formats. The tool execution pipeline MUST implement a deterministic
autonomous loop within the background worker (e.g., *Plan -> Act -> Verify*), protected
against runaway recursive API calls with explicit safety execution caps.

**Rationale**: A single provider contract keeps orchestration code provider-agnostic, and a
bounded deterministic loop prevents uncontrolled token spend and infinite tool recursion.

### III. Local Agent & ACP Integration

When operating via the local agent provider, the extension acts as the client interacting
over the standard JSON-RPC 2.0 / REST specification defined by the Agent Client Protocol
(ACP). Communication with the local agent daemon MUST use secure, authenticated loops on
the user's local machine (e.g., WebSocket loops over local loopbacks with token handshakes,
or Native Messaging stdio pipelines via an intermediate host script).

**Rationale**: Local agents execute with user-level privileges; unauthenticated loopback
channels would expose the machine to any webpage or process that can reach the port.

### IV. Browser Automation & Security Controls

Webpage text scraping MUST execute inside `content.js` and securely serialize raw strings,
using semantic chunking or HTML structural minification before ingestion to prevent context
window explosion and prompt injection attacks. DOM manipulation (inputting text, selecting
dropdowns, triggering click events) MUST strictly fire native browser events (`InputEvent`,
`ChangeEvent`, `MouseEvent`) to mimic legitimate human actions and pass target-site reactive
form verification. Screenshots taken via `chrome.tabs.captureVisibleTab` MUST be processed
in memory (as base64/blobs); storage or forwarding of screenshots to cloud providers
requires explicit, visual opt-in permission tokens declared in `spec.md`.

**Rationale**: Untrusted page content is the primary injection vector, and screenshots carry
sensitive user data that must never leave the device silently.

### V. React UI Stack & State Synchronization

All UI components (Popups, Side Panels, Options Pages) MUST be built using React with
functional components and hooks. React UI state MUST stay synchronized with the extension
service worker via structured `chrome.runtime` bridge listeners; local component state
MUST NOT be used for data that must persist when the UI closes.

**Rationale**: The service worker is the single source of truth; UI-local copies diverge the
moment a popup or panel closes, producing stale or lost agent state.

### VI. Strict Typing, Code Hygiene & Quality Gates

The entire codebase MUST be strictly typed (`strict: true` in `tsconfig.json`); the use of
`any` is barred — use explicit interfaces, generics, or `unknown` with type guards. ESLint
(with `@typescript-eslint/eslint-plugin` and `eslint-plugin-react-hooks`) and Prettier MUST
run on pre-commit hooks (e.g., via `husky` and `lint-staged`); code that fails linting or
formatting checks MUST NOT be committed. Code MUST be descriptive and self-explanatory —
comments are reserved exclusively for complex algorithms, performance trade-offs, or
structural architectural decisions. Dynamic execution (`eval()`, `new Function()`) inside
content or background environments is structurally banned; tool execution logic MUST remain
entirely declarative.

**Rationale**: An autonomous agent that acts on real web pages cannot tolerate type holes,
silent style drift, or runtime code generation — every execution path must be statically
auditable.

## Additional Constraints

- **Test-Driven Foundation**: All core agent utilities, tool-calling state machines, and
  provider parsers MUST have unit tests (Vitest/Jest). React components MUST be tested with
  React Testing Library to verify user interaction flows. Verification pipelines MUST
  maintain a minimum of 80% statement and branch coverage for core business and
  orchestration logic.
- **Least Privilege**: `content.js` and any injected scripts MUST request the minimum
  permissions and host access required for their task.
- **Privacy by Default**: No screenshot or page content leaves the local machine to a cloud
  provider without the explicit opt-in flow defined in Article IV.

## Development Workflow & Quality Gates

- Pre-commit hooks (`husky` + `lint-staged`) run ESLint and Prettier; failing code cannot be
  committed.
- All changes to core orchestration, provider implementations, or tool-calling state
  machines require accompanying unit tests that preserve the 80% coverage threshold.
- React UI changes require component tests for the affected interaction flows.
- Any change touching screenshot capture, page-content ingestion, or the local ACP transport
  MUST be reviewed against Articles III and IV before merge.
- New LLM providers MUST implement `BaseLLMProvider` and add provider parser unit tests
  before integration.

## Governance

This constitution supersedes all other project practices and conventions. Amendments require
a documented proposal, maintainer approval, and a migration plan for any affected code or
workflows. All pull requests and reviews MUST verify compliance with the principles above;
complexity that appears to violate a principle MUST be explicitly justified in the change
description. Use `spec.md` for runtime specification of feature-level opt-in permissions
(e.g., screenshot forwarding tokens). Versioning follows semantic rules: MAJOR for backward
incompatible principle removals or redefinitions, MINOR for new principles or materially
expanded guidance, PATCH for clarifications and non-semantic refinements.

**Version**: 1.0.0 | **Ratified**: 2026-09-19 | **Last Amended**: 2026-09-19
