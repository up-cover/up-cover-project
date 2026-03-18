# UpCover — Supported frameworks matrix

> Source: `OUTLINE.md` → Section 9

## 9. Supported Frameworks Matrix

### Package Manager Detection (checked in order)

| Manager | Lockfile |
|---|---|
| pnpm | `pnpm-lock.yaml` |
| yarn | `yarn.lock` |
| npm | `package-lock.json` |

If no lockfile found → FAILED: unsupported package manager.

### Test Framework Detection

| Framework | Signal |
|---|---|
| Vitest | `vitest` in `devDependencies` **or** `vitest.config.ts` / `vitest.config.js` present |
| Jest | `jest` in `devDependencies` **or** `jest.config.ts` / `jest.config.js` / `jest.config.cjs` present |

If neither detected → FAILED: unsupported test framework.

### Coverage Framework Detection

| Framework | Signal |
|---|---|
| V8 (Vitest) | Vitest config has `coverage.provider: 'v8'` or Vitest detected with no explicit provider (V8 is Vitest default) |
| Istanbul (Jest) | Jest config has `coverageProvider: 'babel'` or no explicit provider (Istanbul is Jest default) |

### Coverage Report Configuration

Both Jest and Vitest are invoked with flags to ensure `coverage-summary.json` is emitted:

- **Jest:** `--coverage --coverageReporters=json-summary`
- **Vitest:** `--coverage --coverage.reporter=json-summary`

