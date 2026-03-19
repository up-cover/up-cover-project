# UpCover — Error catalogue

> Source: `OUTLINE.md` → Section 10

## 10. Error Catalogue

| Code | Triggered at | User-facing message |
|---|---|---|
| `INVALID_TOKEN` | Landing page | "The configured GitHub token is invalid or expired." |
| `INSUFFICIENT_PERMS` | Landing page | "Token lacks required permissions. Ensure the token has `repo` scope." |
| `REPO_NOT_FOUND` | Landing page | "Repository not found or not accessible with the configured token." |
| `NO_TYPESCRIPT` | Landing page | "This repository contains no TypeScript files." |
| `TS_TOO_SMALL` | Landing page | "Repository TypeScript codebase is too small (< {threshold} bytes). It may not have meaningful coverage to improve." |
| `ALREADY_REGISTERED` | Landing page | "This repository has already been added." |
| `CLONE_FAILED` | Scan: CLONING | "Failed to clone repository: {git error message}" |
| `CLONE_FAILED` | Improve: CLONING | "Failed to create branch: {error}" |
| `NO_LOCKFILE` | Scan: SCANNING | "No supported package manager lockfile found. Supported: npm, yarn, pnpm." |
| `UNSUPPORTED_TEST_FRAMEWORK` | Scan: SCANNING | "No supported test framework detected. Supported: Jest, Vitest." |
| `SCANNING_FAILED` | Scan: SCANNING | "{error} (generic catch-all for detection errors)" |
| `INSTALL_FAILED` | Scan: INSTALLING | "Dependency installation failed. See log output for details." |
| `TESTS_FAILED` | Scan: TESTING | "Test run failed — no coverage report was produced. See log output for details." |
| `COVERAGE_PARSE_FAILED` | Scan: TESTING | "Could not parse coverage-summary.json: {parse error}" |
| `FILE_TOO_LARGE` | Detail page | "File exceeds {limit}KB — too large for AI improvement." (shown as button tooltip) |
| `GENERATION_FAILED` | Improve: GENERATING | "LLM failed to generate tests: {error}" |
| `COVERAGE_BEFORE_FAILED` | Improve: TESTING | "Test run failed — no coverage report was produced. See log output for details." or "coverage-summary.json was not produced." |
| `COVERAGE_AFTER_FAILED` | Improve: TESTING | Same as COVERAGE_BEFORE_FAILED (for post-generation coverage run) |
| `COVERAGE_BEFORE_PARSE_FAILED` | Improve: TESTING | "Could not parse coverage-summary.json: {parse error}" |
| `COVERAGE_AFTER_PARSE_FAILED` | Improve: TESTING | Same as COVERAGE_BEFORE_PARSE_FAILED |
| `GENERATED_TESTS_FAIL` | Improve: TESTING | "Generated tests do not pass. Review the log output and try again." |
| `PUSH_FAILED` | Improve: PUSHING | "Failed to push branch to GitHub: {git error}" |
| `PR_CREATION_FAILED` | Improve: CREATING_PR | "Failed to create pull request: {GitHub API error}" |

