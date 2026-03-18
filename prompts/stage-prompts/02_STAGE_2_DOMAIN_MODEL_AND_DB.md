# Stage 2 — Domain model + DB schema (prompt)

**Include:** `prompts/00_GLOBAL_RULES.md`, `prompts/03_DOMAIN_AND_DB.md`, Stage 2 section from `prompts/09_BUILD_STAGES.md`

## Prompt

Implement **Stage 2 — Domain Model + Database Schema** only.

Requirements:
- Create TypeORM entities for `Repository`, `ScanJob`, `CoverageFile`, `ImprovementJob` matching `03_DOMAIN_AND_DB.md`.
- Use SQLite + TypeORM with `synchronize: true` (ok for local dev).
- Define domain enums/value objects: `ScanStatus`, `ImprovementStatus`, `PackageManager`, `TestFramework`, `CoverageFramework`.
- Define repository interfaces in a domain layer (no TypeORM dependency).

Constraints:
- Follow `00_GLOBAL_RULES.md` exactly.
- Do not start Stage 3.

Output:
- List files touched and any DB initialization notes.

