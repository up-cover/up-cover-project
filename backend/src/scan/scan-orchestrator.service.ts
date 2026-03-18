import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SseEmitter } from '../sse/sse-emitter.service';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { ScanStatus } from '../domain/enums/scan-status.enum';
import { TestFramework } from '../domain/enums/test-framework.enum';
import { PackageManager } from '../domain/enums/package-manager.enum';
import { IScanJob } from '../domain/interfaces/scan-job.interface';
import { IRepository } from '../domain/interfaces/repository.interface';
import { GitClient } from '../infrastructure/git/git-client';
import {
  FrameworkDetector,
  DetectionResult,
  NoLockfileError,
  UnsupportedTestFrameworkError,
} from '../domain/services/framework-detector';
import { CoverageParser, CoverageParseResult } from '../domain/services/coverage-parser';
import { RepositoryRepository } from '../infrastructure/persistence/repositories/repository.repository';
import { ScanJobRepository } from '../infrastructure/persistence/repositories/scan-job.repository';
import { CoverageFileRepository } from '../infrastructure/persistence/repositories/coverage-file.repository';

type CoverageRunResult =
  | { ok: true; summaryPath: string }
  | { ok: false; reason: 'command_failed' | 'no_summary_found' };

class ExecError extends Error {
  constructor(
    message: string,
    public readonly stdout: string,
    public readonly stderr: string,
  ) {
    super(message);
    this.name = 'ExecError';
  }
}

function isExecError(e: unknown): e is ExecError {
  return e instanceof ExecError;
}

function toMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

@Injectable()
export class ScanOrchestrator {
  constructor(
    private readonly configService: ConfigService,
    private readonly gitClient: GitClient,
    private readonly frameworkDetector: FrameworkDetector,
    private readonly coverageParser: CoverageParser,
    private readonly repositoryRepo: RepositoryRepository,
    private readonly scanJobRepo: ScanJobRepository,
    private readonly coverageFileRepo: CoverageFileRepository,
    private readonly sseEmitter: SseEmitter,
  ) {}

