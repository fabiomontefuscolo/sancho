# Sancho

An AI agent that lives in your browser's side panel. It can read the page you're on,
fill forms, click elements, and analyze screenshots — powered either by your own API key
for any OpenAI-compatible provider (OpenAI, Kimi, Deepseek, OpenRouter, or a custom
endpoint) or by a local agent over the Agent Client Protocol (ACP).

## Features

- **Side panel chat** — open it anytime; the agent sees and acts on the active tab
- **Selection actions** — right-click selected text → "Improve writing", "Make it formal",
  "Fix grammar", or your own custom actions (name + prompt)
- **Bring your own provider** — cloud API key or local ACP agent, switchable in settings
- **Private by default** — screenshots and page content stay in memory and require explicit
  per-conversation consent; API keys are stored locally and never synced

## Requirements

- Node.js 20+ and pnpm
- Chrome or Chromium (Manifest V3)

## Build

```bash
pnpm install
pnpm build
```

The unpacked extension is emitted to `.output/chrome-mv3/`.

## Install (unpacked)

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** and select the `.output/chrome-mv3/` directory
4. Pin the extension, then click its icon to open the side panel

To produce a distributable zip instead: `pnpm zip` (output in `.output/`).

## Development

```bash
pnpm dev
```

Starts the WXT dev server with hot reload and loads the extension in a dev browser.

## Configure

Open the extension's options page (right-click the icon → **Options**, or
`chrome://extensions` → Details → Extension options):

1. **Connection** — choose "API key" (pick a provider, paste your key, set the model) or
   "Local agent (ACP)" (set the native messaging host name and optional handshake token)
2. **Actions** — enable/disable built-ins, or create custom actions with a name and a
   prompt (use `{{selection}}` where the selected text should go)

For the local ACP agent you need a companion native messaging host script installed on
your machine:

```bash
./native-host/install.sh <extension-id>   # ID from chrome://extensions
```

The host (`native-host/com.sancho.acp_host.mjs`) spawns `opencode acp` (override with
`SANCHO_ACP_COMMAND`/`SANCHO_ACP_ARGS`), validates the optional token from
`~/.config/sancho/token`, and exposes Sancho's browser tools to the agent through a
companion MCP server so the agent can read and act on the active tab. See
`specs/001-ai-agent-extension/contracts/acp-transport.md` for the full contract.

## Tests

```bash
pnpm test        # unit + component tests (Vitest, 80% coverage gate)
pnpm test:e2e    # end-to-end tests in Chromium with the extension loaded (Playwright)
pnpm lint        # ESLint
pnpm typecheck   # strict TypeScript
```

## Architecture

- `entrypoints/background.ts` — event-driven service worker: tool loop, providers, menus
- `entrypoints/sidepanel/` — chat UI (React + assistant-ui)
- `entrypoints/options/` — settings page
- `entrypoints/content.ts` — on-demand page interaction with native browser events
- `src/agent/` — deterministic Plan → Act → Verify loop (25-iteration safety cap)
- `src/providers/` — `BaseLLMProvider` abstraction, OpenAI-compatible and ACP providers
- `src/storage/` — sync storage (settings, actions) + local storage (keys, history)

Project governance and design docs live in `.specify/memory/constitution.md` and
`specs/001-ai-agent-extension/`.
