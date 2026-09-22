# Quickstart: Custom Instructions

**Feature**: [spec.md](spec.md) | Manual validation in a real browser (Brave/Chrome, MV3).

Prerequisites: `pnpm build` completed; extension loaded from `.output/chrome-mv3` via `chrome://extensions` (Developer mode → Load unpacked); a working provider configured.

## S1. Empty by default

1. Open the options page → confirm a **Custom instructions** nav link between Appearance and Actions.
2. The section shows an empty textarea, the hint text mentioning AGENTS.md, and a `0 / 4000` counter.
3. Send a chat message → reply behaves as before the feature (no visible change).

## S2. Instructions take effect

1. Enter: `Always reply in exactly one sentence, in Portuguese.` Wait for the "Saved" indicator.
2. Send any chat message → the reply is one sentence, in Portuguese.
3. Start a **new conversation**, send a message → instructions still apply.

## S3. Live edit mid-conversation

1. In the same conversation, change instructions to: `Always reply in English.` Wait for "Saved".
2. Send the next message in that same conversation → the reply switches to English.

## S4. Clear

1. Delete all text from the textarea. Wait for "Saved".
2. Send a message → default behavior returns.

## S5. Length cap

1. Paste a text longer than 4,000 characters → the textarea refuses characters beyond 4,000; the counter shows `4000 / 4000`.

## S6. Actions unaffected

1. Set instructions to `Always reply in Portuguese.`
2. Select editable English text on a page → run the "Fix grammar" context-menu action → the replaced text stays in English (no conversational influence).

## S7. Persistence & restart

1. Set any instructions → fully restart the browser → reopen the options page → instructions are still present and still apply to chat.

## S8. ACP provider (if configured)

1. Switch to the ACP provider, set instructions (`Reply tersely.`), send a message → the local agent's reply reflects the instructions.
