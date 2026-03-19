# Stage 8 — Improvement pipeline (prompt)

**Include:** `prompts/00_GLOBAL_RULES.md`, `prompts/02_CONFIG.md`, `prompts/03_DOMAIN_AND_DB.md`, `prompts/04_API_AND_SSE.md`, `prompts/05_USER_FLOW_AND_UI.md` (improvement pipeline parts), `prompts/07_ERRORS.md`, Stage 8 section from `prompts/09_BUILD_STAGES.md`

## Prompt

Implement **Stage 8 — Improvement Pipeline** only.

Backend:
- Implement per-repo in-memory queue `JobQueueService` (serialize jobs per repo).
- Implement `ImprovementOrchestrator` with states: `QUEUED → CLONING → GENERATING → TESTING → PUSHING → CREATING_PR → COMPLETE` (+ failure/cancel).
- Implement endpoints:
  - `POST /api/repositories/:id/files/:fileId/improve`
  - `DELETE /api/improvement-jobs/:jobId`
- Implement `OllamaClient` (streaming) and enforce strict output rules (strip fences; fail if invalid TS).
- Enforce test-generation contract and scoped test execution rules.
- Compute **per-file** test coverage `coveragePct` (lines.pct only) **before** writing the generated test file and persist `coverageBeforePct` on the improvement job record.
- After writing the generated test file and confirming scoped tests pass, rerun coverage and compute the **same file’s** `coveragePct` as `coverageAfterPct`, plus `coverageDeltaPct = after - before`; persist both on the improvement job record.
- Ensure the coverage deltas are computed for `coverageFile.filePath` only (do not compute an aggregate delta).
- Include `coverageBeforePct`, `coverageAfterPct`, and `coverageDeltaPct` in the pull request body (alongside the target file path).
- Implement branch naming + PR creation rules; fail if branch already exists remotely.
- Emit SSE events `job:updated` and `job:log` (logs only when `DEBUG_OUTPUT=true`).

Constraints:
- Follow `00_GLOBAL_RULES.md` exactly.
- Do not implement improvement UI yet (Stage 9).

Output:
- List files touched and how to run one improvement end-to-end.

