# Stage 6 — Live landing page repo list UI (prompt)

**Include:** `prompts/00_GLOBAL_RULES.md`, `prompts/05_USER_FLOW_AND_UI.md`, `prompts/04_API_AND_SSE.md`, Stage 6 section from `prompts/09_BUILD_STAGES.md`

## Prompt

Implement **Stage 6 — Landing Page Repo List UI (Live)** only.

Frontend:
- Implement `RepoCard` with SSE subscription to `/api/sse/repositories/:id`.
- Implement `FrameworkBadges`, `ScanStatusBadge`, `ScanActionButton` behavior.
- Implement `DebugLog` exactly as specified (only when `DEBUG_OUTPUT=true`, auto-expand on first log).
- Ensure cards update in real time as scan progresses.

Constraints:
- Follow `00_GLOBAL_RULES.md` exactly.
- Do not implement repo detail page yet (Stage 7).

Output:
- List files touched and what UX flows to click-test.

