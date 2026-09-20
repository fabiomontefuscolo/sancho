# Data Model: Rich Message Rendering (004)

## New entity: UiPrefs

Persisted in `chrome.storage.sync` under key `uiPrefs` (per-002 pattern: sync storage survives clearing browsing data).

| Field    | Type                             | Default    | Validation                   |
| -------- | -------------------------------- | ---------- | ---------------------------- |
| fontSize | `"small" \| "medium" \| "large"` | `"medium"` | unknown/missing → `"medium"` |

**Ownership**: written by the options-page settings panel and the sidebar settings view (single synced preference); read by the sidebar on startup and via `chrome.storage.sync.onChanged` for live updates.

**No changes** to: `Message` (raw markdown already persists in `parts[].text` — the copy source), `Conversation`, `ProviderConfig`, or any `chrome.storage.local` schema.

## Derived (not persisted)

- **Rendered markdown tree**: derived at render time from `Message.parts[].text`; never stored.
- **Copy confirmation state**: transient component state (`idle | copied | failed`), resets after ~1.5s.
