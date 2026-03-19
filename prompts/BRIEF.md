UpCover
Assignment
Technical Task — TS Coverage Improver


Objective
Develop a NestJS service using Node.js and SQLite that automatically improves TypeScript test coverage in GitHub repositories by generating *.test.ts files via any AI CLI and submitting them as pull requests.

> **How we achieved this:** A NestJS backend clones target GitHub repositories, runs their existing test suites with coverage enabled, and uses an AI LLM client (Claude or Ollama) to generate `*.test.ts` files. The generated tests are committed to a feature branch and submitted as a GitHub pull request via the Octokit REST API. The entire flow is orchestrated by `ImprovementOrchestrator` and persisted in SQLite via TypeORM.


Requirements


Functional

**Requirement:** The system should connect to a GitHub repository and analyze its existing test coverage to identify TypeScript files that need better test coverage (for example, those below 80%).

> **How we achieved this:** Users register a GitHub repository URL via `POST /repositories`. The `ScanOrchestrator` then clones the repo (shallow), auto-detects the package manager (npm/yarn/pnpm), test framework (Jest/Vitest), and coverage framework (Istanbul/V8) using `FrameworkDetector`. It installs dependencies and runs `test:coverage` (with fallbacks), then parses the resulting `coverage-summary.json` via `CoverageParser`. Per-file coverage percentages (statements, branches, functions, lines) are stored as `CoverageFileEntity` records in SQLite. The frontend highlights any file below the 80% threshold.

---

**Requirement:** It should provide a clear and simple way to display this information, either through a command-line interface or a minimal web dashboard using React.js. The display should include each file's coverage percentage, the progress of any ongoing improvements, and a link to the resulting pull request when available.

> **How we achieved this:** A React 18 + Vite frontend serves a two-page dashboard. The Landing Page lists all registered repositories with their scan status and aggregate coverage stats (total, avg, min). The Repo Detail Page shows a paginated `CoverageFileTable` with per-file coverage percentages across all four metrics, colour-coded rows for files below threshold, expandable improvement job history per file (with live status badges and log output), and a "View PR" link once an improvement completes. Real-time updates flow via Server-Sent Events (SSE) using the `useSSE` hook, so progress and PR links appear without polling or page refresh.

---

**Requirement:** When a user requests to improve a file's coverage, the system should automatically perform all necessary actions to create a proposed improvement. This includes preparing a copy of the repository, generating or enhancing the tests with an AI tool, and suggesting the changes back to GitHub as a pull request.

> **How we achieved this:** Clicking "Improve" on a file calls `POST /repositories/:id/files/:fileId/improve`. The `ImprovementOrchestrator` runs a 7-step pipeline: (1) **CLONING** — full clone of the repo into an isolated workspace directory; (2) **GENERATING** — `LlmClient.buildPrompt()` assembles source file, existing tests, related imports, `package.json`, and `CONTRIBUTING.md`/`AGENTS.md`/`CLAUDE.md` into a rich prompt, then calls Claude (`@anthropic-ai/sdk`) or Ollama (`/api/generate`) to stream the test file; (3–5) **TESTING** — installs dependencies, runs baseline coverage, writes the generated test, runs the scoped test suite, and captures the "after" coverage delta; (6) **PUSHING** — commits the test file and pushes a branch named `upcover/${jobId}/${fileSlug}`; (7) **CREATING_PR** — calls `GitHubClient.createPullRequest()` (Octokit) with a formatted body showing coverage before/after/delta, then stores the PR URL.

---

**Requirement:** The improvement process should run in the background, allowing the user to check on its progress and see results once the process is complete.

> **How we achieved this:** `ImprovementOrchestrator.enqueueImprovement()` returns immediately after creating the job record (status `QUEUED`). The pipeline runs asynchronously via `JobQueueService`. At every status transition the orchestrator updates the database and emits an SSE event on the `job:${jobId}` channel. The `ImprovementJobEntry` component subscribes to that channel so the UI receives status updates and streaming log lines in real-time without any polling.

---

Architecture & Design (DDD)
Follow Domain-Driven Design (DDD) principles:

**Requirement:** Separate Domain, Application, and Infrastructure layers.

