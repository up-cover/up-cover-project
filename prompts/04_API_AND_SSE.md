# UpCover — API & SSE contracts

> Source: `OUTLINE.md` → Section 6

## 6. API Endpoints & SSE Streams

### REST

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/repositories` | Register a new repository. Validates PAT + TypeScript presence. |
| `GET` | `/api/repositories` | List all registered repositories with their current scan status. |
| `GET` | `/api/repositories/:id` | Repository detail including all metadata. |
| `POST` | `/api/repositories/:id/scan` | Start (or restart) a scan. Only allowed when `scanStatus` is `NOT_STARTED` or `FAILED`. |
| `GET` | `/api/repositories/:id/coverage-files` | Paginated coverage file list, sorted by `coverage_pct` ascending. |
| `POST` | `/api/repositories/:id/files/:fileId/improve` | Enqueue an improvement job for the given coverage file. |
| `DELETE` | `/api/improvement-jobs/:jobId` | Cancel an improvement job and clean up its workspace directory. |

### SSE Streams

| Path | Description | Events emitted |
|---|---|---|
| `GET /api/sse/repositories/:id` | Streams updates for a repo card (scan progress, metadata changes). | `repo:updated`, `scan:log` |
| `GET /api/sse/improvement-jobs/:jobId` | Streams updates for a single improvement job. | `job:updated`, `job:log` |

SSE uses standard semantics: each message is sent with an `event:` name (e.g. `repo:updated`) and a `data:` payload (JSON). Clients reconnect automatically on disconnect (browser `EventSource` default behaviour).

