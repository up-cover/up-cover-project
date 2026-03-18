# Stage 9 — Improvement job UI (prompt)

**Include:** `prompts/00_GLOBAL_RULES.md`, `prompts/05_USER_FLOW_AND_UI.md`, `prompts/04_API_AND_SSE.md`, Stage 9 section from `prompts/09_BUILD_STAGES.md`

## Prompt

Implement **Stage 9 — Improvement Job UI** only.

Frontend:
- Implement `ImprovementJobList` accordion per coverage file row.
- Implement `ImprovementJobEntry` subscribing to `/api/sse/improvement-jobs/:jobId`.
- Show status badges, error messages, PR link on COMPLETE, and Remove button calling `DELETE /api/improvement-jobs/:jobId`.
- Implement `DebugLog` behavior for job logs (same spec; gated by `DEBUG_OUTPUT`).

Constraints:
- Follow `00_GLOBAL_RULES.md` exactly.
- Do not change backend pipeline behavior beyond what’s needed for UI wiring.

Output:
- List files touched and click-test steps.

