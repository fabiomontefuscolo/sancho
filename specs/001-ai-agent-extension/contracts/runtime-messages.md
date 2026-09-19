# Contract: Runtime Messages (UI ↔ Background ↔ Content Script)

All intra-extension communication uses typed message envelopes. UI surfaces (side panel,
options page) talk to the background over a long-lived `chrome.runtime` port named
`sancho-ui`. The background talks to content scripts via `chrome.tabs.sendMessage`.

## Envelope

```ts
interface Envelope<T extends string, P> {
  kind: "request" | "response" | "event";
  type: T;
  id: string;              // correlation id; responses/events echo the request id
  payload: P;
}
```

Unknown `type` values MUST be ignored; malformed envelopes MUST be dropped and logged.

## UI → Background (port `sancho-ui`)

| Type | Payload | Response/Event |
|------|---------|----------------|
| `chat.send` | `{ text: string, tabId: number }` | streams `chat.delta` events, then `chat.done` or `chat.error` |
| `chat.cancel` | `{}` | `chat.done` with `cancelled: true` |
| `chat.clear` | `{}` | resets conversation + `screenshotConsent` |
| `conversation.get` | `{}` | `conversation.state` with full `Conversation` |
| `action.run` | `{ actionId: string, tabId: number, selection: string, editable: boolean }` | `action.result` or `action.error` |
| `screenshot.consent` | `{ granted: boolean }` | `conversation.state` (consent reflected) |

## Background → UI (events on same port)

| Type | Payload |
|------|---------|
| `chat.delta` | `{ messageId: string, text: string }` |
| `chat.tool` | `{ toolCall: ToolCall, status: "started" \| "finished" }` |
| `chat.done` | `{ messageId: string, cancelled?: boolean }` |
| `chat.error` | `{ message: string }` — connection failures per FR-014 |
| `conversation.state` | `Conversation` — pushed on any change; UI MUST NOT keep its own copy (Article V) |
| `action.result` | `{ actionId: string, replacement: string }` (editable) or `{ text: string }` appended to chat (read-only) |

## Background ↔ Content Script (`content.js`, tab-scoped)

| Type | Direction | Payload |
|------|-----------|---------|
| `page.read` | bg → cs | `{ mode: "full" \| "selection" }` → `{ chunks: string[], title: string, url: string }` |
| `page.fill` | bg → cs | `{ selector: string, value: string }` → `{ ok: boolean }`; MUST dispatch `InputEvent` + `ChangeEvent` |
| `page.click` | bg → cs | `{ selector: string }` → `{ ok: boolean }`; MUST dispatch `MouseEvent` sequence |
| `page.select` | bg → cs | `{ selector: string, value: string }` → `{ ok: boolean }`; MUST dispatch `ChangeEvent` |
| `selection.get` | bg → cs | `{}` → `{ text: string, editable: boolean }` |
| `selection.replace` | bg → cs | `{ replacement: string }` → `{ ok: boolean }`; native events on the editable target |

Content scripts respond with `{ ok: false, error: string }` on failure; the background
MUST surface errors to the UI and MUST NOT retry clicks/fills blindly (loop cap applies).

## Options page

Options uses the same port with `settings.get` / `settings.set` (`ProviderConfig`),
`actions.list` / `actions.upsert` / `actions.delete` payloads mirroring the entities in
[data-model.md](../data-model.md). `settings.set` MUST move API keys to local storage and
return only the `apiKeyRef`.
