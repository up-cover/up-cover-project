import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { FrameworkDetector, UnsupportedTestFrameworkError } from './framework-detector';
import { PackageManager } from '../enums/package-manager.enum';
import { TestFramework } from '../enums/test-framework.enum';
import { CoverageFramework } from '../enums/coverage-framework.enum';

describe('FrameworkDetector', () => {
  let detector: FrameworkDetector;
  let workDir: string;

  beforeEach(() => {
    detector = new FrameworkDetector();
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'upcover-test-'));
    // Write a minimal package.json with vitest so tests that need it don't fail on framework detection
    // Each test overrides as needed
  });

  afterEach(() => {
    fs.rmSync(workDir, { recursive: true, force: true });
  });

  function writeFile(name: string, content: string) {
    fs.writeFileSync(path.join(workDir, name), content);
  }

  function writePkg(content: Record<string, unknown>) {
    writeFile('package.json', JSON.stringify(content));
  }

  // --- detectPackageManager ---

  describe('detectPackageManager', () => {
    beforeEach(() => {
      // Need a test framework so detect() doesn't throw
      writePkg({ devDependencies: { vitest: '^1.0.0' } });
    });

    it('returns PNPM when pnpm-lock.yaml exists', () => {
      writeFile('pnpm-lock.yaml', '');
      const result = detector.detect(workDir);
      expect(result.packageManager).toBe(PackageManager.PNPM);
    });

    it('returns YARN when yarn.lock exists (no pnpm-lock.yaml)', () => {
      writeFile('yarn.lock', '');
      const result = detector.detect(workDir);
      expect(result.packageManager).toBe(PackageManager.YARN);
    });

    it('returns NPM when package-lock.json exists', () => {
      writeFile('package-lock.json', '{}');
      const result = detector.detect(workDir);
      expect(result.packageManager).toBe(PackageManager.NPM);
    });

    it('pnpm lockfile wins over yarn lockfile when both present', () => {
      writeFile('pnpm-lock.yaml', '');
      writeFile('yarn.lock', '');
      const result = detector.detect(workDir);
      expect(result.packageManager).toBe(PackageManager.PNPM);
    });

    it('uses packageManager field in package.json when no lockfile', () => {
      writePkg({ devDependencies: { vitest: '^1.0.0' }, packageManager: 'pnpm@8.0.0' });
      const result = detector.detect(workDir);
      expect(result.packageManager).toBe(PackageManager.PNPM);
    });

    it('uses yarn from packageManager field when no lockfile', () => {
      writePkg({ devDependencies: { vitest: '^1.0.0' }, packageManager: 'yarn@3.0.0' });
      const result = detector.detect(workDir);
      expect(result.packageManager).toBe(PackageManager.YARN);
    });

    it('defaults to NPM when no lockfile and no packageManager field', () => {
      const result = detector.detect(workDir);
      expect(result.packageManager).toBe(PackageManager.NPM);
    });
  });

  // --- detectTestFramework ---

  describe('detectTestFramework', () => {
    it('returns VITEST when vitest is in devDependencies', () => {
      writePkg({ devDependencies: { vitest: '^1.0.0' } });
      const result = detector.detect(workDir);
      expect(result.testFramework).toBe(TestFramework.VITEST);
    });

    it('returns VITEST when vitest is in dependencies', () => {
      writePkg({ dependencies: { vitest: '^1.0.0' } });
      const result = detector.detect(workDir);
      expect(result.testFramework).toBe(TestFramework.VITEST);
    });

    it('returns VITEST when vitest.config.ts exists', () => {
      writePkg({});
      writeFile('vitest.config.ts', 'export default {}');
      const result = detector.detect(workDir);
      expect(result.testFramework).toBe(TestFramework.VITEST);
    });

    it('returns VITEST when vitest.config.js exists', () => {
      writePkg({});
      writeFile('vitest.config.js', 'module.exports = {}');
      const result = detector.detect(workDir);
      expect(result.testFramework).toBe(TestFramework.VITEST);
    });

    it('returns JEST when jest is in devDependencies', () => {
      writePkg({ devDependencies: { jest: '^29.0.0' } });
      const result = detector.detect(workDir);
      expect(result.testFramework).toBe(TestFramework.JEST);
    });

    it('returns JEST when jest.config.ts exists', () => {
      writePkg({});
      writeFile('jest.config.ts', 'export default {}');
      const result = detector.detect(workDir);
      expect(result.testFramework).toBe(TestFramework.JEST);
    });

    it('returns JEST when jest.config.js exists', () => {
      writePkg({});
      writeFile('jest.config.js', 'module.exports = {}');
      const result = detector.detect(workDir);
      expect(result.testFramework).toBe(TestFramework.JEST);
    });

    it('prefers VITEST over JEST when both are in devDependencies', () => {
      writePkg({ devDependencies: { vitest: '^1.0.0', jest: '^29.0.0' } });
      const result = detector.detect(workDir);
      expect(result.testFramework).toBe(TestFramework.VITEST);
    });

    it('throws UnsupportedTestFrameworkError when neither vitest nor jest is found', () => {
      writePkg({});
      expect(() => detector.detect(workDir)).toThrow(UnsupportedTestFrameworkError);
    });
  });

  // --- detectCoverageFramework ---

  describe('detectCoverageFramework', () => {
    it('returns V8 for Vitest with no config file (devDependency only)', () => {
      writePkg({ devDependencies: { vitest: '^1.0.0' } });
      const result = detector.detect(workDir);
      expect(result.coverageFramework).toBe(CoverageFramework.V8);
    });

    it('returns V8 for Vitest when vitest.config.ts has no explicit istanbul', () => {
      writePkg({ devDependencies: { vitest: '^1.0.0' } });
      writeFile('vitest.config.ts', "export default { test: { coverage: { provider: 'v8' } } }");
      const result = detector.detect(workDir);
      expect(result.coverageFramework).toBe(CoverageFramework.V8);
    });

    it('returns ISTANBUL for Vitest when vitest.config.ts contains istanbul provider', () => {
      writePkg({ devDependencies: { vitest: '^1.0.0' } });
      writeFile('vitest.config.ts', "export default { test: { coverage: { provider: 'istanbul' } } }");
      const result = detector.detect(workDir);
      expect(result.coverageFramework).toBe(CoverageFramework.ISTANBUL);
    });

    it('returns ISTANBUL for Jest with no config file (default)', () => {
      writePkg({ devDependencies: { jest: '^29.0.0' } });
      const result = detector.detect(workDir);
      expect(result.coverageFramework).toBe(CoverageFramework.ISTANBUL);
    });

    it('returns V8 for Jest when jest.config.ts contains coverageProvider v8', () => {
      writePkg({ devDependencies: { jest: '^29.0.0' } });
      writeFile('jest.config.ts', "export default { coverageProvider: 'v8' }");
      const result = detector.detect(workDir);
      expect(result.coverageFramework).toBe(CoverageFramework.V8);
    });

    it('returns V8 for Jest when package.json jest.coverageProvider is v8', () => {
      writePkg({ devDependencies: { jest: '^29.0.0' }, jest: { coverageProvider: 'v8' } });
      const result = detector.detect(workDir);
      expect(result.coverageFramework).toBe(CoverageFramework.V8);
    });
  });

  // --- countTsFiles ---

  describe('countTsFiles', () => {
    beforeEach(() => {
      writePkg({ devDependencies: { vitest: '^1.0.0' } });
    });

    it('counts .ts and .tsx files recursively', () => {
      fs.mkdirSync(path.join(workDir, 'src'));
      writeFile('src/foo.ts', '');
      writeFile('src/bar.tsx', '');
      writeFile('src/baz.js', '');
      const result = detector.detect(workDir);
      expect(result.totalTsFiles).toBe(2);
    });

    it('skips node_modules directory', () => {
      fs.mkdirSync(path.join(workDir, 'node_modules', 'lib'), { recursive: true });
      writeFile('node_modules/lib/index.ts', '');
      writeFile('index.ts', '');
      const result = detector.detect(workDir);
      expect(result.totalTsFiles).toBe(1);
    });

    it('skips .git directory', () => {
      fs.mkdirSync(path.join(workDir, '.git'));
      writeFile('.git/hook.ts', '');
      writeFile('app.ts', '');
      const result = detector.detect(workDir);
      expect(result.totalTsFiles).toBe(1);
    });

    it('returns 0 for a directory with no ts files', () => {
      writeFile('README.md', '');
      const result = detector.detect(workDir);
      expect(result.totalTsFiles).toBe(0);
    });
  });
});
