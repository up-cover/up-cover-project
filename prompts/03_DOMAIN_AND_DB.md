# UpCover — Domain model & database schema

> Source: `OUTLINE.md` → Sections 4–5

## 4. Domain Model (DDD)

### Bounded Contexts

- **`coverage-scanning`** — everything related to analysing a repository: cloning, framework detection, running tests, parsing coverage reports.
- **`test-improvement`** — everything related to AI-driven test generation: job queuing, Ollama invocation, branch management, PR creation.

### Entities

```
Repository
  id:                UUID (primary key)
  owner:             string
  name:              string
  url:               string
  hasTypeScript:     boolean
  totalTsFiles:      number | null
  packageManager:    PackageManager | null
  testFramework:     TestFramework | null
  coverageFramework: CoverageFramework | null
  totalCoverage:     number | null        (overall % from coverage-summary.json total key)
  avgCoverage:       number | null        (mean coveragePct across all CoverageFile records)
  minCoverage:       { pct: number; filePath: string } | null
  scanStatus:        ScanStatus
  scanError:         string | null
  createdAt:         Date
  updatedAt:         Date

ScanJob
  id:           UUID
  repositoryId: UUID (FK → Repository)
  status:       ScanStatus
  workDir:      string
  errorMessage: string | null
  logOutput:    string              (newline-delimited, appended during pipeline)
  createdAt:    Date
  updatedAt:    Date

CoverageFile
  id:           UUID
  repositoryId: UUID (FK → Repository)
  filePath:     string              (relative to repo root)
  coveragePct:  number              (min of statements/branches/functions/lines)
  statements:   number              (%)
  branches:     number              (%)
  functions:    number              (%)
  lines:        number              (%)

ImprovementJob
  id:           UUID
  repositoryId: UUID (FK → Repository)
  filePath:     string              (relative to repo root)
  status:       ImprovementStatus
  workDir:      string
  branchName:   string              (upcover/{jobId}/{file-slug})
  prUrl:        string | null
  errorMessage: string | null
  logOutput:    string
  testsPass:    boolean | null
  createdAt:    Date
  updatedAt:    Date
```

### Value Objects

| Name | Values |
|---|---|
| `ScanStatus` | `NOT_STARTED`, `CLONING`, `SCANNING`, `INSTALLING`, `TESTING`, `COMPLETE`, `FAILED` |
| `ImprovementStatus` | `QUEUED`, `CLONING`, `GENERATING`, `TESTING`, `PUSHING`, `CREATING_PR`, `COMPLETE`, `FAILED`, `CANCELLED` |
| `PackageManager` | `npm`, `yarn`, `pnpm` |
| `TestFramework` | `jest`, `vitest` |
| `CoverageFramework` | `istanbul`, `v8` |

### Domain Services

| Service | Responsibility |
|---|---|
| `FrameworkDetector` | Inspects cloned repo files to determine package manager, test framework, and coverage framework. Also detects monorepos. |
| `CoverageParser` | Reads `coverage-summary.json` and produces structured per-file coverage data. |
| `PrNamingService` | Generates branch names (`upcover/{jobId}/{file-slug}`) and PR titles from a job ID and file path. |

### Application Services (Use Cases)

| Service | Responsibility |
|---|---|
| `RepositoryService` | Validates and registers a new repository (PAT check, language check, DB creation). |
| `ScanOrchestrator` | Drives the full scan pipeline: clone → detect → install → test → parse → persist. Emits SSE events at each step. |
| `ImprovementOrchestrator` | Manages per-repo job queues and drives the improvement pipeline for each job. Emits SSE events. |

### Infrastructure Layer

| Component | Technology |
|---|---|
| `GitHubClient` | `@octokit/rest` — repository permissions check, languages API, PR creation |
| `OllamaClient` | Fetch-based streaming client for the Ollama REST API |
| `GitClient` | `simple-git` — clone, branch, stage, commit, push |
| `SqliteRepositoryRepo` | TypeORM + `better-sqlite3` |
| `SqliteScanJobRepo` | TypeORM + `better-sqlite3` |
| `SqliteImprovementJobRepo` | TypeORM + `better-sqlite3` |
| `SseEmitter` | NestJS SSE — broadcasts domain events to subscribed frontend clients |
| `JobQueueService` | In-memory `Map<repositoryId, Queue>` — serializes improvement jobs per repo |
| `CleanupService` | NestJS `@Interval` — purges failed scan workspace directories on `CLEANUP_INTERVAL_MS` |

---

## 5. Database Schema

### `repositories`

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT (UUID) | PK |
| `owner` | TEXT | |
| `name` | TEXT | |
| `url` | TEXT | |
| `has_typescript` | INTEGER (bool) | |
| `total_ts_files` | INTEGER | nullable |
| `package_manager` | TEXT | nullable |
| `test_framework` | TEXT | nullable |
| `coverage_framework` | TEXT | nullable |
| `total_coverage` | REAL | nullable |
| `avg_coverage` | REAL | nullable |
| `min_coverage_pct` | REAL | nullable |
| `min_coverage_file` | TEXT | nullable |
| `scan_status` | TEXT | `ScanStatus` enum value |
| `scan_error` | TEXT | nullable |
| `created_at` | TEXT (ISO 8601) | |
| `updated_at` | TEXT (ISO 8601) | |

### `scan_jobs`

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT (UUID) | PK |
| `repository_id` | TEXT | FK → `repositories.id` |
| `status` | TEXT | `ScanStatus` |
| `work_dir` | TEXT | |
| `error_message` | TEXT | nullable |
| `log_output` | TEXT | newline-delimited CLI output |
| `created_at` | TEXT | |
| `updated_at` | TEXT | |

### `coverage_files`

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT (UUID) | PK |
| `repository_id` | TEXT | FK → `repositories.id` |
| `file_path` | TEXT | |
| `coverage_pct` | REAL | min across all dimensions |
| `statements` | REAL | % |
| `branches` | REAL | % |
| `functions` | REAL | % |
| `lines` | REAL | % |

### `improvement_jobs`

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT (UUID) | PK |
| `repository_id` | TEXT | FK → `repositories.id` |
| `file_path` | TEXT | |
| `status` | TEXT | `ImprovementStatus` |
| `work_dir` | TEXT | |
| `branch_name` | TEXT | |
| `pr_url` | TEXT | nullable |
| `error_message` | TEXT | nullable |
| `log_output` | TEXT | |
| `tests_pass` | INTEGER (bool) | nullable |
| `created_at` | TEXT | |
| `updated_at` | TEXT | |

**Indexes:** `scan_jobs(repository_id)`, `coverage_files(repository_id)`, `improvement_jobs(repository_id, file_path)`

