# Stage 5 — SSE infrastructure (prompt)

**Include:** `prompts/00_GLOBAL_RULES.md`, `prompts/04_API_AND_SSE.md`, Stage 5 section from `prompts/09_BUILD_STAGES.md`

## Prompt

Implement **Stage 5 — SSE Infrastructure** only.

Backend:
- Create an `SseModule` and `SseEmitter` service.
- Implement SSE endpoints:
  - `GET /api/sse/repositories/:id` emitting `repo:updated` and `scan:log`
  - `GET /api/sse/improvement-jobs/:jobId` emitting `job:updated` and `job:log`
- Ensure SSE format uses standard `event:` and `data:` semantics.

Frontend:
- Implement `useSSE(url)` hook wrapping `EventSource` with reconnection behavior.

Integration:
- Wire `ScanOrchestrator` (from Stage 4) to publish `repo:updated` and `scan:log` events (logs only when `DEBUG_OUTPUT=true`).

Constraints:
- Follow `00_GLOBAL_RULES.md` exactly.
- Do not implement live UI wiring yet (Stage 6).

Output:
- List files touched and how to verify SSE events locally.