> **How we achieved this:** The backend is structured into three explicit layers under `src/`:
> - **Domain** (`src/domain/`) — pure TypeScript enums (`ImprovementStatus`, `ScanStatus`, `PackageManager`, `TestFramework`, `CoverageFramework`), domain interfaces (`IRepository`, `ICoverageFile`, `IScanJob`, `IImprovementJob`, repository contracts), and stateless domain services (`CoverageParser`, `FrameworkDetector`). Zero NestJS or TypeORM imports.
> - **Application** (`src/repositories/`, `src/scan/`, `src/improvement/`, `src/sse/`) — NestJS modules, controllers, orchestrators (`ScanOrchestrator`, `ImprovementOrchestrator`), `RepositoriesService`, and `JobQueueService`. Depends on domain interfaces and infrastructure abstractions.
> - **Infrastructure** (`src/infrastructure/`) — concrete implementations: TypeORM entities and repositories (`persistence/`), `GitClient` (simple-git), `GitHubClient` (Octokit), `ClaudeClient` + `OllamaClient` (both extend abstract `LlmClient`), and `SseEmitterService` (RxJS Subjects).

---

**Requirement:** Keep business logic framework-independent.

> **How we achieved this:** `CoverageParser` and `FrameworkDetector` are plain TypeScript classes with no NestJS decorators. Domain interfaces define all contracts; the application layer depends on those interfaces, not on TypeORM entities directly. The abstract `LlmClient` base class holds the shared prompt-building logic independently of whichever HTTP transport is used.

---

**Requirement:** Model entities, value objects, and domain services for coverage scanning and improvement jobs.

> **How we achieved this:** Domain interfaces model the core aggregates: `IRepository` (root, holds scan state and framework metadata), `ICoverageFile` (per-file coverage metrics — statements, branches, functions, lines), `IScanJob` and `IImprovementJob` (lifecycle tracking with status enums as value objects). `CoverageParser` is a domain service that transforms raw `coverage-summary.json` into `ICoverageFile` arrays. `FrameworkDetector` is a domain service that inspects `package.json` to produce `PackageManager`, `TestFramework`, and `CoverageFramework` value objects. TypeORM entities in the infrastructure layer implement these interfaces but are kept separate from domain logic.

---

Non‑Functional

**Requirement:** Security: isolate AI CLI runs; secure tokens and secrets.

> **How we achieved this:** Each scan and improvement job clones into its own uniquely-named workspace directory under `CLONE_DIR` (`./workspaces` by default), isolating all file operations. Child processes (npm install, test runner) are spawned with a 10-minute timeout and 50 MB output buffer cap. `GITHUB_TOKEN` is injected into git remote URLs at runtime and never logged; `CLAUDE_API_KEY` is passed directly to the Anthropic SDK and never written to disk. A `CleanupService` running on an `@Interval` deletes stale workspace directories for failed jobs to prevent unbounded disk growth. File size is capped via `FILE_SIZE_LIMIT_KB` (default 200 KB) to prevent runaway LLM context.

---

**Requirement:** Scalability: serialize jobs per repository.

> **How we achieved this:** `JobQueueService` maintains an in-memory FIFO queue keyed by `repositoryId`. Only one improvement job runs per repository at a time — new jobs are enqueued and wait until the running job reaches a terminal state. This prevents concurrent git operations on the same clone directory and ensures deterministic coverage measurements. On server restart, any `IN_PROGRESS` jobs are marked `FAILED` (handled in `ImprovementOrchestrator.onModuleInit`) so the queue starts clean.

---

Technical Stack

- **NestJS** — ✅ NestJS 10 for the backend, using modules, controllers, services, interceptors, and `@Interval` scheduling.
- **React** — ✅ React 18 with Vite 5, React Router 7, Tailwind CSS, and Shadcn/ui components for the frontend dashboard.
- **Node.js** — ✅ Node.js runtime throughout; child processes spawned via `exec()` for test runners and git operations.
- **SQLite** — ✅ SQLite via `better-sqlite3` with TypeORM 0.3 as the ORM layer. Schema auto-synchronises on startup.

---

Deliverables

**Requirement:** Backend service implementing coverage parsing, AI CLI integration, job handling, and persistence (SQLite) with DDD layering.

