# UpCover — AI Assistant Context

> This file provides context for AI assistants working on the UpCover codebase. Detailed specs live in `prompts/`.

## Project Summary

UpCover is a single-user, locally-hosted developer tool that:

1. Connects to GitHub repositories and identifies TypeScript files with low test coverage
2. Uses an AI LLM (Claude or Ollama) to generate improved `*.test.ts` files
3. Verifies generated tests pass, then submits them as pull requests via the Octokit REST API

**Stack:** NestJS backend, React 18 + Vite frontend, SQLite (TypeORM), Tailwind + shadcn/ui.

---

## Architecture (DDD)

| Layer | Location | Responsibility |
|-------|----------|----------------|
| **Domain** | `backend/src/domain/` | Enums, interfaces, stateless services (`CoverageParser`, `FrameworkDetector`). Zero NestJS/TypeORM. |
| **Application** | `backend/src/repositories/`, `scan/`, `improvement/`, `sse/` | NestJS modules, orchestrators (`ScanOrchestrator`, `ImprovementOrchestrator`), services. |
| **Infrastructure** | `backend/src/infrastructure/` | TypeORM entities, `GitClient`, `GitHubClient`, `LlmClient` (Claude/Ollama), `SseEmitterService`. |

**Key orchestrators:**
- `ScanOrchestrator` — clone → detect frameworks → install → run coverage → parse → persist
- `ImprovementOrchestrator` — clone → generate tests (LLM) → run tests → push branch → create PR

---

## Critical Constraints (from `prompts/00_GLOBAL_RULES.md`)

- **Scope:** Single-user, local-only. No auth, no multi-user. GitHub.com only (no Enterprise).
- **Coverage metric:** Per-file `coveragePct` = **lines.pct only** (ignore statements/branches/functions for ranking).
- **Coverage discovery:** Prefer repo scripts (`test:coverage` or `coverage`); fall back to `npx jest --coverage --coverageReporters=json-summary` or `npx vitest run --coverage --coverage.reporter=json-summary`. Search for `coverage-summary.json` in `coverage/`, `./`, `./reports/**/`.
- **Test file placement:** Prefer `*.test.*` over `*.spec.*`; infer TSX when repo uses `.tsx`.
- **LLM output:** Must be **only the test file content** — no markdown fences. Strip fences if present.
- **Monorepos:** Detection disabled — scan any repo regardless of workspace tooling.
- **Git:** `GIT_BOT_NAME` / `GIT_BOT_EMAIL` configurable. No labels/assignees on PRs. If branch exists on remote → fail (no suffix/rename).
- **SSE:** Standard semantics (`event:` and `data:`). Envelope inside `data` if used.

---

## API & SSE

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/repositories` | Register repo (validates PAT + TypeScript) |
| `GET` | `/api/repositories` | List repos |
| `GET` | `/api/repositories/:id` | Repo detail |
| `POST` | `/api/repositories/:id/scan` | Start/restart scan |
| `GET` | `/api/repositories/:id/coverage-files` | Paginated coverage files |
| `POST` | `/api/repositories/:id/files/:fileId/improve` | Enqueue improvement job |
| `DELETE` | `/api/improvement-jobs/:jobId` | Cancel job |

**SSE:** `GET /api/sse/repositories/:id` → `repo:updated`, `scan:log` | `GET /api/sse/improvement-jobs/:jobId` → `job:updated`, `job:log`

---

## Domain Entities

- **Repository** — owner, name, url, scan status, framework metadata, coverage aggregates
- **ScanJob** — status, workDir, logOutput
- **CoverageFile** — filePath, coveragePct (lines), statements/branches/functions/lines %
- **ImprovementJob** — status, branchName, prUrl, testsPass, logOutput

**Status enums:** `ScanStatus` (NOT_STARTED → CLONING → SCANNING → INSTALLING → TESTING → COMPLETE/FAILED), `ImprovementStatus` (QUEUED → CLONING → GENERATING → TESTING → PUSHING → CREATING_PR → COMPLETE/FAILED/CANCELLED)

---

## Config (env vars)

| Var | Required | Default |
|-----|----------|---------|
| `GITHUB_TOKEN` | yes | — |
| `LLM_PROVIDER` | no | `ollama` |
| `CLAUDE_API_KEY` | if claude | — |
| `CLAUDE_MODEL` | no | `claude-opus-4-6` |
| `OLLAMA_URL` | no | `http://localhost:11434` |
| `OLLAMA_MODEL` | no | `deepseek-coder` |
| `PORT` | no | `3000` |
| `DB_PATH` | no | `./data/upcover.db` |
| `CLONE_DIR` | no | `./workspaces` |
| `COVERAGE_THRESHOLD` | no | `80` |
| `TS_SIZE_THRESHOLD` | no | `1000` |
| `FILE_SIZE_LIMIT_KB` | no | `200` |
| `CLEANUP_INTERVAL_MS` | no | `3600000` |
| `DEBUG_OUTPUT` | no | `false` |
| `GIT_BOT_NAME` | no | `UpCover Bot` |
| `GIT_BOT_EMAIL` | no | `upcover@local` |

---

## Prompts Directory Reference

| File | Use when |
|------|----------|
| `prompts/00_GLOBAL_RULES.md` | **Always** — hard constraints |
| `prompts/01_SUMMARY_AND_ARCH.md` | Architecture decisions |
| `prompts/02_CONFIG.md` | Full env var table |
| `prompts/03_DOMAIN_AND_DB.md` | Domain model, DB schema |
| `prompts/04_API_AND_SSE.md` | REST + SSE contracts |
| `prompts/05_USER_FLOW_AND_UI.md` | User flow, component hierarchy |
| `prompts/06_FRAMEWORK_MATRIX.md` | Package manager, test/coverage framework detection |
| `prompts/07_ERRORS.md` | Error codes and messages |
| `prompts/08_DOCS_AND_LIMITATIONS.md` | Docs requirements, known limitations |
| `prompts/09_BUILD_STAGES.md` | Implementation order |
| `prompts/stage-prompts/*.md` | Per-stage prompts (include with 00_GLOBAL_RULES + relevant contract) |

**Recommended feed order:** `00_GLOBAL_RULES.md` → relevant contract file → specific stage from `09_BUILD_STAGES.md` or `stage-prompts/`.

---

## Known Limitations (v1)

- Monorepos: detection disabled; tool attempts to scan any repo
- Test frameworks: Jest, Vitest only
- Package managers: npm, yarn, pnpm only
- No fork flow: requires direct push/PR rights on repo
- Files > `FILE_SIZE_LIMIT_KB`: Improve button disabled
- No log truncation in v1
