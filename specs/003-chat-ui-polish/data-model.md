# Data Model: Chat UI Polish

No schema changes. The feature consumes existing data only.

## Message (existing — `src/types.ts`)

| Field       | Type              | Use in this feature                                      |
| ----------- | ----------------- | -------------------------------------------------------- |
| `id`        | string            | React key (existing)                                     |
| `role`      | MessageRole       | bubble alignment (existing)                              |
| `parts`     | MessagePart[]     | text/image parts subject to overflow containment         |
| `createdAt` | number (epoch ms) | **timestamp display source**; required since feature 001 |

- `ImagePart.imageBase64` + `mimeType` render as data-URL `<img>` — constrained by CSS only.
- Legacy-records rule (clarification 2026-09-19): if `createdAt` is absent/undefined on any record, the timestamp renders nothing; no migration or backfill is performed.

## Derived display value (not persisted)

- **Timestamp label**: `formatMessageTime(createdAt)` → `"Sat Sep 19 22:56"` — weekday short, month short, day-of-month, 24-hour HH:MM, user locale. Computed at render time; never stored.

## State transitions

None — purely presentational feature.
