# UpCover — Summary & architecture

> Source: `OUTLINE.md` → Sections 1–2

## 1. Project Summary

UpCover is a single-user, locally-hosted developer tool that connects to a GitHub repository, identifies TypeScript files with low test coverage, and uses an AI LLM (Claude or Ollama) to generate improved test files. The generated tests are verified to pass before being submitted as a pull request on the target repository. The system follows Domain-Driven Design (DDD) principles with clearly separated Domain, Application, and Infrastructure layers. All long-running work (scanning, test generation) runs as background jobs with real-time progress streamed to the frontend via Server-Sent Events.

---

## 2. Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| **Real-time updates** | Server-Sent Events (SSE) | One-directional, HTTP-native, no WebSocket handshake complexity. Sufficient for job progress push from server → client. |
| **Supported test frameworks** | Jest, Vitest | Cover >95% of modern TypeScript projects. Mocha/AVA/Bun test are out of scope for v1. |
| **Supported package managers** | npm, yarn, pnpm | Cover >99% of TS projects. Detected via lockfile presence. Bun out of scope v1. |
| **Coverage format** | JSON summary (`coverage-summary.json`) | Both Jest and Vitest can emit this format. Trivial to parse; provides per-file statement/branch/function/line percentages. |
| **Post-generation verification** | Run tests before creating PR | Ensures PRs contain passing tests. If generated tests fail, the job is marked FAILED with the test output shown to the user. |
| **Oversized source files** | Disable Improve button + tooltip | Files exceeding `FILE_SIZE_LIMIT_KB` cannot be reliably processed within a typical LLM context window. Disabling is clearer UX than silent truncation. |
| **Improvement workspace isolation** | Fresh git clone per improvement job | Complete isolation — no shared state between concurrent jobs. Avoids branch conflicts and dirty working trees. |
| **Branch & PR naming** | `upcover/{jobId}/{file-slug}` | Globally unique (job ID), human-readable (file slug), and traceable back to a specific job record in the database. |
| **Monorepo handling** | Detection disabled — scan any repo | Monorepo detection is disabled. The tool attempts to scan any repo regardless of workspace tooling. |
| **Server restart behaviour** | In-progress jobs marked FAILED on restart | Jobs in CLONING, GENERATING, TESTING, PUSHING, or CREATING_PR are marked FAILED with an INTERRUPTED message. Simplest recovery path; user can rescan or retry. |
| **Job concurrency** | 1 active job per repo; multiple repos in parallel | Matches the brief's "serialize jobs per repository" requirement. Prevents concurrent git operations on the same clone directory. |
| **PAT validation** | GitHub API permission check (no git dry-run) | Avoids the latency of an actual clone. Use `GET /repos/{owner}/{repo}` to verify repo visibility and token permissions (must allow cloning, pushing a branch, and creating a PR). |
| **Frontend styling** | Tailwind CSS + shadcn/ui | Utility-first CSS with accessible, composable components. Fast to build, consistent design language, no custom CSS overhead. |
| **DDD layer separation** | Domain → Application → Infrastructure | Business logic (coverage thresholds, job state transitions) lives in the Domain layer with zero framework dependencies. NestJS wiring lives in Infrastructure. This makes the domain independently testable. |

