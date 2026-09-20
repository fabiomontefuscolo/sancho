# Data Model: Page Interaction Tools (005)

## Entity: Page snapshot (ephemeral)

Produced per `snapshotPage` call, per tab. Never persisted; lives only in the tool result.

| Field     | Type              | Notes                                                  |
| --------- | ----------------- | ------------------------------------------------------ |
| elements  | `SnapshotEntry[]` | interactive elements only, bounded (default max 300)   |
| truncated | `number`          | count of omitted elements beyond the cap; 0 = complete |

### SnapshotEntry

| Field | Type              | Validation                                                                                                |
| ----- | ----------------- | --------------------------------------------------------------------------------------------------------- |
| ref   | `string` (`e<N>`) | minted per snapshot; idempotent per element within the tab                                                |
| role  | `string`          | implicit tag semantics or explicit `role`                                                                 |
| name  | `string`          | accessible name, trimmed ≤ 80 chars; may be `""` (unnamed)                                                |
| frame | `string \| null`  | `null` = top frame; `[frame N]` = same-origin iframe; inaccessible frames appear as a marker line instead |

## Entity: Element reference (ephemeral)

Opaque handle `e<N>` scoped to one tab's page lifetime.

- **Valid**: from minting until page navigation or element removal.
- **Resolution**: at action time; `isConnected === false` or GC'd → stale result `{ ok: false, error: "stale reference" }`, no action performed (FR-004, SC-004).
- **Storage**: in-memory `Map`/`WeakMap` in the content-script isolated world; never persisted, never shared across tabs.

## Tool argument shapes (additions)

- `snapshotPage`: `{ maxElements?: number }` (default 300).
- `setEditorText`: `{ selector?: string, ref?: string, text: string, mode: "replace" | "insert" }` — exactly one of `selector`/`ref` (default mode `replace`).
- `clickElement` / `fillField` / `selectOption`: existing fields + optional `ref`; exactly one of `selector`/`ref`.

**No changes** to persisted schemas (`Conversation`, `Message`, `ProviderConfig`, `UiPrefs`).
