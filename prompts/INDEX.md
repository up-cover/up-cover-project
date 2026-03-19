# UpCover prompt pack — index & usage

These files are a split of `OUTLINE.md` to make it easier to stay within Claude’s context window while keeping the spec enforceable.

## Files

- `00_GLOBAL_RULES.md` — **Always include.** Hard constraints + non-negotiables.
- `01_SUMMARY_AND_ARCH.md` — Product summary + architecture decisions.
- `02_CONFIG.md` — Environment variables / configuration table.
- `03_DOMAIN_AND_DB.md` — Domain model (DDD) + DB schema.
- `04_API_AND_SSE.md` — REST + SSE contracts (paths + event names).
- `05_USER_FLOW_AND_UI.md` — User flow + component hierarchy.
- `06_FRAMEWORK_MATRIX.md` — Supported frameworks detection rules.
- `07_ERRORS.md` — Error catalogue (codes + messages).
- `08_DOCS_AND_LIMITATIONS.md` — Documentation requirements + known limitations.
- `09_BUILD_STAGES.md` — Build stages (implementation order).

## Recommended “feed order” to Claude Code

1. Paste `00_GLOBAL_RULES.md` first.
2. Paste the one contract file relevant to your current work (API/domain/UI/etc.).
3. Paste **only the specific stage** you’re implementing right now from `09_BUILD_STAGES.md` (copy just that stage subsection).
   03

### Example bundles

- **Stage 1 (scaffold)**: `00_GLOBAL_RULES.md` + `01_SUMMARY_AND_ARCH.md` + Stage 1 subsection from `09_BUILD_STAGES.md`
- **Stage 4 (scan pipeline)**: `00_GLOBAL_RULES.md` + `03_DOMAIN_AND_DB.md` + `06_FRAMEWORK_MATRIX.md` + `07_ERRORS.md` + Stage 4 subsection from `09_BUILD_STAGES.md`
- **Stage 6 (live RepoCard UI)**: `00_GLOBAL_RULES.md` + `05_USER_FLOW_AND_UI.md` + `04_API_AND_SSE.md` + Stage 6 subsection from `09_BUILD_STAGES.md`

## Handy micro-prompt (copy/paste)

Use this at the end of your prompt to keep Claude tightly scoped:

```
Implement Stage <X> only.
- Do not start Stage <X+1>.
- Follow 00_GLOBAL_RULES.md exactly.
- If anything is underspecified, choose the simplest implementation that satisfies constraints.
- Output: create/modify files as needed. After changes, list the files touched.
```
