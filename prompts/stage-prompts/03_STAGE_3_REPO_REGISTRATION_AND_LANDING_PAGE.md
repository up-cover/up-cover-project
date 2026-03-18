# Stage 3 — Repository registration + landing page (prompt)

**Include:** `prompts/00_GLOBAL_RULES.md`, `prompts/02_CONFIG.md`, `prompts/04_API_AND_SSE.md`, `prompts/05_USER_FLOW_AND_UI.md`, `prompts/07_ERRORS.md`, Stage 3 section from `prompts/09_BUILD_STAGES.md`

## Prompt

Implement **Stage 3 — Repository Registration (Landing Page)** only.

Backend:
- Implement `RepositoryService.register(owner, repo)`:
  - GitHub PAT permission check via `@octokit/rest` (`GITHUB_TOKEN` env var).
  - Languages check and enforce `TS_SIZE_THRESHOLD`.
  - Duplicate repo prevention.
  - Persist `Repository` record with `scanStatus: NOT_STARTED`.
- Implement controllers:
  - `POST /api/repositories`
  - `GET /api/repositories`

Frontend:
- Landing page with repo input form + inline repo list (no navigation on add).
- Accept URL formats described in `05_USER_FLOW_AND_UI.md` and normalize to `owner/repo`.
- Show specific user-facing errors per `07_ERRORS.md`.

Constraints:
- Follow `00_GLOBAL_RULES.md` exactly.
- Do not implement scanning yet (no Stage 4).

Output:
- List files touched and a quick manual test plan.

