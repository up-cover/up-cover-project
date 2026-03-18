# Stage 1 — Project scaffold (prompt)

**Include:** `prompts/00_GLOBAL_RULES.md`, `prompts/01_SUMMARY_AND_ARCH.md`, `prompts/02_CONFIG.md`, Stage 1 section from `prompts/09_BUILD_STAGES.md`

## Prompt

Implement **Stage 1 — Project Scaffold** only.

Requirements:
- Create `backend/` (NestJS) and `frontend/` (Vite + React).
- Configure Tailwind + shadcn/ui in frontend.
- Configure SQLite via TypeORM + `better-sqlite3` in backend.
- Load env vars from `.env` (also add `.env.example` skeleton if needed).
- Implement `GET /api/health` returning `{ "status": "ok" }`.
- Frontend should call health on load and display status.

Constraints:
- Follow `00_GLOBAL_RULES.md` exactly.
- Keep UI simple.
- Do not start Stage 2.

Output:
- Create/modify files as needed.
- After changes, list files touched and how to run both apps locally.

