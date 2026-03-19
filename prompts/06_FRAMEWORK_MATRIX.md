# UpCover — Supported frameworks matrix

> Source: `OUTLINE.md` → Section 9

## 9. Supported Frameworks Matrix

### Package Manager Detection (checked in order)

1. **Lockfile** (most reliable): `pnpm-lock.yaml` → pnpm, `yarn.lock` → yarn, `package-lock.json` → npm
2. **`package.json` `packageManager` field** (e.g. `"packageManager": "pnpm@8.0.0"`): `pnpm*` → pnpm, `yarn*` → yarn, `npm*` → npm
3. **Default**: npm (ships with Node.js)

If no lockfile and no `packageManager` field, detection defaults to npm; no failure.

### Test Framework Detection

| Framework | Signal |
|---|---|
| Vitest | `vitest` in `devDependencies` **or** `dependencies` **or** `vitest.config.ts` / `vitest.config.js` present |
| Jest | `jest` in `devDependencies` **or** `dependencies` **or** `jest.config.ts` / `jest.config.js` / `jest.config.cjs` present |

If neither detected → FAILED: unsupported test framework.

### Coverage Framework Detection

| Framework | Signal |
|---|---|
| V8 | Vitest default (unless config has `provider: 'istanbul'`). Jest when config has `coverageProvider: 'v8'`. |
| Istanbul | Jest default (unless config has `coverageProvider: 'v8'`). Vitest when config has `provider: 'istanbul'`. |

### Coverage Report Configuration

Both Jest and Vitest are invoked with flags to ensure `coverage-summary.json` is emitted:

- **Jest:** `--coverage --coverageReporters=json-summary`
- **Vitest:** `--coverage --coverage.reporter=json-summary`

