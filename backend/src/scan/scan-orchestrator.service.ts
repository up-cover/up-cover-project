import { Injectable, Logger, NotFoundException, OnApplicationBootstrap } from '@nestjs/common';
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
  UnsupportedTestFrameworkError,
} from '../domain/services/framework-detector';
import { SubProjectDiscovery } from '../domain/services/sub-project-discovery';
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
export class ScanOrchestrator implements OnApplicationBootstrap {
  private readonly logger = new Logger(ScanOrchestrator.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly gitClient: GitClient,
    private readonly frameworkDetector: FrameworkDetector,
    private readonly coverageParser: CoverageParser,
    private readonly subProjectDiscovery: SubProjectDiscovery,
    private readonly repositoryRepo: RepositoryRepository,
    private readonly scanJobRepo: ScanJobRepository,
    private readonly coverageFileRepo: CoverageFileRepository,
    private readonly sseEmitter: SseEmitter,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const stale = await this.repositoryRepo.findAllInProgress();
    const errorMessage = 'INTERRUPTED: Server restarted while scan was in progress.';
    for (const repo of stale) {
      this.logger.warn(`[${repo.owner}/${repo.name}] interrupted mid-scan — marking FAILED`);
      await this.repositoryRepo.update(repo.id, {
        scanStatus: ScanStatus.FAILED,
        scanError: errorMessage,
      }).catch(() => {});
      const latestJob = await this.scanJobRepo.findLatestByRepositoryId(repo.id);
      if (latestJob) {
        await this.scanJobRepo.update(latestJob.id, {
          status: ScanStatus.FAILED,
          errorMessage,
        }).catch(() => {});
      }
    }
  }

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

    this.logger.log(`[${repo.owner}/${repo.name}] scan started (job=${scanJobId})`);

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

    const tag = `[${repo.owner}/${repo.name}]`;

    const fail = async (errorMessage: string) => {
      this.logger.error(`${tag} FAILED: ${errorMessage}`);
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
      this.logger.log(`${tag} → ${status}`);
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
        this.logger.log(`${tag} clone complete`);
      } catch (e) {
        await fail(`CLONE_FAILED: Failed to clone repository: ${toMessage(e)}`);
        return;
      }

      // For child repos (sub-projects), run inside the sub-directory of the clone
      const effectiveWorkDir = repo.subPath
        ? path.join(scanJob.workDir, repo.subPath)
        : scanJob.workDir;

      // ── SCANNING ───────────────────────────────────────────────────────────
      await transition(ScanStatus.SCANNING);

      // Monorepo discovery — only for top-level repos (not already a sub-project)
      if (repo.subPath === null) {
        const subProjects = this.subProjectDiscovery.discover(scanJob.workDir);
        if (subProjects.length > 0) {
          appendLog(`Monorepo detected: ${subProjects.length} sub-project(s) found.`);
          for (const sp of subProjects) {
            appendLog(`  → ${sp.subPath}`);
          }

          for (const sp of subProjects) {
            const childRepo = await this.repositoryRepo.save({
              id: uuidv4(),
              owner: repo.owner,
              name: repo.name,
              url: repo.url,
              hasTypeScript: repo.hasTypeScript,
              parentRepositoryId: repo.id,
              subPath: sp.subPath,
              totalTsFiles: null,
              packageManager: null,
              testFramework: null,
              coverageFramework: null,
              totalCoverage: null,
              avgCoverage: null,
              minCoverage: null,
              scanStatus: ScanStatus.NOT_STARTED,
              scanError: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            });
            this.logger.log(`${tag} created child repo ${childRepo.id} for sub-project: ${sp.subPath}`);
            void this.startScan(childRepo.id);
          }

          appendLog('Monorepo discovery complete. Child scans started.');
          await this.scanJobRepo.update(scanJob.id, { status: ScanStatus.COMPLETE, logOutput: log });
          await this.repositoryRepo.update(repo.id, { scanStatus: ScanStatus.COMPLETE });
          this.sseEmitter.emit(`repo:${repo.id}`, 'repo:updated', {
            id: repo.id,
            scanStatus: ScanStatus.COMPLETE,
          });
          return;
        }
      }

