# UpCover — Documentation requirements & known limitations

> Source: `OUTLINE.md` → Sections 11–12

## 11. Documentation Requirements

| File | Contents |
|---|---|
| `README.md` | Project overview, prerequisites (Node 20+, Ollama, GitHub PAT), installation steps, `.env` setup, running locally, running the demo |
| `.env.example` | All env vars with descriptions and example values |
| `docs/ARCHITECTURE.md` | DDD layer diagram, bounded context descriptions, key design decisions with rationale |
| `docs/DOMAIN_GLOSSARY.md` | Definitions for: Repository, ScanJob, CoverageFile, ImprovementJob, ScanStatus, ImprovementStatus, coverage threshold, workspace directory |

**Code-level documentation:**
- JSDoc on all domain entities, value objects, and domain services
- JSDoc on all application service public methods
- Inline comments for non-obvious logic (state machine transitions, Ollama prompt construction, coverage flag injection)

---

## 12. Known Limitations (v1)

| Limitation | Notes |
|---|---|
| **Monorepos** | Detected and rejected. Root `package.json` must have scripts that run coverage for the entire project. |
| **Test frameworks** | Only Jest and Vitest supported. Mocha, AVA, Bun test, and others produce an `UNSUPPORTED_TEST_FRAMEWORK` error. |
| **Package managers** | Only npm, yarn, pnpm. Bun is not supported. |
| **Server restart** | Jobs left in non-terminal states remain stuck after restart. User must rescan or delete them manually. |
| **No authentication** | Single-user local tool. No login, sessions, or multi-user support. |
| **Generated test quality** | If the Ollama model produces tests that fail, the job is marked FAILED. There is no iterative retry or refinement loop. |
| **No PR diff preview** | The generated test file is pushed and a PR created without giving the user a preview to approve first. |
| **Context window limits** | Source files larger than `FILE_SIZE_LIMIT_KB` have the Improve button disabled. This is a hard cutoff, not graceful degradation. |

