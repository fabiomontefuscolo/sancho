# Research: Assistant-UI Primitives Alignment & Settings Polish

**Date**: 2026-09-21
**Feature**: `007-assistant-ui-primitives`

All Technical Context items were resolved from the locked user decisions and codebase recon; no NEEDS CLARIFICATION remained.

## Decision 1: Upgrade to assistant-ui 0.15.x line

- **Decision**: Bump `@assistant-ui/react` ^0.11.0 → ^0.15.21, `@assistant-ui/react-markdown` 0.11.10 → ^0.14.16, `@assistant-ui/react-syntax-highlighter` 0.11.10 → ^0.14.6.
- **Rationale**: 0.11 lacks `MessagePrimitive.GroupedParts`, `groupPartByType`, and `AuiIf`; upstream's current recommended thought-process pattern lives in 0.12+. All 0.15.x packages declare React 18 support, so no React upgrade is needed. `useExternalStoreRuntime` still exists in 0.15.
- **Alternatives considered**: Staying on 0.11 and using `ReasoningGroup`/`ToolGroup` (rejected — deprecated upstream, dead-ends future upgrades); jumping to a React-19-only line (rejected — unnecessary framework churn).
- **Risk**: Exact prop signatures of `GroupedParts`/`AuiIf`/`ThreadListPrimitive` were verified against 0.11.58 docs, not 0.15 types; resolved at implementation time against the installed `node_modules` types.

## Decision 2: Thought-process rendering via GroupedParts, not ChainOfThoughtPrimitive

- **Decision**: Render reasoning + tool-call parts with `MessagePrimitive.GroupedParts` + `groupPartByType` wrapped in a hand-rolled collapsible "Thought process" accordion.
- **Rationale**: `ChainOfThoughtPrimitive` is legacy upstream; GroupedParts is the recommended replacement and handles interleaved part grouping (reasoning/tool groups before/around text) natively.
- **Alternatives considered**: `ChainOfThoughtPrimitive` (rejected — legacy); keeping the detached tool-activity strip (rejected — loses in-message context; explicitly superseded per spec FR-004).

## Decision 3: Reasoning extraction in the provider layer

- **Decision**: AI SDK v5 `streamText().fullStream` emits `reasoning-delta` parts for reasoning-capable models. `OpenAICompatibleProvider.streamChat` forwards them through a new optional `onReasoningDelta(text)` callback on `StreamEvents`; the chat handler re-emits them as `chat.delta` with `part: "reasoning"`.
- **Rationale**: Keeps reasoning provider-agnostic at the bridge boundary (ACP provider simply never emits it), and reuses the existing delta channel with a discriminator instead of a new envelope type.
- **Alternatives considered**: A separate `chat.reasoning` envelope (rejected — duplicates ordering logic; a `part` field on `chat.delta` preserves a single ordered stream); parsing raw SSE in the provider (rejected — bypasses the AI SDK abstraction already in use).

## Decision 4: Flattened chat.tool payload → real tool-call message parts

- **Decision**: Replace `{ toolCall, status }` with `{ toolCallId, toolName, argsText, result?, status }` on `chat.tool`; `useSanchoRuntime` converts these into assistant-ui `tool-call` content parts on the in-flight assistant message.
- **Rationale**: Matches the assistant-ui tool-call part shape (`toolCallId`/`toolName`/`argsText`/`result`) so grouped rendering works without an adapter shim; `toolCallId` comes from the provider (`part.toolCallId` in AI SDK, generated UUID in the ACP path).
- **Alternatives considered**: Keeping the nested `ToolCall` payload and converting in the UI (rejected — pushes protocol mapping into the render layer).

## Decision 5: Errors as message status, not fake assistant text

- **Decision**: On `chat.error`, the runtime sets the in-flight assistant message's `status = { type: "incomplete", reason: "error", error }` and `AssistantMessage` renders `ErrorPrimitive.Root role="alert"` + `ErrorPrimitive.Message`. `ChatErrorPayload` gains `messageId` so the error attaches to the correct message (the background already uses the assistant id as envelope id in one path — this makes it explicit and uniform).
- **Rationale**: This is exactly what assistant-ui's `status`/`ErrorPrimitive` model exists for; removes the `Error: ...` text injection that polluted copy/regenerate/history behavior. Consent banner (`consent_required`) path is untouched (spec FR-009).
- **Alternatives considered**: Keep injecting text and styling it differently (rejected — still assistant-authored content, still copied/exported as agent output).

