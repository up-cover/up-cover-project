# UpCover — Global rules (include every time)

> Source: `OUTLINE.md` → “Claude Code — Non-negotiable requirements (read first)”

## Claude Code — Non-negotiable requirements (read first)

You are generating a complete project from this spec. When behavior is underspecified, choose the simplest implementation that still satisfies the constraints below. Do not add features outside this scope.

### Scope / environment

- Single-user **local-only** developer tool. No authentication. No multi-user support.
- Must run on **macOS, Linux, and Windows**.
- GitHub support: **GitHub.com only** (no GitHub Enterprise). **Private repos supported**.
- Token handling: `GITHUB_TOKEN` is **backend-only** via environment variables. **Limitation:** no per-repo tokens, no UI token entry/storage.
- Repo improvement permissions: requires direct push/PR creation rights on the repo. **Limitation:** **no fork flow** (cannot improve public repos via fork yet).
- Clone method: **HTTPS only** using token auth. **Limitation:** no SSH clone support.

### Scan pipeline — command selection + coverage discovery

- Coverage metric: per-file `coveragePct` is **lines.pct only** (ignore statements/branches/functions). **Limitation noted.**
- Only show files that appear in the coverage report (do not infer missing files as 0%).

#### Running coverage

Prefer repo scripts:

1. If `package.json` has `scripts.test:coverage`, run that.
   - If the command exits 0 but the `#### Finding \`coverage-summary.json\`` step cannot locate `coverage-summary.json`, fall back to step (3).
   - Failure condition: command exits non-zero.

2. Else if it has `scripts.coverage`, run that.
   - If the command exits 0 but the `#### Finding \`coverage-summary.json\`` step cannot locate `coverage-summary.json`, fall back to step (3).
   - Failure condition: command exits non-zero.

3. Else fall back:
   - Jest: `npx jest --coverage --coverageReporters=json-summary`
   - Vitest: `npx vitest run --coverage --coverage.reporter=json-summary`

**Important:** Do not modify or append flags to existing scripts. If a repo script completes but the `#### Finding \`coverage-summary.json\`` step cannot locate `coverage-summary.json`, do not fail immediately — fall back to step (3). If step (3) also completes but `coverage-summary.json` still cannot be located, fail with a clear error explaining that `coverage-summary.json` was not produced and that the repo must be configured to emit `json-summary`.

#### Finding `coverage-summary.json`

After running coverage, search common locations for `coverage-summary.json` (at minimum):

- `coverage/coverage-summary.json`
- `./coverage-summary.json`
- `./reports/**/coverage-summary.json`

If not found, fail with a clear error indicating coverage summary was not produced.

#### Environment limitations

If tests require missing env vars/secrets and fail, mark scan FAILED with the test output. **Limitation:** no env passthrough/config UI.

### Monorepo detection (intentionally strict)

Reject the repo as a monorepo if any strong signal exists (err on the side of rejecting):

- `workspaces` in root `package.json`
- `pnpm-workspace.yaml`
- `lerna.json`, `nx.json`, `turbo.json`
- other credible workspace tooling indicators

Surface `MONOREPO_DETECTED` with a clear message. **Limitation:** monorepos out of scope.

### Improvement pipeline — test generation contract

#### Test file selection / placement

- If both exist, prefer `*.test.*` over `*.spec.*`.
- Generate `*.test.tsx` when repo conventions indicate TSX tests (e.g. source is `.tsx` or existing tests are `.tsx`).
- If no existing test file, infer repo test placement convention from existing tests; if unclear, place new tests in a conventional location (`__tests__` / `tests`) consistent with prevailing patterns found.

#### Running tests scoped to the generated test

- Jest: running by file path is acceptable.
- Vitest: choose the most common approach based on repo scripts/config; if unclear, default to `vitest run <path>`.
- If scoped test execution fails or the framework cannot run a single file, mark the job FAILED (no fallback to full-suite run).

#### Ollama prompt inputs

Include in the prompt:

- the target source file contents
- existing test file contents if present
- `CONTRIBUTING.md` if present
- additionally, include related files (imports / adjacent helpers / types) **as long as each file is below `FILE_SIZE_LIMIT_KB` and fits in the context window**

#### Ollama output format (must be strict)

- The model output must be **only the test file content**.
- No markdown fences. Any explanation must be in code comments inside the test file.
- Backend must strip markdown fences if present; if the result is still not valid TypeScript, fail generation.

### Git / PR rules

- Commit author identity is configurable:
  - `GIT_BOT_NAME` default: `UpCover Bot`
  - `GIT_BOT_EMAIL` default: `upcover@local`
- No labels/assignees/reviewers on PRs.
- If the intended branch name already exists on remote, **fail** (do not suffix/rename).

### SSE

Use standard SSE semantics (`event:` and `data:`). If you include an envelope, it must be inside `data`.

### Logging / storage

Do not implement log truncation in v1 (**note as limitation/future improvement**).

### Frontend

Frontend and backend run separately (Vite + NestJS). Keep UI simple; no dark mode requirement.
