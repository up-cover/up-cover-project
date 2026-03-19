# UpCover — Build stages (implementation driver)

> Source: `OUTLINE.md` → Section 13

## 13. Build Stages

Build in this order. Each stage should be functionally complete before proceeding to the next.

### Stage 1 — Project Scaffold
- NestJS backend (`backend/`) and React + Vite frontend (`frontend/`)
- Tailwind CSS + shadcn/ui configured in frontend
- SQLite connection via TypeORM + `better-sqlite3`
- Environment config module loading all vars from `.env`
- `GET /api/health` endpoint returning `{ status: "ok" }`
- Frontend fetches health endpoint on load and displays status

### Stage 2 — Domain Model + Database Schema
- TypeORM entities for `Repository`, `ScanJob`, `CoverageFile`, `ImprovementJob`
- `synchronize: true` for local dev (or TypeORM migrations)
- Domain value object enums: `ScanStatus`, `ImprovementStatus`, `PackageManager`, `TestFramework`, `CoverageFramework`
- Repository interfaces defined in the domain layer (no TypeORM dependency)

### Stage 3 — Repository Registration (Landing Page)
- `RepositoryService.register(owner, repo)`:
  - GitHub PAT permission check via `@octokit/rest`
  - GitHub languages check
  - Duplicate check
  - Persist `Repository` record
- `POST /api/repositories` + `GET /api/repositories` controllers
- Landing page UI: input form, URL normalisation, error display; on success the new repo card appears inline in the list below the form (no navigation away)
- Repo list rendered on landing page: displays all repos as cards with static data

### Stage 4 — Scan Pipeline
- `ScanOrchestrator` driving: CLONING → SCANNING → INSTALLING → TESTING → COMPLETE
- `FrameworkDetector` domain service
- `CoverageParser` domain service
- `GitClient` infrastructure (wraps `simple-git`)
- All scan state persisted to `ScanJob` and `Repository` tables
- `CleanupService` (`@Interval`) for failed workspace directories

### Stage 5 — SSE Infrastructure
- `SseModule` with `SseEmitter` service
- `GET /api/sse/repositories/:id` endpoint
- `GET /api/sse/improvement-jobs/:jobId` endpoint
- `useSSE(url)` React hook

### Stage 6 — Landing Page Repo List UI (Live)
- `RepoCard` with SSE subscription — all fields update in real time
- `FrameworkBadges` (green/red)
- `DebugLog` component (conditional on `DEBUG_OUTPUT`)
- `ScanActionButton` state transitions: Start Scan → (scanning states) → View Details | Rescan
- Cards rendered inline below `RepoInputForm` on the landing page

### Stage 7 — Repository Detail Page
- `GET /api/repositories/:id` and `GET /api/repositories/:id/coverage-files` endpoints
- `RepoDetailPage`, `CoverageFileTable`, `CoverageFileRow`
- Threshold highlighting on low-coverage rows
- Disabled Improve button with tooltip (file too large or active job)

### Stage 8 — Improvement Pipeline
- `JobQueueService` (per-repo in-memory queue)
- `ImprovementOrchestrator` driving: QUEUED → CLONING → GENERATING → TESTING → PUSHING → CREATING_PR → COMPLETE
- `OllamaClient` (streaming fetch to Ollama REST API)
- Branch creation and push via `GitClient`
- PR creation via `GitHubClient`
- `POST /api/repositories/:id/files/:fileId/improve` endpoint
- `DELETE /api/improvement-jobs/:jobId` endpoint

### Stage 9 — Improvement Job UI
- `ImprovementJobList` accordion per file row
- `ImprovementJobEntry` with SSE subscription
- PR URL link on COMPLETE
- Remove/cancel button

### Stage 10 — Cleanup Service
- `CleanupService` using `@nestjs/schedule` `@Interval` decorator
- Scans `CLONE_DIR` every `CLEANUP_INTERVAL_MS`:
  - **Scan workspaces** (`{repoId}-{scanJobId}`): Delete if `ScanJob.status === FAILED` and older than interval, or if job record is orphaned (e.g. repo deleted)
  - **Improvement workspaces** (`improve-{jobId}`): Delete if job record no longer exists (orphaned)

### Stage 11 — Documentation
- `README.md` with setup, prerequisites, demo walkthrough
- `.env.example` with all vars and comments
- `docs/ARCHITECTURE.md` with ASCII DDD layer diagram
- `docs/DOMAIN_GLOSSARY.md`
- JSDoc pass over domain layer and application services