## Decision 6: Regenerate as a background bridge op

- **Decision**: New `chat.regenerate` request (payload: `{}`). The background handler aborts any active run on the conversation, truncates assistant messages after the most recent user message, then re-runs the same agent-loop path as `chat.send` (extracted into a shared `runConversation(conversation, tabId, port)` helper) without appending a new user message.
- **Rationale**: The loop's `getMessages` already derives provider messages from conversation state, so truncation + re-entry is the minimal, consistent implementation. "Last message is user → behaves as resend" falls out naturally (nothing to truncate).
- **Alternatives considered**: UI-side re-send of the last user text (rejected — duplicates history with a second user message); full conversation fork/branching (rejected — out of scope).

## Decision 7: ThreadList via runtime adapters

- **Decision**: Pass `adapters: { threadList }` to `useExternalStoreRuntime`, mapping the existing `conversations.state` event stream to `{ threads, onSwitchToNewThread, onSwitchToThread, onDelete }`; rebuild `conversation-list.tsx` on `ThreadListPrimitive.Root/New/Items` + `ThreadListItemPrimitive.Trigger/Title/Delete`, keeping the hamburger view-swap UX.
- **Rationale**: Standardizes active-thread styling and keyboard behavior; archive/rename are unsupported by our adapter and the corresponding item actions auto-disable in the library.
- **Alternatives considered**: Keep the hand-rolled list (rejected — spec FR-010 explicitly requires the standard thread-list interface).
- **Risk**: Exact adapter property name in 0.15 verified at implementation time against installed types (0.11's `unstable_` prefix may have been promoted).

## Decision 8: Copy via built-in action-bar primitive

- **Decision**: Use `ActionBarPrimitive.Root hideWhenRunning autohide="not-last" autohideFloat="always"` with `ActionBarPrimitive.Copy` (+ `ActionBarPrimitive.Reload` on assistant messages); delete `RawTextContext`, `MessageCopyButton`, and the `getMessageRawText` plumbing (`rawTextRef`).
- **Rationale**: The library's Copy primitive copies the message's assembled raw markdown already; the custom plumbing existed only to feed the old button.
- **Alternatives considered**: Keep `RawTextContext` for safety (rejected — dead code once copy is primitive-driven; history raw text still available from persisted messages if ever needed).

## Decision 9: Icons via lucide-react

- **Decision**: Add `lucide-react` for send/stop/copy/check/reload/plus/chevrons/trash glyphs.
- **Rationale**: Standard, tree-shakeable, ISC-licensed (GPL-compatible); matches upstream assistant-ui examples.
- **Alternatives considered**: Hand-drawn unicode glyphs (status quo — rejected, inconsistent rendering); inline SVGs (rejected — maintenance burden).

## Decision 10: Composer/settings styling stays CSS-only

- **Decision**: Replicate the ChatGPT-style rounded card (`rounded-3xl` equivalent, border, auto-growing `ComposerPrimitive.Input` with `rows={1}`) in `chat.css`; no CSS framework introduced.
- **Rationale**: The project has no Tailwind; upstream examples assume it, so styles must be hand-ported. Keeps the dependency footprint minimal.

## Decision 11: Settings navigation

- **Decision**: Options page nav becomes `Connection | Appearance | Actions | About` with an `#appearance` anchor; the side-panel gear calls `chrome.runtime.openOptionsPage()`; a separate "Aa" button keeps the in-panel font-size quick view (`settings-view.tsx` unchanged in behavior).
- **Rationale**: Spec FR-011/FR-012; `openOptionsPage` is the canonical MV3 affordance and requires no new permissions.
- **Alternatives considered**: Embedding the full settings in the side panel (rejected — duplicates the options page; the panel stays lightweight).
