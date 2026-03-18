# Action Items

## Completed stages
- [x] Stage 1 — Project scaffold (NestJS + React/Vite, SQLite/TypeORM, health endpoint)
- [x] Stage 2 — Domain model + DB schema
- [x] Stage 3 — Repository registration (landing page, GitHub validation)
- [x] Stage 4 — Scan pipeline (clone → detect → install → test → parse coverage)
- [x] Stage 5 — SSE infrastructure
- [x] Stage 6 — Landing page repo list UI (live RepoCard with SSE)
- [x] Stage 7 — Repository detail page (PR pending)

## Up next
- [ ] Stage 8 — Improvement pipeline (JobQueueService, ImprovementOrchestrator, OllamaClient, POST improve endpoint, DELETE cancel endpoint)
- [ ] Stage 9 — Improvement job UI (ImprovementJobList accordion, SSE per job, PR link, remove button)
- [ ] Stage 10 — Cleanup service (@Interval purge of failed workspaces)
- [ ] Stage 11 — Documentation (README, .env.example, ARCHITECTURE.md, DOMAIN_GLOSSARY.md, JSDoc pass)

## Notes
- Stage 7 added `fileSizeKb` to `CoverageFile` (entity + interface + parser); Stage 8 can read it directly for the file-size gate
- Stage 8 `ImproveButton` active-job detection is currently stubbed `false` in `CoverageFileRow` — wire it up when `ImprovementJob` records exist
- Frontend thresholds (`COVERAGE_THRESHOLD`, `FILE_SIZE_LIMIT_KB`) read from `VITE_COVERAGE_THRESHOLD` / `VITE_FILE_SIZE_LIMIT_KB` env vars (default 80 / 200)
