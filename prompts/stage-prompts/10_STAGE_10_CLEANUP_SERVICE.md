# Stage 10 — Cleanup service (prompt)

**Include:** `prompts/00_GLOBAL_RULES.md`, `prompts/02_CONFIG.md`, `prompts/03_DOMAIN_AND_DB.md`, Stage 10 section from `prompts/09_BUILD_STAGES.md`

## Prompt

Implement **Stage 10 — Cleanup Service** only.

Backend:
- Implement `CleanupService` with `@nestjs/schedule` `@Interval`.
- Scan `CLONE_DIR` every `CLEANUP_INTERVAL_MS`:
  - **Scan workspaces** (`{repoId}-{scanJobId}`): Delete if `ScanJob.status === FAILED` and older than interval, or if job record is orphaned (e.g. repo deleted).
  - **Improvement workspaces** (`improve-{jobId}`): Delete if job record no longer exists (orphaned).

Constraints:
- Follow `00_GLOBAL_RULES.md` exactly.
- Do not add log truncation.

Output:
- List files touched and how to verify cleanup behavior.

