# Contract: Local ACP Transport

Channel between the background worker and a locally running ACP agent, per constitution
Article III and FR-006.

## Topology

```text
background.js  <-- Native Messaging (stdio) -->  host script  <-- stdio -->  ACP agent
     (@agentclientprotocol/sdk client)          (user-installed)            (user-managed)
```

The extension talks only to the registered native messaging host; the host script owns
spawning/attaching to the agent daemon.

## Handshake

1. Background opens `chrome.runtime.connectNative(hostName)` where `hostName` comes from
   `ProviderConfig.acp.hostName`. The host name must be a valid Chrome native messaging
   name (lowercase alphanumerics, underscores, dots — e.g. `com.sancho.acp_host`).
2. First message from the extension MUST be `{ "type": "handshake", "token": "<token>" }`
   when `ProviderConfig.acp.token` is set; the host MUST close the port on mismatch.
3. On success the host replies `{ "type": "handshake.ok", "mcpServer": { name, command, args, env } }`
   describing the Sancho browser-tool MCP server (see below). `mcpServer` MAY be absent on
   older hosts; the extension then runs the session without browser tools.
4. After a successful handshake, NDJSON ACP framing begins via the SDK's stream
   utilities.

## Protocol

Standard ACP JSON-RPC 2.0 over NDJSON as defined by `@agentclientprotocol/sdk`:

- `initialize` — negotiate `protocolVersion` (stable: `1`) and capabilities.
- `session/new` — one ACP session per agent run; when `mcpServer` was announced, the
  extension passes it as `mcpServers` so the agent spawns the Sancho MCP server and gains
  the browser tools (`read_page`, `fill_field`, `click_element`, `select_option`,
  `capture_screenshot`).
- `session/prompt` — carries a preamble (local time + environment description) followed by
  the user's text.
- `session/cancel` — maps to `chat.cancel`.

Notifications with `sessionUpdate` variants unknown to the SDK schema (e.g. opencode's
`usage_update`) MUST be dropped before entering the NDJSON stream.

## Browser tool bridge

The host opens a per-user Unix socket (`$XDG_RUNTIME_DIR/sancho-<uid>/bridge.sock`, dir
mode 0700). The MCP server connects with `{ "token": "<token>" }` as its first frame, then
sends `{ id, name, arguments }` requests. The host relays them to the extension as
`{ "type": "tool.invoke", id, name, arguments }` port messages; the extension executes via
the [tool contracts](./tools.md) and replies `{ "type": "tool.result", id, result }`, which
the host forwards back to the socket.

## Failure handling (FR-014)

- Host missing or spawn failure → `chat.error` "local agent unavailable" with setup
  instructions; conversation state preserved.
- Port disconnect mid-run → `AgentSession.state = "error"`; user may retry.
- No automatic reconnection with partial state; a retry always starts a clean ACP session
  seeded from the stored conversation.

## Future alternative (out of scope for v1)

WebSocket loopback (`wss`/token auth) as an optional transport for hosts that cannot use
Native Messaging.
