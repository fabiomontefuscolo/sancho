# Quickstart: Rich Message Rendering (004)

## Prereqs

```bash
pnpm install
pnpm build
```

Load/reload `sancho/.output/chrome-mv3/` at `brave://extensions` (Developer mode).

## Automated gates

```bash
pnpm exec vitest run tests/component/markdown-rendering.test.tsx tests/component/copy-controls.test.tsx tests/component/font-size.test.tsx
pnpm test:e2e   # includes tests/e2e/rich-messages.spec.ts
pnpm typecheck && pnpm lint
pnpm exec vitest run --coverage   # global ≥ 80% gates
```

## Manual validation (Brave sidebar)

1. **Markdown**: ask the agent for "a short markdown demo with a heading, a bullet list, a link, and bold text" → formatting renders, no raw `##` or `**` visible; watch it while streaming — no broken layout.
2. **Code**: ask for "a TypeScript hello world in a fenced code block" → block shows highlighting + `typescript` label; click its copy icon → paste into a text field → exactly the code, no fences; "Copied" feedback appears.
3. **Message copy**: click the copy icon on an agent message → paste → raw markdown source verbatim.
4. **Wide content**: ask for a code block with a very long line → the block scrolls horizontally, the message list does not (003 guarantees hold).
5. **Safety**: paste into the conversation (via a stored/mock message) markdown containing `<script>alert(1)</script>` and `<img src="https://evil.example/x.png">` → nothing executes, no network request is made.
6. **Font size**: open the sidebar settings view → switch small / medium / large → text rescales immediately; open the options page → change the same setting → the sidebar updates within a second; reload the extension → the last choice persists.
7. **Regression**: message timestamps still render; conversation list and 003 e2e suite still pass.
