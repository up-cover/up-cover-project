import * as path from 'path';
import { FrameworkDetector, UnsupportedTestFrameworkError } from './framework-detector';
import { PackageManager } from '../enums/package-manager.enum';
import { TestFramework } from '../enums/test-framework.enum';
import { CoverageFramework } from '../enums/coverage-framework.enum';
import { mockFs } from '../../test/fs-mock.helpers';

jest.mock('fs');

const WORK_DIR = '/work';

function pkgJson(obj: Record<string, unknown>): string {
  return JSON.stringify(obj);
}

describe('FrameworkDetector', () => {
  let detector: FrameworkDetector;
  let restoreFs: () => void;

  beforeEach(() => {
    detector = new FrameworkDetector();
  });

  afterEach(() => {
    if (restoreFs) restoreFs();
  });

  // ---------------------------------------------------------------------------
  describe('detectPackageManager (via detect)', () => {
    it('returns PNPM when pnpm-lock.yaml exists', () => {
      ({ restore: restoreFs } = mockFs({
        [path.join(WORK_DIR, 'pnpm-lock.yaml')]: '',
        [path.join(WORK_DIR, 'package.json')]: pkgJson({ devDependencies: { vitest: '*' } }),
        [path.join(WORK_DIR, 'vitest.config.ts')]: '',
      }));
      expect(detector.detect(WORK_DIR).packageManager).toBe(PackageManager.PNPM);
    });

    it('returns YARN when yarn.lock exists (no pnpm-lock.yaml)', () => {
      ({ restore: restoreFs } = mockFs({
        [path.join(WORK_DIR, 'yarn.lock')]: '',
        [path.join(WORK_DIR, 'package.json')]: pkgJson({ devDependencies: { vitest: '*' } }),
        [path.join(WORK_DIR, 'vitest.config.ts')]: '',
      }));
      expect(detector.detect(WORK_DIR).packageManager).toBe(PackageManager.YARN);
    });

    it('returns NPM when package-lock.json exists (no other lockfiles)', () => {
      ({ restore: restoreFs } = mockFs({
        [path.join(WORK_DIR, 'package-lock.json')]: '',
        [path.join(WORK_DIR, 'package.json')]: pkgJson({ devDependencies: { vitest: '*' } }),
        [path.join(WORK_DIR, 'vitest.config.ts')]: '',
      }));
      expect(detector.detect(WORK_DIR).packageManager).toBe(PackageManager.NPM);
    });

    it('returns PNPM when packageManager field is "pnpm@8.0.0" (no lockfile)', () => {
      ({ restore: restoreFs } = mockFs({
        [path.join(WORK_DIR, 'package.json')]: pkgJson({ packageManager: 'pnpm@8.0.0', devDependencies: { vitest: '*' } }),
        [path.join(WORK_DIR, 'vitest.config.ts')]: '',
      }));
      expect(detector.detect(WORK_DIR).packageManager).toBe(PackageManager.PNPM);
    });

    it('returns YARN when packageManager field is "yarn@3.6.0" (no lockfile)', () => {
      ({ restore: restoreFs } = mockFs({
        [path.join(WORK_DIR, 'package.json')]: pkgJson({ packageManager: 'yarn@3.6.0', devDependencies: { vitest: '*' } }),
        [path.join(WORK_DIR, 'vitest.config.ts')]: '',
      }));
      expect(detector.detect(WORK_DIR).packageManager).toBe(PackageManager.YARN);
    });

    it('returns NPM when no lockfile and no packageManager field', () => {
      ({ restore: restoreFs } = mockFs({
        [path.join(WORK_DIR, 'package.json')]: pkgJson({ devDependencies: { vitest: '*' } }),
        [path.join(WORK_DIR, 'vitest.config.ts')]: '',
      }));
      expect(detector.detect(WORK_DIR).packageManager).toBe(PackageManager.NPM);
    });

    it('pnpm-lock.yaml takes priority over yarn.lock', () => {
      ({ restore: restoreFs } = mockFs({
        [path.join(WORK_DIR, 'pnpm-lock.yaml')]: '',
        [path.join(WORK_DIR, 'yarn.lock')]: '',
        [path.join(WORK_DIR, 'package.json')]: pkgJson({ devDependencies: { vitest: '*' } }),
        [path.join(WORK_DIR, 'vitest.config.ts')]: '',
      }));
      expect(detector.detect(WORK_DIR).packageManager).toBe(PackageManager.PNPM);
    });
  });

  // ---------------------------------------------------------------------------
  describe('detectTestFramework (via detect)', () => {
    it('returns VITEST when vitest in devDependencies', () => {
      ({ restore: restoreFs } = mockFs({
        [path.join(WORK_DIR, 'package.json')]: pkgJson({ devDependencies: { vitest: '^1.0.0' } }),
      }));
      expect(detector.detect(WORK_DIR).testFramework).toBe(TestFramework.VITEST);
    });

    it('returns VITEST when vitest in dependencies', () => {
      ({ restore: restoreFs } = mockFs({
        [path.join(WORK_DIR, 'package.json')]: pkgJson({ dependencies: { vitest: '^1.0.0' } }),
      }));
      expect(detector.detect(WORK_DIR).testFramework).toBe(TestFramework.VITEST);
    });

    it('returns VITEST when vitest.config.ts exists', () => {
      ({ restore: restoreFs } = mockFs({
        [path.join(WORK_DIR, 'package.json')]: pkgJson({}),
        [path.join(WORK_DIR, 'vitest.config.ts')]: '',
      }));
      expect(detector.detect(WORK_DIR).testFramework).toBe(TestFramework.VITEST);
    });

    it('returns VITEST when vitest.config.js exists', () => {
      ({ restore: restoreFs } = mockFs({
        [path.join(WORK_DIR, 'package.json')]: pkgJson({}),
        [path.join(WORK_DIR, 'vitest.config.js')]: '',
      }));
      expect(detector.detect(WORK_DIR).testFramework).toBe(TestFramework.VITEST);
    });

    it('returns JEST when jest in devDependencies', () => {
      ({ restore: restoreFs } = mockFs({
        [path.join(WORK_DIR, 'package.json')]: pkgJson({ devDependencies: { jest: '^29.0.0' } }),
      }));
      expect(detector.detect(WORK_DIR).testFramework).toBe(TestFramework.JEST);
    });

    it('returns JEST when jest.config.ts exists', () => {
      ({ restore: restoreFs } = mockFs({
        [path.join(WORK_DIR, 'package.json')]: pkgJson({}),
        [path.join(WORK_DIR, 'jest.config.ts')]: '',
      }));
      expect(detector.detect(WORK_DIR).testFramework).toBe(TestFramework.JEST);
    });

    it('returns JEST when jest.config.cjs exists', () => {
      ({ restore: restoreFs } = mockFs({
        [path.join(WORK_DIR, 'package.json')]: pkgJson({}),
        [path.join(WORK_DIR, 'jest.config.cjs')]: '',
      }));
      expect(detector.detect(WORK_DIR).testFramework).toBe(TestFramework.JEST);
    });

    it('throws UnsupportedTestFrameworkError when neither vitest nor jest detected', () => {
      ({ restore: restoreFs } = mockFs({
        [path.join(WORK_DIR, 'package.json')]: pkgJson({ devDependencies: { mocha: '*' } }),
      }));
      expect(() => detector.detect(WORK_DIR).testFramework).toThrow(UnsupportedTestFrameworkError);
    });

    it('VITEST takes priority over JEST when both present in devDependencies', () => {
      ({ restore: restoreFs } = mockFs({
        [path.join(WORK_DIR, 'package.json')]: pkgJson({ devDependencies: { vitest: '*', jest: '*' } }),
      }));
      expect(detector.detect(WORK_DIR).testFramework).toBe(TestFramework.VITEST);
    });
  });

  // ---------------------------------------------------------------------------
  describe('detectCoverageFramework (via detect)', () => {
    it('returns V8 (default) for vitest when no config file exists', () => {
      ({ restore: restoreFs } = mockFs({
        [path.join(WORK_DIR, 'package.json')]: pkgJson({ devDependencies: { vitest: '*' } }),
      }));
      expect(detector.detect(WORK_DIR).coverageFramework).toBe(CoverageFramework.V8);
    });

    it('returns ISTANBUL for vitest when config contains provider: istanbul (single quotes)', () => {
      ({ restore: restoreFs } = mockFs({
        [path.join(WORK_DIR, 'package.json')]: pkgJson({ devDependencies: { vitest: '*' } }),
        [path.join(WORK_DIR, 'vitest.config.ts')]: "coverage: { provider: 'istanbul' }",
      }));
      expect(detector.detect(WORK_DIR).coverageFramework).toBe(CoverageFramework.ISTANBUL);
    });

    it('returns ISTANBUL for vitest when config contains provider: istanbul (double quotes)', () => {
      ({ restore: restoreFs } = mockFs({
        [path.join(WORK_DIR, 'package.json')]: pkgJson({ devDependencies: { vitest: '*' } }),
        [path.join(WORK_DIR, 'vitest.config.ts')]: 'coverage: { provider: "istanbul" }',
      }));
      expect(detector.detect(WORK_DIR).coverageFramework).toBe(CoverageFramework.ISTANBUL);
    });

    it('returns V8 for vitest when config file exists without istanbul mention', () => {
      ({ restore: restoreFs } = mockFs({
        [path.join(WORK_DIR, 'package.json')]: pkgJson({ devDependencies: { vitest: '*' } }),
        [path.join(WORK_DIR, 'vitest.config.ts')]: 'export default defineConfig({});',
      }));
      expect(detector.detect(WORK_DIR).coverageFramework).toBe(CoverageFramework.V8);
    });

    it('returns ISTANBUL (default) for jest when no v8 provider specified', () => {
      ({ restore: restoreFs } = mockFs({
        [path.join(WORK_DIR, 'package.json')]: pkgJson({ devDependencies: { jest: '*' } }),
      }));
      expect(detector.detect(WORK_DIR).coverageFramework).toBe(CoverageFramework.ISTANBUL);
    });

    it('returns V8 for jest when jest.config.ts contains coverageProvider: v8', () => {
      ({ restore: restoreFs } = mockFs({
        [path.join(WORK_DIR, 'package.json')]: pkgJson({ devDependencies: { jest: '*' } }),
        [path.join(WORK_DIR, 'jest.config.ts')]: "module.exports = { coverageProvider: 'v8' }",
      }));
      expect(detector.detect(WORK_DIR).coverageFramework).toBe(CoverageFramework.V8);
    });

    it('returns V8 for jest when package.json jest.coverageProvider === "v8"', () => {
      ({ restore: restoreFs } = mockFs({
        [path.join(WORK_DIR, 'package.json')]: pkgJson({
          devDependencies: { jest: '*' },
          jest: { coverageProvider: 'v8' },
        }),
      }));
      expect(detector.detect(WORK_DIR).coverageFramework).toBe(CoverageFramework.V8);
    });
  });

  // ---------------------------------------------------------------------------
  describe('countTsFiles (via detect)', () => {
    it('counts .ts and .tsx files recursively', () => {
      ({ restore: restoreFs } = mockFs({
        [path.join(WORK_DIR, 'package.json')]: pkgJson({ devDependencies: { vitest: '*' } }),
        [path.join(WORK_DIR, 'src', 'a.ts')]: '',
        [path.join(WORK_DIR, 'src', 'b.tsx')]: '',
        [path.join(WORK_DIR, 'src', 'nested', 'c.ts')]: '',
        [path.join(WORK_DIR, 'src', 'utils.js')]: '',
      }));
      expect(detector.detect(WORK_DIR).totalTsFiles).toBe(3);
    });

    it('skips node_modules directory', () => {
      ({ restore: restoreFs } = mockFs({
        [path.join(WORK_DIR, 'package.json')]: pkgJson({ devDependencies: { vitest: '*' } }),
        [path.join(WORK_DIR, 'src', 'app.ts')]: '',
        [path.join(WORK_DIR, 'node_modules', 'lib', 'index.ts')]: '',
      }));
      expect(detector.detect(WORK_DIR).totalTsFiles).toBe(1);
    });

    it('skips .git directory', () => {
      ({ restore: restoreFs } = mockFs({
        [path.join(WORK_DIR, 'package.json')]: pkgJson({ devDependencies: { vitest: '*' } }),
        [path.join(WORK_DIR, 'src', 'app.ts')]: '',
        [path.join(WORK_DIR, '.git', 'COMMIT_EDITMSG')]: '',
      }));
      // .git/COMMIT_EDITMSG has no .ts extension so doesn't count anyway,
      // but even if it did, .git is skipped
      expect(detector.detect(WORK_DIR).totalTsFiles).toBe(1);
    });

    it('handles permission errors on subdirectories gracefully', () => {
      ({ restore: restoreFs } = mockFs({
        [path.join(WORK_DIR, 'package.json')]: pkgJson({ devDependencies: { vitest: '*' } }),
        [path.join(WORK_DIR, 'src', 'app.ts')]: '',
        [path.join(WORK_DIR, 'locked', 'secret.ts')]: '',
      }));
      const fs = require('fs');
      const orig = fs.readdirSync;
      fs.readdirSync = jest.fn((p: string, ...args: any[]) => {
        if (String(p) === path.join(WORK_DIR, 'locked')) throw new Error('EACCES: permission denied');
        return orig(p, ...args);
      });

      // Should count app.ts (1) and not throw
      expect(detector.detect(WORK_DIR).totalTsFiles).toBe(1);

      fs.readdirSync = orig;
    });
  });

  // ---------------------------------------------------------------------------
  describe('UnsupportedTestFrameworkError', () => {
    it('has correct name and message', () => {
      const err = new UnsupportedTestFrameworkError();
      expect(err.name).toBe('UnsupportedTestFrameworkError');
      expect(err.message).toContain('Jest');
      expect(err.message).toContain('Vitest');
    });

    it('is an instance of Error', () => {
      expect(new UnsupportedTestFrameworkError()).toBeInstanceOf(Error);
    });
  });
});
