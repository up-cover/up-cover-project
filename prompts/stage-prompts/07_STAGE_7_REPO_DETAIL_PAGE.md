# Stage 7 — Repository detail page (prompt)

**Include:** `prompts/00_GLOBAL_RULES.md`, `prompts/04_API_AND_SSE.md`, `prompts/05_USER_FLOW_AND_UI.md`, Stage 7 section from `prompts/09_BUILD_STAGES.md`

## Prompt

Implement **Stage 7 — Repository Detail Page** only.

Backend:
- Implement:
  - `GET /api/repositories/:id`
  - `GET /api/repositories/:id/coverage-files` (paginated, sorted by `coverage_pct` asc)

Frontend:
- Implement `RepoDetailPage` with metadata summary + `CoverageFileTable`.
- Sort lowest coverage first; highlight rows where `coveragePct < COVERAGE_THRESHOLD`.
- Disable Improve button when file is too large (`FILE_SIZE_LIMIT_KB`) or has an active job (you can stub active-job detection until Stage 8 exists, but keep the UI states ready).

Constraints:
- Follow `00_GLOBAL_RULES.md` exactly.
- Do not implement improvement pipeline yet (Stage 8).

Output:
- List files touched and manual test plan.

