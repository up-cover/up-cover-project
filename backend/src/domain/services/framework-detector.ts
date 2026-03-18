import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { PackageManager } from '../enums/package-manager.enum';
import { TestFramework } from '../enums/test-framework.enum';
import { CoverageFramework } from '../enums/coverage-framework.enum';

export interface DetectionResult {
  packageManager: PackageManager;
  testFramework: TestFramework;
  coverageFramework: CoverageFramework;
  totalTsFiles: number;
  packageJson: any;
}

export class UnsupportedTestFrameworkError extends Error {
  constructor() {
    super('No supported test framework detected. Supported: Jest, Vitest.');
    this.name = 'UnsupportedTestFrameworkError';
  }
}

@Injectable()
export class FrameworkDetector {
  detect(workDir: string): DetectionResult {
    const packageJson = this.readPackageJson(workDir);

    const packageManager = this.detectPackageManager(workDir, packageJson);
    const testFramework = this.detectTestFramework(workDir, packageJson);
    const coverageFramework = this.detectCoverageFramework(workDir, testFramework);
    const totalTsFiles = this.countTsFiles(workDir);

    return { packageManager, testFramework, coverageFramework, totalTsFiles, packageJson };
  }

  private readPackageJson(workDir: string): any {
    const pkgPath = path.join(workDir, 'package.json');
    if (!fs.existsSync(pkgPath)) return {};
    try {
      return JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    } catch {
      return {};
    }
  }

  private detectPackageManager(workDir: string, pkg: any): PackageManager {
    // 1. Lockfile detection (most reliable)
    if (fs.existsSync(path.join(workDir, 'pnpm-lock.yaml'))) return PackageManager.PNPM;
    if (fs.existsSync(path.join(workDir, 'yarn.lock'))) return PackageManager.YARN;
    if (fs.existsSync(path.join(workDir, 'package-lock.json'))) return PackageManager.NPM;

    // 2. package.json "packageManager" field (e.g. "pnpm@8.0.0")
    const pm: string = pkg.packageManager ?? '';
    if (pm.startsWith('pnpm')) return PackageManager.PNPM;
    if (pm.startsWith('yarn')) return PackageManager.YARN;
    if (pm.startsWith('npm')) return PackageManager.NPM;

    // 3. Default to npm (ships with Node.js)
    return PackageManager.NPM;
  }

  private detectTestFramework(workDir: string, pkg: any): TestFramework {
    const devDeps = pkg.devDependencies || {};
    const deps = pkg.dependencies || {};

    const hasVitest =
      'vitest' in devDeps ||
      'vitest' in deps ||
      fs.existsSync(path.join(workDir, 'vitest.config.ts')) ||
      fs.existsSync(path.join(workDir, 'vitest.config.js'));

    if (hasVitest) return TestFramework.VITEST;

    const hasJest =
      'jest' in devDeps ||
      'jest' in deps ||
      fs.existsSync(path.join(workDir, 'jest.config.ts')) ||
      fs.existsSync(path.join(workDir, 'jest.config.js')) ||
      fs.existsSync(path.join(workDir, 'jest.config.cjs'));

    if (hasJest) return TestFramework.JEST;

    throw new UnsupportedTestFrameworkError();
  }

  private detectCoverageFramework(workDir: string, testFramework: TestFramework): CoverageFramework {
    if (testFramework === TestFramework.VITEST) {
      for (const configFile of ['vitest.config.ts', 'vitest.config.js']) {
        const configPath = path.join(workDir, configFile);
        if (fs.existsSync(configPath)) {
          const content = fs.readFileSync(configPath, 'utf-8');
          if (content.includes("provider: 'istanbul'") || content.includes('provider: "istanbul"')) {
            return CoverageFramework.ISTANBUL;
          }
          return CoverageFramework.V8;
        }
      }
      return CoverageFramework.V8; // Vitest default
    } else {
      // Jest — check config files for explicit v8 provider
      for (const configFile of ['jest.config.ts', 'jest.config.js', 'jest.config.cjs']) {
        const configPath = path.join(workDir, configFile);
        if (fs.existsSync(configPath)) {
          const content = fs.readFileSync(configPath, 'utf-8');
          if (content.includes("coverageProvider: 'v8'") || content.includes('coverageProvider: "v8"')) {
            return CoverageFramework.V8;
          }
        }
      }
      // Check package.json jest config
      const pkgPath = path.join(workDir, 'package.json');
      if (fs.existsSync(pkgPath)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
          if (pkg.jest?.coverageProvider === 'v8') return CoverageFramework.V8;
        } catch {
          // ignore
        }
      }
      return CoverageFramework.ISTANBUL; // Jest default
    }
  }

  private countTsFiles(workDir: string): number {
    let count = 0;
    const walk = (dir: string) => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name === 'node_modules' || entry.name === '.git') continue;
          if (entry.isDirectory()) {
            walk(path.join(dir, entry.name));
          } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
            count++;
          }
        }
      } catch {
        // ignore permission errors
      }
    };
    walk(workDir);
    return count;
  }
}
