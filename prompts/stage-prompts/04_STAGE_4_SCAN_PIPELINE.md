# Stage 4 — Scan pipeline (prompt)

**Include:** `prompts/00_GLOBAL_RULES.md`, `prompts/02_CONFIG.md`, `prompts/03_DOMAIN_AND_DB.md`, `prompts/06_FRAMEWORK_MATRIX.md`, `prompts/07_ERRORS.md`, relevant “Scan Pipeline” parts of `prompts/05_USER_FLOW_AND_UI.md`, Stage 4 section from `prompts/09_BUILD_STAGES.md`

## Prompt

Implement **Stage 4 — Scan Pipeline** only.

Backend:
- Add `POST /api/repositories/:id/scan`.
- Implement `ScanOrchestrator` driving states: `CLONING → SCANNING → INSTALLING → TESTING → COMPLETE` with failure handling.
- Implement `FrameworkDetector` and `CoverageParser` per spec.
- Implement `GitClient` using `simple-git`.
- Persist scan state transitions to `ScanJob` + update `Repository` fields.
- Enforce strict monorepo detection and fail with `MONOREPO_DETECTED`.
- Coverage rules:
  - Choose coverage command exactly per `00_GLOBAL_RULES.md` (no modifying scripts).
  - Require `coverage-summary.json` discovery in the listed locations.
  - Compute per-file `coveragePct = lines.pct` only.
- Implement `CleanupService` interval (keep failed workspaces until cleanup).

Constraints:
- Follow `00_GLOBAL_RULES.md` exactly.
- No SSE yet (that’s Stage 5).

Output:
- List files touched and how to reproduce a scan on a sample repo.

