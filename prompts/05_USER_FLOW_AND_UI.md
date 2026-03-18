# UpCover — User flow & frontend UI spec

> Source: `OUTLINE.md` → Sections 7–8

## 7. User Flow — Stage by Stage

### Stage 1: Landing Page

**Goal:** Accept a GitHub repository URL and validate it is scannable. The same page also displays all previously registered repositories.

**Layout:**
- Top section: repository input form
- Below the form: list of all registered repositories, each rendered as a `RepoCard`

**Input formats accepted:**
- `https://github.com/owner/repo`
- `https://github.com/owner/repo/tree/main/some/path` (extra path segments ignored)
- `owner/repo`

**On submit:**
1. Normalise input → `owner/repo`
2. `POST /api/repositories` with `{ owner, repo }`
3. Backend validates:
   - `GET /repos/{owner}/{repo}` — checks repo exists and token permissions (must support pushing a branch and creating a PR)
   - `GET /repos/{owner}/{repo}/languages` — checks TypeScript present and total TS bytes ≥ `TS_SIZE_THRESHOLD`
4. If any check fails → display a specific error below the form (see Error Catalogue)
5. If all pass → create `Repository` record in DB with `scanStatus: NOT_STARTED` → new `RepoCard` appears in the list; form clears

---

### Stage 2: Scannable Repo List (on Landing Page)

**Goal:** Display all registered repositories with current scan state, inline on the landing page.

Each repository is rendered as a `RepoCard` showing:

| Field | Initial value |
|---|---|
| Repo owner | known |
| Repo name | known |
| Repo URL | known |
| Has TypeScript | `true` |
| Total TS files | `—` |
| Package manager | `—` |
| Test framework | `—` |
| Coverage framework | `—` |
| Total TS coverage | `—` |
| Average TS coverage | `—` |
| Min TS coverage | `—` |
| Scan status | `not started` |

**Actions:**
- "Start Scan" button → `POST /api/repositories/:id/scan` → card subscribes to SSE stream and updates in real time

---

### Stage 3: Scan Pipeline

**State machine:**

```
NOT_STARTED ──► CLONING ──► SCANNING ──► INSTALLING ──► TESTING ──► COMPLETE
                   │             │              │             │
                   ▼             ▼              ▼             ▼
                FAILED        FAILED         FAILED        FAILED
```

**Steps:**

**CLONING**
- `git clone {repoUrl}` into `{CLONE_DIR}/{repoId}-{scanJobId}/`
- Emit `repo:updated` with `scanStatus: CLONING`
- Stream git clone stdout/stderr to `logOutput`; emit each line as `scan:log` (if `DEBUG_OUTPUT`)
- On failure → `scanStatus: FAILED`, `scanError` set, "Rescan" button shown

**SCANNING**
- Count `.ts` / `.tsx` files (excluding `node_modules`, `dist`, `.git`)
- Detect package manager via lockfile (`package-lock.json` → npm, `yarn.lock` → yarn, `pnpm-lock.yaml` → pnpm)
- Detect test framework via `package.json` devDependencies (`jest` or `vitest`) or presence of `jest.config.*` / `vitest.config.*`
- Detect coverage framework from test config (`istanbul`/`c8` for Jest, `v8` for Vitest)
- Detect monorepo (intentionally strict; fail on any strong signal): `workspaces` key in root `package.json`, `pnpm-workspace.yaml`, `lerna.json`, `nx.json`, `turbo.json`, or other credible workspace tooling indicators → FAILED with `MONOREPO_DETECTED`
- Validate all detected frameworks against supported matrix; unsupported → FAILED
- Emit each detection result as a `scan:log` line (e.g. `"detected package manager: pnpm"`) (if `DEBUG_OUTPUT`)
- Update repo fields and emit `repo:updated`. Show green badge per framework if supported, red if not.

