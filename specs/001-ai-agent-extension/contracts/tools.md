# Contract: Agent Tool Schemas

Tools exposed to the LLM inside the background tool loop. Declared with Zod schemas and
converted to provider tool-calling format by `BaseLLMProvider`. Execution is declarative
only — no `eval`, no dynamic code (constitution Article VI).

## readPage

Reads the active tab's content, minified and chunked.

- **Input**: `{ mode?: "full" | "selection" }` (default `full`)
- **Output**: `{ title: string, url: string, chunks: string[] }`
- **Limits**: output capped at ~8k tokens worth of text; raw HTML never reaches the model
  (prompt-injection defense, FR-002).

## fillField

- **Input**: `{ selector: string, value: string }`
- **Output**: `{ ok: boolean }`
- Dispatches native `InputEvent`/`ChangeEvent` (FR-003).

## clickElement

- **Input**: `{ selector: string }`
- **Output**: `{ ok: boolean }`
- Dispatches a native `MouseEvent` sequence (`mouseover → mousedown → mouseup → click`).

## selectOption

- **Input**: `{ selector: string, value: string }`
- **Output**: `{ ok: boolean }`

## captureScreenshot

- **Input**: `{}`
- **Output**: `{ imageBase64: string, mimeType: "image/png" }` appended as an image part
  in the conversation.
- **Gate**: fails with `{ ok: false, error: "consent_required" }` unless
  `Conversation.screenshotConsent === true` (per-conversation opt-in, FR-004). The UI
  shows a consent prompt on this error; on grant the tool may be retried once.

## Loop invariants

- Each iteration executes at most one tool batch, then returns to the model.
- `iteration >= maxIterations` (default 25) forces `stopped` and a user-facing message
  (SC-006).
- All tool outputs are JSON-serializable; screenshots are base64 blobs held in memory and
  discarded with the message unless the user saves them.