> **How we achieved this:** The `backend/` directory is a fully-functional NestJS application. Coverage parsing is handled by `CoverageParser`; AI integration by `ClaudeClient`/`OllamaClient` (selectable via `LLM_PROVIDER` env var); job handling by `ImprovementOrchestrator` + `JobQueueService`; persistence by TypeORM with four entities across SQLite; DDD layering enforced by the directory structure described above.

---

**Requirement:** Frontend application (CLI or minimal React.js dashboard) displaying each file's coverage percentage, the progress of ongoing improvements, and a link to the resulting pull request when available.

> **How we achieved this:** The `frontend/` directory is a React 18 + Vite SPA. It shows per-file coverage across all four metrics, real-time improvement job progress via SSE (with status badges and streaming log output), and a "View PR" button linking directly to the GitHub pull request once `COMPLETE`. Coverage percentages below the threshold are highlighted. The `useSSE` hook handles automatic reconnection.

---

**Requirement:** Documentation: setup instructions, optional .env.example, step‑by‑step guide, and short domain glossary/diagram.

> **How we achieved this:** `README.md` in the repo root covers prerequisites, environment variable reference (with an `.env.example`), step-by-step local setup for both backend and frontend, how to register a repository and trigger an improvement, and a domain glossary defining all key terms (Repository, ScanJob, ImprovementJob, CoverageFile, LLM Provider, Workspace). An architecture diagram illustrates the DDD layer boundaries and data flow.

---

Evaluation Criteria

**Correctness: meets all functional goals.**
> All four functional requirements are implemented end-to-end: repository registration and coverage analysis, React dashboard with real-time updates, automated improvement pipeline producing a GitHub PR, and background execution with live progress.

**DDD Implementation: clear separation of layers, well-defined domain model.**
> Three explicit layers under `src/domain/`, `src/infrastructure/`, and the application modules. Domain has no framework dependencies. Repository pattern abstracts persistence behind domain interfaces.

**Code Quality: modular, readable, maintainable.**
> Each feature (repositories, scan, improvement, SSE, health) lives in its own NestJS module. Orchestrators handle workflow; services handle single responsibilities. Abstract `LlmClient` makes adding a new AI provider a matter of implementing one class. TypeScript strict mode throughout.

**GitHub Automation: successfully creates PRs with generated tests.**
> `GitHubClient.createPullRequest()` uses Octokit to open PRs on the target repository. PR body includes a Markdown table with coverage before/after/delta, the job ID, and the branch name. The PR URL is stored and surfaced in the UI.

**Reliability: resilient job handling and error recovery.**
> Jobs transition to `FAILED` on any unhandled exception and the error message is persisted. On restart, orphaned `IN_PROGRESS` jobs are reset to `FAILED`. Per-repo serialisation prevents race conditions. Subprocess timeouts prevent hung jobs. `CleanupService` prevents disk exhaustion. SSE reconnects automatically on connection loss.

---

Tools & Assistance
AI POLICY - please read:
Our coding assessments are designed to simulate real-world engineering challenges at UpCover. We acknowledge the transparent use of generative AI tools, such as ChatGPT and Co-pilot however, we expect you to be able to discuss the technical decisions you make.

---

Clarifications
If any part of the task is unclear, the candidate may define their own assumptions or additional requirements, as long as the main objective remains clear — to improve coverage for third-party TypeScript repositories by generating meaningful automated tests.

---

Acceptance & Submission
Working demo showing:

**Low-coverage file detection.**
> Demonstrated by registering any TypeScript GitHub repository. After the scan completes, the Repo Detail Page shows all files with their coverage percentages; files below 80% are highlighted and have the "Improve" button enabled.

**Test generation flow producing a PR.**
> Clicking "Improve" on a low-coverage file triggers the full pipeline. The UI shows transitions through CLONING → GENERATING → TESTING → PUSHING → CREATING_PR → COMPLETE, with a "View PR" link at the end pointing to the opened pull request on GitHub.

**Job progress and PR link output.**
> The `ImprovementJobEntry` component subscribes to SSE and renders the current status badge, a live log stream, and (on completion) the PR URL and coverage delta (e.g. Δ+12.5%).

---

Candidates unable to complete all requirements must document encountered issues and proposed solutions.

Candidate should present their outcome and reasoning in a short demo session.

Submit via:

GitHub repo with backend/ folder, README.md, and at least one example PR showing improved coverage

Zip. file