  async startScan(repositoryId: string): Promise<IScanJob> {
    const repo = await this.repositoryRepo.findById(repositoryId);
    if (!repo) {
      throw new NotFoundException(`Repository ${repositoryId} not found`);
    }

    const cloneDir = this.configService.get<string>('CLONE_DIR', './workspaces');
    const scanJobId = uuidv4();
    const workDir = path.resolve(cloneDir, `${repositoryId}-${scanJobId}`);

    // Ensure cloneDir exists
    fs.mkdirSync(cloneDir, { recursive: true });

    const scanJob = await this.scanJobRepo.save({
      id: scanJobId,
      repositoryId,
      status: ScanStatus.CLONING,
      workDir,
      errorMessage: null,
      logOutput: '',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await this.repositoryRepo.update(repositoryId, {
      scanStatus: ScanStatus.CLONING,
      scanError: null,
    });

    this.sseEmitter.emit(`repo:${repositoryId}`, 'repo:updated', {
      id: repositoryId,
      scanStatus: ScanStatus.CLONING,
      scanError: null,
    });

    // Fire and forget
    this.runPipeline(repo, scanJob).catch(() => {});

    return scanJob;
  }

  private async runPipeline(repo: IRepository, scanJob: IScanJob): Promise<void> {
    let log = '';
    const debugOutput = this.configService.get<string>('DEBUG_OUTPUT') === 'true';

    const appendLog = (line: string) => {
      log += line + '\n';
      if (debugOutput) {
        this.sseEmitter.emit(`repo:${repo.id}`, 'scan:log', { line });
      }
    };

    const fail = async (errorMessage: string) => {
      appendLog(`ERROR: ${errorMessage}`);
      await this.scanJobRepo.update(scanJob.id, {
        status: ScanStatus.FAILED,
        errorMessage,
        logOutput: log,
      }).catch(() => {});
      await this.repositoryRepo.update(repo.id, {
        scanStatus: ScanStatus.FAILED,
        scanError: errorMessage,
      }).catch(() => {});
      this.sseEmitter.emit(`repo:${repo.id}`, 'repo:updated', {
        id: repo.id,
        scanStatus: ScanStatus.FAILED,
        scanError: errorMessage,
      });
    };

    const transition = async (status: ScanStatus) => {
      await this.scanJobRepo.update(scanJob.id, { status, logOutput: log });
      await this.repositoryRepo.update(repo.id, { scanStatus: status });
      this.sseEmitter.emit(`repo:${repo.id}`, 'repo:updated', {
        id: repo.id,
        scanStatus: status,
      });
    };

    try {
      // ── CLONING ────────────────────────────────────────────────────────────
      appendLog(`Cloning ${repo.url} into ${scanJob.workDir}...`);
      const token = this.configService.get<string>('GITHUB_TOKEN', '');
      try {
        await this.gitClient.clone(repo.url, scanJob.workDir, token);
        appendLog('Clone successful.');
      } catch (e) {
        await fail(`CLONE_FAILED: Failed to clone repository: ${toMessage(e)}`);
        return;
      }

      // ── SCANNING ───────────────────────────────────────────────────────────
      await transition(ScanStatus.SCANNING);
      appendLog('Detecting framework...');

      let detection: DetectionResult;
      try {
        detection = this.frameworkDetector.detect(scanJob.workDir);
      } catch (e) {
        if (e instanceof NoLockfileError) {
          await fail(`NO_LOCKFILE: ${e.message}`);
        } else if (e instanceof UnsupportedTestFrameworkError) {
          await fail(`UNSUPPORTED_TEST_FRAMEWORK: ${e.message}`);
        } else {
          await fail(`SCANNING_FAILED: ${toMessage(e)}`);
        }
        return;
      }

      appendLog(
        `Detected: packageManager=${detection.packageManager}, testFramework=${detection.testFramework}, coverageFramework=${detection.coverageFramework}`,
      );
      appendLog(`TypeScript files: ${detection.totalTsFiles}`);

      await this.repositoryRepo.update(repo.id, {
        packageManager: detection.packageManager,
        testFramework: detection.testFramework,
        coverageFramework: detection.coverageFramework,
        totalTsFiles: detection.totalTsFiles,
      });

      // ── INSTALLING ─────────────────────────────────────────────────────────
      await transition(ScanStatus.INSTALLING);
      const installCmd = this.getInstallCommand(detection.packageManager);
      appendLog(`Installing dependencies: ${installCmd}`);

      try {
        const { stdout, stderr } = await this.runCmd(installCmd, scanJob.workDir);
        if (stdout) appendLog(stdout);
        if (stderr) appendLog(stderr);
        appendLog('Installation complete.');
      } catch (e) {
        if (isExecError(e)) {
          if (e.stdout) appendLog(e.stdout);
          if (e.stderr) appendLog(e.stderr);
        }
        await fail('INSTALL_FAILED: Dependency installation failed. See log output for details.');
        return;
      }

      // Install coverage provider if missing (vitest requires @vitest/coverage-v8 or @vitest/coverage-istanbul)
      if (detection.testFramework === TestFramework.VITEST) {
        const { CoverageFramework } = await import('../domain/enums/coverage-framework.enum');
        const coveragePkg = detection.coverageFramework === CoverageFramework.ISTANBUL
          ? '@vitest/coverage-istanbul'
          : '@vitest/coverage-v8';
        const coveragePkgDir = path.join(scanJob.workDir, 'node_modules', coveragePkg);
        if (!fs.existsSync(coveragePkgDir)) {
          // Pin to the exact installed vitest version to avoid peer dependency mismatches
          const vitestVersion = this.getInstalledPackageVersion(scanJob.workDir, 'vitest');
          const coveragePkgSpec = vitestVersion ? `${coveragePkg}@${vitestVersion}` : coveragePkg;
          const coverageInstallCmd = this.getCoverageProviderInstallCommand(detection.packageManager, coveragePkgSpec);
          appendLog(`Installing missing coverage provider: ${coverageInstallCmd}`);
          try {
            const { stdout, stderr } = await this.runCmd(coverageInstallCmd, scanJob.workDir);
            if (stdout) appendLog(stdout);
            if (stderr) appendLog(stderr);
          } catch (e) {
            if (isExecError(e)) {
              if (e.stdout) appendLog(e.stdout);
              if (e.stderr) appendLog(e.stderr);
            }
            await fail('INSTALL_FAILED: Failed to install coverage provider. See log output for details.');
            return;
          }
        }
      }

      // ── TESTING ────────────────────────────────────────────────────────────
      await transition(ScanStatus.TESTING);
      appendLog('Running coverage...');

      const result = await this.runCoverageWithFallback(
        detection.packageJson,
        detection.testFramework,
        scanJob.workDir,
        appendLog,
      );

      if (result.ok === false) {
        if (result.reason === 'command_failed') {
          await fail(
            'TESTS_FAILED: Test run failed — no coverage report was produced. See log output for details.',
          );
        } else {
          await fail(
            'TESTS_FAILED: coverage-summary.json was not produced. The repo must be configured to emit json-summary.',
          );
        }
        return;
      }

      // ── PARSE & PERSIST ────────────────────────────────────────────────────
      let parseResult: CoverageParseResult;
      try {
        parseResult = this.coverageParser.parse(result.summaryPath, scanJob.workDir);
      } catch (e) {
        await fail(`COVERAGE_PARSE_FAILED: ${toMessage(e)}`);
        return;
      }

      await this.coverageFileRepo.deleteByRepositoryId(repo.id);

      const coverageFileRecords = parseResult.coverageFiles.map((cf) => ({
        id: uuidv4(),
        repositoryId: repo.id,
        ...cf,
      }));
      await this.coverageFileRepo.saveMany(coverageFileRecords);

      await this.repositoryRepo.update(repo.id, {
        totalCoverage: parseResult.totalCoverage,
        avgCoverage: parseResult.avgCoverage,
        minCoverage: parseResult.minCoverage,
      });

      appendLog(`Coverage parsed: ${coverageFileRecords.length} files.`);
      if (parseResult.totalCoverage !== null) {
        appendLog(`Total coverage: ${parseResult.totalCoverage.toFixed(2)}%`);
      }

      // ── COMPLETE ───────────────────────────────────────────────────────────
      appendLog('Scan complete.');
      await this.scanJobRepo.update(scanJob.id, {
        status: ScanStatus.COMPLETE,
        logOutput: log,
      });
      await this.repositoryRepo.update(repo.id, { scanStatus: ScanStatus.COMPLETE });
      this.sseEmitter.emit(`repo:${repo.id}`, 'repo:updated', {
        id: repo.id,
        scanStatus: ScanStatus.COMPLETE,
      });
    } catch (e) {
      await fail(`Unexpected error: ${toMessage(e)}`);
    }
  }

  private async runCoverageWithFallback(
    packageJson: any,
    testFramework: TestFramework,
    workDir: string,
    appendLog: (line: string) => void,
  ): Promise<CoverageRunResult> {
    const scripts = packageJson?.scripts || {};

    // Step 1: scripts.test:coverage
    if (scripts['test:coverage']) {
      appendLog(`Running: npm run test:coverage`);
      try {
        const { stdout, stderr } = await this.runCmd(scripts['test:coverage'], workDir);
        if (stdout) appendLog(stdout);
        if (stderr) appendLog(stderr);
      } catch (e) {
        if (isExecError(e)) {
          if (e.stdout) appendLog(e.stdout);
          if (e.stderr) appendLog(e.stderr);
        }
        appendLog(`test:coverage failed with non-zero exit.`);
        return { ok: false, reason: 'command_failed' };
      }
      const found = this.coverageParser.findCoverageSummary(workDir);
      if (found) return { ok: true, summaryPath: found };
      appendLog('coverage-summary.json not found after test:coverage — falling back to step 3.');
      // Fall through to step 3 (skip step 2)
    } else if (scripts['coverage']) {
      // Step 2: scripts.coverage (only if step 1 did not exist)
      appendLog(`Running: npm run coverage`);
      try {
        const { stdout, stderr } = await this.runCmd(scripts['coverage'], workDir);
        if (stdout) appendLog(stdout);
        if (stderr) appendLog(stderr);
      } catch (e) {
        if (isExecError(e)) {
          if (e.stdout) appendLog(e.stdout);
          if (e.stderr) appendLog(e.stderr);
        }
        appendLog('coverage script failed with non-zero exit.');
        return { ok: false, reason: 'command_failed' };
      }
      const found = this.coverageParser.findCoverageSummary(workDir);
      if (found) return { ok: true, summaryPath: found };
      appendLog('coverage-summary.json not found after coverage script — falling back to step 3.');
      // Fall through to step 3
    }

    // Step 3: framework fallback
    const fallbackCmd =
      testFramework === TestFramework.JEST
        ? 'npx jest --coverage --coverageReporters=json-summary'
        : 'npx vitest run --coverage --coverage.reporter=json-summary';

    appendLog(`Running fallback: ${fallbackCmd}`);
    try {
      const { stdout, stderr } = await this.runCmd(fallbackCmd, workDir);
      if (stdout) appendLog(stdout);
      if (stderr) appendLog(stderr);
    } catch (e) {
      if (isExecError(e)) {
        if (e.stdout) appendLog(e.stdout);
        if (e.stderr) appendLog(e.stderr);
      }
      appendLog('Fallback coverage command failed with non-zero exit.');
      return { ok: false, reason: 'command_failed' };
    }

    const found = this.coverageParser.findCoverageSummary(workDir);
    if (!found) {
      appendLog('coverage-summary.json was not produced after fallback command.');
      return { ok: false, reason: 'no_summary_found' };
    }
    return { ok: true, summaryPath: found };
  }

  private getInstallCommand(packageManager: PackageManager): string {
    switch (packageManager) {
      case PackageManager.PNPM:
        return 'pnpm install';
      case PackageManager.YARN:
        return 'yarn install';
      case PackageManager.NPM:
        return 'npm install';
    }
  }

  private getInstalledPackageVersion(workDir: string, pkg: string): string | null {
    try {
      const pkgJson = path.join(workDir, 'node_modules', pkg, 'package.json');
      const data = JSON.parse(fs.readFileSync(pkgJson, 'utf-8'));
      return data.version ?? null;
    } catch {
      return null;
    }
  }

  private getCoverageProviderInstallCommand(packageManager: PackageManager, pkg: string): string {
    switch (packageManager) {
      case PackageManager.PNPM:
        return `pnpm add -Dw ${pkg}`;
      case PackageManager.YARN:
        return `yarn add -D ${pkg}`;
      case PackageManager.NPM:
        return `npm install -D ${pkg}`;
    }
  }

  private runCmd(cmd: string, cwd: string): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      exec(cmd, { cwd, maxBuffer: 50 * 1024 * 1024 }, (error, stdout, stderr) => {
        if (error) {
          reject(new ExecError(error.message, stdout, stderr));
        } else {
          resolve({ stdout, stderr });
        }
      });
    });
  }
}