**INSTALLING**
- Run `{packageManager} install` in clone directory
- Stream stdout/stderr to `logOutput`; emit each line as `scan:log` (if `DEBUG_OUTPUT`)
- On failure → FAILED

**TESTING**
- Configure test runner to emit `coverage-summary.json`:
  - Jest: `--coverage --coverageReporters=json-summary`
  - Vitest: `--coverage --coverage.reporter=json-summary`
- Run tests; stream stdout/stderr to `logOutput`; emit each line as `scan:log` (if `DEBUG_OUTPUT`)
- On non-zero exit → FAILED with test output
- Parse `coverage-summary.json`:
  - Per file: extract `statements.pct`, `branches.pct`, `functions.pct`, `lines.pct`; store as `CoverageFile` records with `coveragePct = lines.pct` (**limitation:** ignores other dimensions for ranking/thresholds)
  - Compute `totalCoverage` (from the `total` key), `avgCoverage` (mean of file `coveragePct`), `minCoverage` (file with lowest `coveragePct`)
  - Persist to DB, emit `repo:updated`
- Status → COMPLETE

**On any failure:**
- Display error message in card
- Show "Rescan" button (only available when `scanStatus === FAILED`)
- Failed workspace directory is **not deleted** — retained for debugging
- `CleanupService` purges failed workspace directories on the `CLEANUP_INTERVAL_MS` schedule

**On COMPLETE:**
- Show "View Details" link/button

---

### Stage 4: Repository Detail Page

**Goal:** Full coverage report view with per-file improvement controls.

**Layout:**
- Top section: all repo metadata (same fields as card, fully populated)
- Coverage file list:
  - Sorted by `coveragePct` ascending (lowest coverage first)
  - Files with `coveragePct < COVERAGE_THRESHOLD` highlighted (red/amber row)
  - Each row shows: `filePath`, `statements %`, `branches %`, `functions %`, `lines %`, `coveragePct`
  - Files where source file size > `FILE_SIZE_LIMIT_KB`: **Improve** button disabled with tooltip: *"File exceeds {limit}KB — too large for AI improvement"*
  - Files with an active (non-terminal) improvement job: **Improve** button disabled
  - Otherwise: **Improve** button enabled → triggers improvement flow
- Each file row is expandable to show its `ImprovementJobList`

---

### Stage 5: Improvement Pipeline

**Goal:** Generate improved tests, verify they pass, and create a pull request.

**State machine:**

```
QUEUED ──► CLONING ──► GENERATING ──► TESTING ──► PUSHING ──► CREATING_PR ──► COMPLETE
              │              │             │           │             │
              ▼              ▼             ▼           ▼             ▼
           FAILED          FAILED        FAILED     FAILED        FAILED
```

**Steps:**

**QUEUED**
- Job is added to the in-memory per-repo queue (`Map<repositoryId, Queue>`)
- If no other job is active for this repo, processing begins immediately

**CLONING**
- `git clone {repoUrl}` into `{CLONE_DIR}/improve-{jobId}/`
- Create and checkout branch: `upcover/{jobId}/{file-slug}`
  - `file-slug` = `filePath` with `/` and `.` replaced by `-`, lowercased (e.g. `src-utils-parser-ts`)
- Stream git clone stdout/stderr to `logOutput`; emit each line as `job:log` (if `DEBUG_OUTPUT`)
- Emit `job:updated`

**GENERATING**
- Construct Ollama prompt containing:
  - The source file contents (`filePath`)
  - The existing test file contents (if a co-located `*.test.ts` or `*.spec.ts` exists)
  - `CONTRIBUTING.md` from repo root (if present)
  - Instruction: generate a complete, passing `*.test.ts` file that improves coverage
- Stream Ollama response tokens to `logOutput`; emit each token/line as `job:log` (if `DEBUG_OUTPUT`)
- Write completed generated content to the test file path

