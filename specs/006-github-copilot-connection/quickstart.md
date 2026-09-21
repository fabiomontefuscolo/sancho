# Quickstart: GitHub Copilot Connection Method

## Validate the happy path (manual, Brave)

1. `pnpm build`, reload the extension at `brave://extensions`.
2. Open the extension options page → **Connection**.
3. Select **GitHub Copilot** → click **Connect with GitHub**.
4. A code (e.g. `WDJB-MJHT`) appears and github.com/login/device opens; enter/confirm the code (already logged in → one click).
5. The panel flips to **Connected** and the model dropdown fills from the live list; pick a model (e.g. `gpt-4.1`) and Save.
6. Open the side panel on any page and send a message → streamed reply via Copilot.
7. Run a context-menu action (Explain selection) → works through the same connection.
8. Wait > 30 min (or delete `copilotAuth.copilotToken` in devtools) → next send still succeeds (transparent refresh).
9. Click **Disconnect** → tokens wiped; next send reports "connect GitHub first".

## Automated checks

```bash
pnpm typecheck && pnpm lint
pnpm exec vitest run        # unit + component incl. new copilot tests
pnpm build && pnpm test:e2e # existing e2e unchanged
```

## What to unit-test (jsdom, stubbed fetch + mock-chrome)

- `copilot-auth.test.ts`: start → pending poll → authorized → token stored; `slow_down` increases interval; `access_denied`/`expired_token` → error state; exchange caches session token and refreshes only when near expiry; disconnect wipes storage.
- `factory.test.ts`: `method: "copilot"` + stored auth → `OpenAICompatibleProvider` with id `copilot`; no auth → `ProviderNotConfiguredError`.
- `openai-compatible.test.ts`: custom `headers` reach the wire request.
- `options.test.tsx` (component): copilot radio renders connect button; pending shows the code; connected shows model dropdown + disconnect; disclaimer visible.