      appendLog('Detecting framework...');

      let detection: DetectionResult;
      try {
        detection = this.frameworkDetector.detect(effectiveWorkDir);
      } catch (e) {
        if (e instanceof UnsupportedTestFrameworkError) {
          await fail(`UNSUPPORTED_TEST_FRAMEWORK: ${e.message}`);
        } else {
          await fail(`SCANNING_FAILED: ${toMessage(e)}`);
        }
        return;
      }

      this.logger.log(
        `${tag} detected: pm=${detection.packageManager}, test=${detection.testFramework}, coverage=${detection.coverageFramework}, ts-files=${detection.totalTsFiles}`,
      );
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

      this.sseEmitter.emit(`repo:${repo.id}`, 'repo:updated', {
        id: repo.id,
        packageManager: detection.packageManager,
        testFramework: detection.testFramework,
        coverageFramework: detection.coverageFramework,
        totalTsFiles: detection.totalTsFiles,
      });

      // ── INSTALLING ─────────────────────────────────────────────────────────
      await transition(ScanStatus.INSTALLING);
      const installCmd = this.getInstallCommand(detection.packageManager);
      this.logger.log(`${tag} installing: ${installCmd}`);
      appendLog(`Installing dependencies: ${installCmd}`);

      try {
        const { stdout, stderr } = await this.runCmd(installCmd, effectiveWorkDir);
        if (stdout) appendLog(stdout);
        if (stderr) appendLog(stderr);
        this.logger.log(`${tag} install complete`);
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
        const coveragePkgDir = path.join(effectiveWorkDir, 'node_modules', coveragePkg);
        if (!fs.existsSync(coveragePkgDir)) {
          // Pin to the exact installed vitest version to avoid peer dependency mismatches
          const vitestVersion = this.getInstalledPackageVersion(effectiveWorkDir, 'vitest');
          const coveragePkgSpec = vitestVersion ? `${coveragePkg}@${vitestVersion}` : coveragePkg;
          const coverageInstallCmd = this.getCoverageProviderInstallCommand(detection.packageManager, coveragePkgSpec);
          this.logger.warn(`${tag} coverage provider missing — installing: ${coverageInstallCmd}`);
          appendLog(`Installing missing coverage provider: ${coverageInstallCmd}`);
          try {
            const { stdout, stderr } = await this.runCmd(coverageInstallCmd, effectiveWorkDir);
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
        detection.packageManager,
        detection.testFramework,
        effectiveWorkDir,
        appendLog,
        tag,
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
        parseResult = this.coverageParser.parse(result.summaryPath, effectiveWorkDir);
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

      this.sseEmitter.emit(`repo:${repo.id}`, 'repo:updated', {
        id: repo.id,
        totalCoverage: parseResult.totalCoverage,
        avgCoverage: parseResult.avgCoverage,
        minCoverage: parseResult.minCoverage,
      });

      appendLog(`Coverage parsed: ${coverageFileRecords.length} files.`);
      if (parseResult.totalCoverage !== null) {
        appendLog(`Total coverage: ${parseResult.totalCoverage.toFixed(2)}%`);
      }

      // ── COMPLETE ───────────────────────────────────────────────────────────
      this.logger.log(
        `${tag} scan COMPLETE — files=${coverageFileRecords.length}` +
          (parseResult.totalCoverage !== null
            ? `, total=${parseResult.totalCoverage.toFixed(1)}%`
            : ''),
      );
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
    packageManager: PackageManager,
    testFramework: TestFramework,
    workDir: string,
    appendLog: (line: string) => void,
    tag: string,
  ): Promise<CoverageRunResult> {
    const scripts = packageJson?.scripts || {};

    // Step 1: scripts.test:coverage
    if (scripts['test:coverage']) {
      const cmd = this.getRunScriptCommand(packageManager, 'test:coverage');
      this.logger.log(`${tag} running coverage: ${cmd}`);
      appendLog(`Running: ${cmd}`);
      try {
        const { stdout, stderr } = await this.runCmd(cmd, workDir);
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
      this.logger.warn(`${tag} coverage-summary.json not found after test:coverage — falling back to step 3`);
      appendLog('coverage-summary.json not found after test:coverage — falling back to step 3.');
      // Fall through to step 3 (skip step 2)
    } else if (scripts['coverage']) {
      // Step 2: scripts.coverage (only if step 1 did not exist)
      const cmd = this.getRunScriptCommand(packageManager, 'coverage');
      this.logger.log(`${tag} running coverage: ${cmd}`);
      appendLog(`Running: ${cmd}`);
      let step2Failed = false;
      try {
        const { stdout, stderr } = await this.runCmd(cmd, workDir);
        if (stdout) appendLog(stdout);
        if (stderr) appendLog(stderr);
      } catch (e) {
        if (isExecError(e)) {
          if (e.stdout) appendLog(e.stdout);
          if (e.stderr) appendLog(e.stderr);
        }
        this.logger.warn(`${tag} coverage script failed — falling back to step 3`);
        appendLog('coverage script failed with non-zero exit — falling back to step 3.');
        step2Failed = true;
      }
      if (!step2Failed) {
        const found = this.coverageParser.findCoverageSummary(workDir);
        if (found) return { ok: true, summaryPath: found };
        this.logger.warn(`${tag} coverage-summary.json not found after coverage script — falling back to step 3`);
        appendLog('coverage-summary.json not found after coverage script — falling back to step 3.');
      }
      // Fall through to step 3
    }

    // Step 3: framework fallback
    // Inherit env var prefixes (e.g. NODE_OPTIONS=--experimental-vm-modules) from the
    // repo's test/ci-test script so ESM repos work correctly.
    const envPrefix = this.extractEnvPrefix(scripts);
    const fallbackCmd =
      testFramework === TestFramework.JEST
        ? `${envPrefix}npx jest --coverage --coverageReporters=json-summary`
        : `${envPrefix}npx vitest run --coverage --coverage.reporter=json-summary`;

    this.logger.log(`${tag} running coverage fallback: ${fallbackCmd}`);
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

  private getRunScriptCommand(packageManager: PackageManager, script: string): string {
    switch (packageManager) {
      case PackageManager.PNPM:
        return `pnpm run ${script}`;
      case PackageManager.YARN:
        return `yarn ${script}`;
      case PackageManager.NPM:
        return `npm run ${script}`;
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

  /**
   * Extracts leading KEY=VALUE env var assignments from the repo's test script
   * so the fallback command can inherit them (e.g. NODE_OPTIONS=--experimental-vm-modules).
   */
  private extractEnvPrefix(scripts: Record<string, string>): string {
    for (const key of ['test', 'ci-test']) {
      const script = scripts[key];
      if (!script) continue;
      // Only apply when the script is running jest/vitest
      if (!script.includes('jest') && !script.includes('vitest')) continue;
      // Match one or more KEY=VALUE pairs at the start of the command
      const m = script.match(/^((?:[A-Z_]+=\S+\s+)+)/);
      if (m) return m[1];
    }
    return '';
  }

  private runCmd(cmd: string, cwd: string, timeoutMs = 10 * 60 * 1000): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const env = { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', CI: '1' };
      exec(cmd, { cwd, env, maxBuffer: 50 * 1024 * 1024, timeout: timeoutMs }, (error, stdout, stderr) => {
        if (error) {
          reject(new ExecError(error.message, stdout, stderr));
        } else {
          resolve({ stdout, stderr });
        }
      });
    });
  }
}