**TESTING**
- Run `{packageManager} install` (in the fresh clone); stream stdout/stderr as `job:log` (if `DEBUG_OUTPUT`)
- Run tests scoped to the generated test file; stream stdout/stderr to `logOutput`; emit each line as `job:log` (if `DEBUG_OUTPUT`)
- If tests fail → status: FAILED, `testsPass: false`, error message includes test output
- If tests pass → `testsPass: true`, continue

**PUSHING**
- `git add {testFilePath}`
- `git commit -m "test({file-slug}): improve test coverage via UpCover"`
- Stream git push stdout/stderr as `job:log` (if `DEBUG_OUTPUT`)
- `git push origin {branchName}`

**CREATING_PR**
- `POST /repos/{owner}/{repo}/pulls` via GitHub API:
  - `title`: `[UpCover] Improve test coverage for {filePath}`
  - `body`: Markdown including file path, job ID, UpCover attribution
  - `head`: `{branchName}`
  - `base`: repo default branch
- Record `prUrl` in DB → status: COMPLETE

**Cancellation:**
- User clicks "Remove" on a job entry at any time
- `DELETE /api/improvement-jobs/:jobId`
- Backend: terminate any running child process, delete workspace directory, set status: CANCELLED

**Multiple jobs per file:**
- Each click of "Improve" creates a new `ImprovementJob`
- All jobs for a file appear in the expandable list under that file row
- COMPLETE jobs show: status badge, PR URL link
- FAILED jobs show: status badge, error message, (optionally) CLI log

---

## 8. Frontend Component Hierarchy

```
App (React Router)
├── LandingPage                — single home page: input form + repo list
│   ├── RepoInputForm
│   │   └── Input (shadcn/ui)
│   ├── ErrorBanner
│   └── RepoCard (one per repository, SSE-connected via useSSE)
│       ├── RepoMetaGrid       — tabular display of all repo fields
│       ├── FrameworkBadges    — green/red badges for packageManager, testFramework, coverageFramework
│       ├── ScanStatusBadge
│       ├── DebugLog           — collapsible, visible only if DEBUG_OUTPUT=true
│       ├── ErrorMessage       — shown on FAILED status
│       └── ScanActionButton   — "Start Scan" | "Rescan" | "View Details"
│
└── RepoDetailPage
    ├── BackLink
    ├── RepoMetaSummary        — all fields, fully expanded
    └── CoverageFileTable
        └── CoverageFileRow (one per CoverageFile, sorted by coveragePct asc)
            ├── CoverageCells  — filePath, statements%, branches%, functions%, lines%, overall%
            ├── ImproveButton  — disabled states: file too large | active job in progress
            └── ImprovementJobList (expandable accordion)
                └── ImprovementJobEntry (SSE-connected via useSSE)
                    ├── StatusBadge
                    ├── DebugLog      — collapsible, visible if DEBUG_OUTPUT
                    ├── ErrorMessage
                    ├── PrLink        — shown on COMPLETE
                    └── RemoveButton  — calls DELETE /api/improvement-jobs/:jobId
```

**`DebugLog` component spec** (rendered when `DEBUG_OUTPUT=true`):
- Black background (`bg-black`), monospace font (`font-mono`), small text (`text-xs`), light-coloured text (`text-green-400`)
- Fixed-height scrollable container (`max-h-64 overflow-y-auto`); auto-scrolls to the bottom as new lines arrive
- Collapsible accordion (collapsed by default); automatically expands when the first `scan:log` / `job:log` event is received for that job
- Each log line rendered as a `<p>` with a leading `>` prompt character to reinforce the terminal aesthetic
- Rendered inside `RepoCard` (scan logs) and `ImprovementJobEntry` (improvement logs), gated on `DEBUG_OUTPUT`

**Shared hooks:**
- `useSSE(url)` — wraps `EventSource`, returns latest event data, handles reconnection
- `useRepository(id)` — React Query query + SSE subscription combined
- `useImprovementJob(id)` — React Query query + SSE subscription combined

