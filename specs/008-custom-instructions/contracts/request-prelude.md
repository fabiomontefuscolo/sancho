# Contract: Chat Request Prelude

**Date**: 2026-09-22 | **Feature**: [spec.md](../spec.md)

Defines the composition of the leading context ("prelude") sent with every chat request.

## Built-in / Copilot provider path

`buildProviderMessages(conversation, tabId)` returns, in order:

| Position | Content                                                                                      | Condition                                           |
| -------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| 0        | `system`: `Custom instructions from the user (follow these in every reply):\n<instructions>` | only when instructions are non-empty/non-whitespace |
| 0 or 1   | `system`: clock + active-tab context (existing `systemClockMessage`)                         | always                                              |
| …        | conversation history (`[HH:MM] <text>` per message)                                          | always                                              |

Guarantees:

- The instructions message appears **at most once** per request.
- When instructions are empty, the message array is byte-identical to the pre-feature behavior (clock message at index 0).
- Instructions are re-read from storage on every run; no caching across runs.

## ACP provider path

`AcpProvider.streamChat` builds its preamble as:

```text
[<clock>] You are running inside a browser extension. <mcp-tools guidance>
[User's custom instructions: <instructions>]   ← only when non-empty
```

The preamble (including instructions) is prepended to the last user message text on both fresh prompts and context-rebuild retries.

## Selection Actions path (explicit non-contract)

`runSelectionAction` sends exactly one `user` message built from the action's `prompt` template. Custom instructions MUST NOT appear in this path.

## Stability notes

- The clock/tab system message content and position-relative-to-history are unchanged; existing assertions on "first message is the clock message" must be updated to account for the optional instructions message at index 0.
- The instructions header line ("Custom instructions from the user…") is part of this contract; tests may assert on it.
