import { Inject, Injectable, Logger, NotFoundException, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { exec, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { SseEmitter } from '../sse/sse-emitter.service';
import { ImprovementStatus } from '../domain/enums/improvement-status.enum';
import { CoverageFramework } from '../domain/enums/coverage-framework.enum';
import { PackageManager } from '../domain/enums/package-manager.enum';
import { TestFramework } from '../domain/enums/test-framework.enum';
import { IImprovementJob } from '../domain/interfaces/improvement-job.interface';
import { IRepository } from '../domain/interfaces/repository.interface';
import { ICoverageFile } from '../domain/interfaces/coverage-file.interface';
import { GitClient } from '../infrastructure/git/git-client';
import { GitHubClient } from '../infrastructure/github/github-client';
import { LlmClient } from '../infrastructure/llm/llm-client';
import { LLM_CLIENT } from '../infrastructure/llm/llm-client.token';
import { CoverageParser } from '../domain/services/coverage-parser';
import { ImprovementJobRepository } from '../infrastructure/persistence/repositories/improvement-job.repository';
import { RepositoryRepository } from '../infrastructure/persistence/repositories/repository.repository';
import { CoverageFileRepository } from '../infrastructure/persistence/repositories/coverage-file.repository';
import { JobQueueService } from './job-queue.service';

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
export class ImprovementOrchestrator implements OnApplicationBootstrap {
  private readonly logger = new Logger(ImprovementOrchestrator.name);

  /** Jobs that have been cancelled — checked at each pipeline transition. */
  private readonly cancelledJobs = new Set<string>();
  /** Tracks the running child process per job for SIGTERM on cancel. */
  private readonly activeProcesses = new Map<string, ChildProcess>();
  /** AbortControllers for Ollama fetch streams, keyed by jobId. */
  private readonly ollamaAborts = new Map<string, AbortController>();

  constructor(
    private readonly configService: ConfigService,
    private readonly gitClient: GitClient,
    private readonly gitHubClient: GitHubClient,
    @Inject(LLM_CLIENT) private readonly llmClient: LlmClient,
    private readonly improvementJobRepo: ImprovementJobRepository,
    private readonly repositoryRepo: RepositoryRepository,
    private readonly coverageParser: CoverageParser,
    private readonly coverageFileRepo: CoverageFileRepository,
    private readonly jobQueueService: JobQueueService,
    private readonly sseEmitter: SseEmitter,
  ) { }

  async onApplicationBootstrap(): Promise<void> {
    // Mark any in-progress improvement jobs as FAILED (server restarted mid-run).
    const inProgressStatuses = [
      ImprovementStatus.CLONING,
      ImprovementStatus.GENERATING,
      ImprovementStatus.TESTING,
      ImprovementStatus.PUSHING,
      ImprovementStatus.CREATING_PR,
    ];
    for (const status of inProgressStatuses) {
      // We fetch all jobs with this status via repository query
    }
    // Simplified: find all jobs not in terminal state via direct check
    const allRepos = await this.repositoryRepo.findAll();
    for (const repo of allRepos) {
      const jobs = await this.improvementJobRepo.findByRepositoryId(repo.id);
      for (const job of jobs) {
        if (
          job.status === ImprovementStatus.CLONING ||
          job.status === ImprovementStatus.GENERATING ||
          job.status === ImprovementStatus.TESTING ||
          job.status === ImprovementStatus.PUSHING ||
          job.status === ImprovementStatus.CREATING_PR
        ) {
          this.logger.warn(`[improve:${job.id.slice(0, 8)}] interrupted mid-run — marking FAILED`);
          await this.improvementJobRepo
            .update(job.id, {
              status: ImprovementStatus.FAILED,
              errorMessage: 'INTERRUPTED: Server restarted while job was in progress.',
            })
            .catch(() => { });
          this.sseEmitter.emit(`job:${job.id}`, 'job:updated', {
            id: job.id,
            status: ImprovementStatus.FAILED,
            errorMessage: 'INTERRUPTED: Server restarted while job was in progress.',
          });
        }
      }
    }
  }

  async enqueueImprovement(repositoryId: string, fileId: string): Promise<IImprovementJob> {
    const repo = await this.repositoryRepo.findById(repositoryId);
    if (!repo) throw new NotFoundException(`Repository ${repositoryId} not found`);

    const coverageFile = await this.coverageFileRepo.findById(fileId);
    if (!coverageFile || coverageFile.repositoryId !== repositoryId) {
      throw new NotFoundException(`Coverage file ${fileId} not found`);
    }

    const jobId = uuidv4();
    const cloneDir = this.configService.get<string>('CLONE_DIR', './workspaces');
    const workDir = path.resolve(cloneDir, `improve-${jobId}`);
    const branchName = this.buildBranchName(jobId, coverageFile.filePath);

    fs.mkdirSync(cloneDir, { recursive: true });

    const job = await this.improvementJobRepo.save({
      id: jobId,
      repositoryId,
      filePath: coverageFile.filePath,
      status: ImprovementStatus.QUEUED,
      workDir,
      branchName,
      prUrl: null,
      errorMessage: null,
      logOutput: '',
      testsPass: null,
      coverageBeforePct: null,
      coverageAfterPct: null,
      coverageDeltaPct: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    this.logger.log(
      `[improve:${jobId.slice(0, 8)}] queued for ${repo.owner}/${repo.name} — file=${coverageFile.filePath}`,
    );

    this.sseEmitter.emit(`job:${jobId}`, 'job:updated', {
      id: jobId,
      status: ImprovementStatus.QUEUED,
    });

    this.jobQueueService.enqueue(repositoryId, jobId, () =>
      this.runPipeline(job, repo, coverageFile),
    );

    return job;
  }

  async cancelJob(jobId: string): Promise<void> {
    const job = await this.improvementJobRepo.findById(jobId);
    if (!job) throw new NotFoundException(`Improvement job ${jobId} not found`);

    // If already terminal, just clean up workspace
    const terminalStatuses = [
      ImprovementStatus.COMPLETE,
      ImprovementStatus.FAILED,
      ImprovementStatus.CANCELLED,
    ];
    if (terminalStatuses.includes(job.status)) {
      this.cleanupWorkspace(job.workDir);
      return;
    }

    // Mark cancelled so pipeline exits at next checkpoint
    this.cancelledJobs.add(jobId);

    // Remove from queue if still waiting
    this.jobQueueService.dequeueIfWaiting(job.repositoryId, jobId);

    // Kill running subprocess
    const child = this.activeProcesses.get(jobId);
    if (child) {
      child.kill('SIGTERM');
      this.activeProcesses.delete(jobId);
    }

    // Abort Ollama stream
    const abort = this.ollamaAborts.get(jobId);
    if (abort) {
      abort.abort();
      this.ollamaAborts.delete(jobId);
    }

    await this.improvementJobRepo
      .update(jobId, { status: ImprovementStatus.CANCELLED })
      .catch(() => { });

    this.cleanupWorkspace(job.workDir);

    this.logger.log(`[improve:${jobId.slice(0, 8)}] cancelled`);
    this.sseEmitter.emit(`job:${jobId}`, 'job:updated', {
      id: jobId,
      status: ImprovementStatus.CANCELLED,
    });
  }

  // ─── Pipeline ────────────────────────────────────────────────────────────────

  private async runPipeline(
    job: IImprovementJob,
    repo: IRepository,
    coverageFile: ICoverageFile,
  ): Promise<void> {
    let log = '';
    const debugOutput = this.configService.get<string>('DEBUG_OUTPUT') === 'true';
    const token = this.configService.get<string>('GITHUB_TOKEN', '');
    const botName = this.configService.get<string>('GIT_BOT_NAME', 'UpCover Bot');
    const botEmail = this.configService.get<string>('GIT_BOT_EMAIL', 'upcover@local');
    const fileSizeLimitKb = this.configService.get<number>('FILE_SIZE_LIMIT_KB', 200);
    const tag = `[improve:${job.id.slice(0, 8)}]`;
    let coverageBeforePct: number | null = null;
    let coverageAfterPct: number | null = null;
    let coverageDeltaPct: number | null = null;

    const appendLog = (line: string) => {
      log += line + '\n';
      if (debugOutput) {
        this.sseEmitter.emit(`job:${job.id}`, 'job:log', { line });
      }
    };

    const isCancelled = () => this.cancelledJobs.has(job.id);

    const fail = async (errorMessage: string) => {
      if (isCancelled()) return; // already handled
      this.logger.error(`${tag} FAILED: ${errorMessage}`);
      appendLog(`ERROR: ${errorMessage}`);
      await this.improvementJobRepo
        .update(job.id, {
          status: ImprovementStatus.FAILED,
          errorMessage,
          logOutput: log,
        })
        .catch(() => { });
      this.sseEmitter.emit(`job:${job.id}`, 'job:updated', {
        id: job.id,
        status: ImprovementStatus.FAILED,
        errorMessage,
      });
    };

    const transition = async (status: ImprovementStatus) => {
      this.logger.log(`${tag} → ${status}`);
      await this.improvementJobRepo.update(job.id, { status, logOutput: log }).catch(() => { });
      this.sseEmitter.emit(`job:${job.id}`, 'job:updated', { id: job.id, status });
    };

    try {
      // ── CLONING ──────────────────────────────────────────────────────────────
      await transition(ImprovementStatus.CLONING);
      appendLog(`Cloning ${repo.url} into ${job.workDir}...`);

      // Check if branch already exists on remote
      try {
        const exists = await this.gitClient.remoteBranchExists(repo.url, job.branchName, token);
        if (exists) {
          await fail(`PUSH_FAILED: Branch ${job.branchName} already exists on remote.`);
          return;
        }
      } catch (e) {
        appendLog(`Warning: could not check remote branches: ${toMessage(e)}`);
      }

      if (isCancelled()) return;

      try {
        await this.gitClient.clone(repo.url, job.workDir, token, false /* full clone */);
        appendLog('Clone complete.');
        this.logger.log(`${tag} clone complete`);
      } catch (e) {
        await fail(`CLONE_FAILED: Failed to clone repository: ${toMessage(e)}`);
        return;
      }

      if (isCancelled()) return;

      try {
        await this.gitClient.createBranch(job.workDir, job.branchName);
        appendLog(`Created branch: ${job.branchName}`);
        this.logger.log(`${tag} branch created: ${job.branchName}`);
      } catch (e) {
        await fail(`CLONE_FAILED: Failed to create branch: ${toMessage(e)}`);
        return;
      }

      if (isCancelled()) return;

      // ── GENERATING ───────────────────────────────────────────────────────────
      if (!repo.packageManager || !repo.testFramework) {
        await fail('GENERATION_FAILED: Repository has no detected package manager or test framework. Run a scan first.');
        return;
      }
      const { testFramework, packageManager } = repo;

      await transition(ImprovementStatus.GENERATING);

      const sourceAbsPath = path.join(job.workDir, coverageFile.filePath);
      let sourceContent: string;
      try {
        sourceContent = fs.readFileSync(sourceAbsPath, 'utf-8');
      } catch (e) {
        await fail(`GENERATION_FAILED: Could not read source file: ${toMessage(e)}`);
        return;
      }

      const { testFilePath, existingTestContent } = this.locateTestFile(
        job.workDir,
        coverageFile.filePath,
      );
      const testFileAbsPath = path.join(job.workDir, testFilePath);
      const contributingMd = this.readFileIfExists(path.join(job.workDir, 'CONTRIBUTING.md'));
      const agentsMd =
        this.readFileIfExists(path.join(job.workDir, 'AGENTS.md')) ??
        this.readFileIfExists(path.join(job.workDir, 'CLAUDE.md'));
      const packageJson = this.loadNearestPackageJson(job.workDir, coverageFile.filePath);
      const relatedFiles = this.loadRelatedFiles(
        job.workDir,
        coverageFile.filePath,
        sourceContent,
        fileSizeLimitKb,
      );

      const llmProvider = this.configService.get<string>('LLM_PROVIDER', 'ollama');
      this.logger.log(
        `${tag} requesting LLM (provider=${llmProvider})` +
        (existingTestContent ? ' — existing test found' : ' — no existing test') +
        (relatedFiles.length > 0 ? `, related=${relatedFiles.length}` : ''),
      );
      appendLog(`Generating tests for ${coverageFile.filePath} via ${llmProvider}...`);
      appendLog(`Test file target: ${testFilePath}`);

      let generatedContent: string;
      try {
        const abortCtrl = new AbortController();
        this.ollamaAborts.set(job.id, abortCtrl);

        generatedContent = await this.llmClient.generateTests(
          {
            sourceFilePath: coverageFile.filePath,
            sourceFileContent: sourceContent,
            existingTestContent,
            contributingMd,
            agentsMd,
            packageJson,
            relatedFiles,
            testFramework,
          },
          () => { /* token streaming intentionally suppressed — too noisy for the debug log */ },
          abortCtrl.signal,
        );

        this.ollamaAborts.delete(job.id);
        this.logger.log(`${tag} generation complete (${generatedContent.length} chars → ${testFilePath})`);
      } catch (e) {
        this.ollamaAborts.delete(job.id);
        if (isCancelled()) return;
        await fail(`GENERATION_FAILED: LLM failed to generate tests: ${toMessage(e)}`);
        return;
      }

      if (isCancelled()) return;

      // Do not write the test file yet: we run "before" coverage first
      // so the delta reflects the new/updated test content.
      appendLog(`Test file content generated (pending write to ${testFilePath})`);

      // ── TESTING ──────────────────────────────────────────────────────────────
      await transition(ImprovementStatus.TESTING);

      // Install dependencies
      const installCmd = this.getInstallCommand(packageManager);
      this.logger.log(`${tag} installing: ${installCmd}`);
      appendLog(`Installing dependencies: ${installCmd}`);
      try {
        const { stdout, stderr } = await this.runCmd(installCmd, job.workDir, job.id);
        if (stdout) appendLog(stdout);
        if (stderr) appendLog(stderr);
      } catch (e) {
        if (isCancelled()) return;
        if (isExecError(e)) {
          if (e.stdout) appendLog(e.stdout);
          if (e.stderr) appendLog(e.stderr);
        }
        await fail('GENERATED_TESTS_FAIL: Dependency installation failed before running tests.');
        return;
      }

      if (isCancelled()) return;

      // Install vitest coverage provider if needed (vitest requires @vitest/coverage-v8 or
      // @vitest/coverage-istanbul for json-summary reports).
      if (testFramework === TestFramework.VITEST) {
        const coverageFramework = repo.coverageFramework ?? CoverageFramework.V8;
        try {
          await this.ensureVitestCoverageProviderInstalled(
            job.workDir,
            packageManager,
            coverageFramework,
            tag,
            appendLog,
            job.id,
          );
        } catch (e) {
          await fail(`INSTALL_FAILED: Failed to install vitest coverage provider: ${toMessage(e)}`);
          return;
        }
      }

      if (isCancelled()) return;

      // ── COVERAGE (before) ───────────────────────────────────────────────
      this.deleteCoverageSummaryArtifacts(job.workDir);
      appendLog('Running baseline coverage...');
      const beforeCoverage = await this.runCoverageWithFallback(
        packageJson,
        packageManager,
        testFramework,
        job.workDir,
        appendLog,
        tag,
        job.id,
      );
      if (beforeCoverage.ok === false || !beforeCoverage.summaryPath) {
        if (beforeCoverage.reason === 'command_failed') {
          await fail(
            'COVERAGE_BEFORE_FAILED: Test run failed — no coverage report was produced. See log output for details.',
          );
          return;
        }
        await fail(
          'COVERAGE_BEFORE_FAILED: coverage-summary.json was not produced. The repo must be configured to emit json-summary.',
        );
        return;
      }

      try {
        coverageBeforePct = this.getCoveragePctForFileFromSummary(
          beforeCoverage.summaryPath,
          job.workDir,
          coverageFile.filePath,
        );
      } catch (e) {
        await fail(`COVERAGE_BEFORE_PARSE_FAILED: ${toMessage(e)}`);
        return;
      }

      await this.improvementJobRepo
        .update(job.id, { coverageBeforePct })
        .catch(() => { });
      appendLog(
        `Baseline coverage for ${coverageFile.filePath}: ${coverageBeforePct != null ? `${coverageBeforePct.toFixed(2)}%` : '—'
        }`,
      );

      // Write the generated test file now that the baseline is captured.
      fs.mkdirSync(path.dirname(testFileAbsPath), { recursive: true });
      fs.writeFileSync(testFileAbsPath, generatedContent, 'utf-8');
      appendLog(`Test file written to ${testFilePath}`);

      // Run scoped tests
      const testCmd = this.getScopedTestCommand(testFramework, testFilePath);
      this.logger.log(`${tag} running tests: ${testCmd}`);
      appendLog(`Running tests: ${testCmd}`);
      let testsFailed = false;
      try {
        const { stdout, stderr } = await this.runCmd(testCmd, job.workDir, job.id);
        if (stdout) appendLog(stdout);
        if (stderr) appendLog(stderr);
      } catch (e) {
        if (isCancelled()) return;
        testsFailed = true;
        if (isExecError(e)) {
          if (e.stdout) appendLog(e.stdout);
          if (e.stderr) appendLog(e.stderr);
        }
      }

      if (isCancelled()) return;

      if (testsFailed) {
        await this.improvementJobRepo
          .update(job.id, { testsPass: false, logOutput: log })
          .catch(() => { });
        await fail('GENERATED_TESTS_FAIL: Generated tests do not pass. Review the log output and try again.');
        return;
      }

      await this.improvementJobRepo.update(job.id, { testsPass: true }).catch(() => { });
      this.logger.log(`${tag} tests passed`);
      appendLog('Tests passed.');

      // ── COVERAGE (after) ────────────────────────────────────────────────
      this.deleteCoverageSummaryArtifacts(job.workDir);
      appendLog('Running coverage after changes...');
      const afterCoverage = await this.runCoverageWithFallback(
        packageJson,
        packageManager,
        testFramework,
        job.workDir,
        appendLog,
        tag,
        job.id,
      );
      if (afterCoverage.ok === false || !afterCoverage.summaryPath) {
        if (afterCoverage.reason === 'command_failed') {
          await fail(
            'COVERAGE_AFTER_FAILED: Test run failed — no coverage report was produced. See log output for details.',
          );
          return;
        }
        await fail(
          'COVERAGE_AFTER_FAILED: coverage-summary.json was not produced. The repo must be configured to emit json-summary.',
        );
        return;
      }

      try {
        coverageAfterPct = this.getCoveragePctForFileFromSummary(
          afterCoverage.summaryPath,
          job.workDir,
          coverageFile.filePath,
        );
        coverageDeltaPct =
          coverageBeforePct != null && coverageAfterPct != null ? coverageAfterPct - coverageBeforePct : null;
      } catch (e) {
        await fail(`COVERAGE_AFTER_PARSE_FAILED: ${toMessage(e)}`);
        return;
      }

      await this.improvementJobRepo
        .update(job.id, { coverageAfterPct, coverageDeltaPct })
        .catch(() => { });

      appendLog(
        `After coverage for ${coverageFile.filePath}: ${coverageAfterPct != null ? `${coverageAfterPct.toFixed(2)}%` : '—'
        } (Δ${coverageDeltaPct != null ? `${coverageDeltaPct.toFixed(2)}%` : '—'
        })`,
      );

      // ── PUSHING ──────────────────────────────────────────────────────────────
      await transition(ImprovementStatus.PUSHING);

      const fileSlug = this.buildFileSlug(coverageFile.filePath);
      const commitMsg = `test(${fileSlug}): improve test coverage via UpCover`;

      try {
        await this.gitClient.addFile(job.workDir, testFilePath);
        await this.gitClient.commit(job.workDir, commitMsg, botName, botEmail);
        appendLog(`Committed: ${commitMsg}`);
      } catch (e) {
        if (isCancelled()) return;
        await fail(`PUSH_FAILED: Failed to commit changes: ${toMessage(e)}`);
        return;
      }

      if (isCancelled()) return;

      try {
        await this.gitClient.push(job.workDir, job.branchName, repo.url, token);
        this.logger.log(`${tag} branch pushed: ${job.branchName}`);
        appendLog(`Pushed branch: ${job.branchName}`);
      } catch (e) {
        if (isCancelled()) return;
        await fail(`PUSH_FAILED: Failed to push branch to GitHub: ${toMessage(e)}`);
        return;
      }

      if (isCancelled()) return;

      // ── CREATING_PR ──────────────────────────────────────────────────────────
      await transition(ImprovementStatus.CREATING_PR);

      let prUrl: string;
      try {
        const defaultBranch = await this.gitHubClient.getDefaultBranch(repo.owner, repo.name);
        const prTitle = `[UpCover] Improve test coverage for ${coverageFile.filePath}`;
        const covBeforeStr = coverageBeforePct != null ? `${coverageBeforePct.toFixed(2)}%` : '—';
        const covAfterStr = coverageAfterPct != null ? `${coverageAfterPct.toFixed(2)}%` : '—';
        const covDeltaStr = coverageDeltaPct != null ? `${coverageDeltaPct.toFixed(2)}%` : '—';
        const prBody = [
          `## UpCover — Automated Test Coverage Improvement`,
          ``,
          `| Field | Value |`,
          `|-------|-------|`,
          `| **File** | \`${coverageFile.filePath}\` |`,
          `| **Job ID** | \`${job.id}\` |`,
          `| **Branch** | \`${job.branchName}\` |`,
          `| **Coverage (before)** | \`${covBeforeStr}\` |`,
          `| **Coverage (after)** | \`${covAfterStr}\` |`,
          `| **Coverage delta** | \`${covDeltaStr}\` |`,
          ``,
          `This pull request was generated automatically by [UpCover](https://github.com/up-cover/upcover).`,
        ].join('\n');

        prUrl = await this.gitHubClient.createPullRequest(
          repo.owner,
          repo.name,
          job.branchName,
          defaultBranch,
          prTitle,
          prBody,
        );
        this.logger.log(`${tag} PR created: ${prUrl}`);
        appendLog(`PR created: ${prUrl}`);
      } catch (e) {
        if (isCancelled()) return;
        await fail(`PR_CREATION_FAILED: Failed to create pull request: ${toMessage(e)}`);
        return;
      }

      if (isCancelled()) return;

      // ── COMPLETE ─────────────────────────────────────────────────────────────
      await this.improvementJobRepo
        .update(job.id, {
          status: ImprovementStatus.COMPLETE,
          prUrl,
          logOutput: log,
          coverageBeforePct,
          coverageAfterPct,
          coverageDeltaPct,
        })
        .catch(() => { });

      this.sseEmitter.emit(`job:${job.id}`, 'job:updated', {
        id: job.id,
        status: ImprovementStatus.COMPLETE,
        prUrl,
        coverageBeforePct,
        coverageAfterPct,
        coverageDeltaPct,
      });

      this.logger.log(`${tag} COMPLETE`);
      appendLog('Improvement job complete.');
    } catch (e) {
      if (!isCancelled()) {
        await fail(`Unexpected error: ${toMessage(e)}`);
      }
    } finally {
      this.cancelledJobs.delete(job.id);
      this.activeProcesses.delete(job.id);
      this.ollamaAborts.delete(job.id);
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private buildBranchName(jobId: string, filePath: string): string {
    return `upcover/${jobId}/${this.buildFileSlug(filePath)}`;
  }

  private buildFileSlug(filePath: string): string {
    return filePath.replace(/[/.]/g, '-').toLowerCase();
  }

  /**
   * Locate an existing test file for the given source file path, and determine
   * where the generated test file should be written.
   *
   * Prefers *.test.* over *.spec.*. Returns the relative (to workDir) test file path.
   */
  private locateTestFile(
    workDir: string,
    filePath: string,
  ): { testFilePath: string; existingTestContent: string | null } {
    const ext = path.extname(filePath); // e.g. '.ts' or '.tsx'
    const base = path.basename(filePath, ext); // e.g. 'parser'
    const dir = path.dirname(filePath); // e.g. 'src/utils'

    const isTsx = ext === '.tsx';
    const testExt = isTsx ? '.tsx' : '.ts';

    // Candidate paths to check (test preferred over spec)
    const candidates = [
      path.join(dir, `${base}.test${testExt}`),
      path.join(dir, `${base}.test.ts`),
      path.join(dir, `${base}.test.tsx`),
      path.join(dir, `${base}.spec${testExt}`),
      path.join(dir, `${base}.spec.ts`),
      path.join(dir, `${base}.spec.tsx`),
      path.join(dir, '__tests__', `${base}.test${testExt}`),
      path.join(dir, '__tests__', `${base}.test.ts`),
      path.join(dir, '__tests__', `${base}.test.tsx`),
      path.join(dir, '__tests__', `${base}.spec${testExt}`),
    ];

    for (const candidate of candidates) {
      const absPath = path.join(workDir, candidate);
      if (fs.existsSync(absPath)) {
        try {
          const content = fs.readFileSync(absPath, 'utf-8');
          return { testFilePath: candidate, existingTestContent: content };
        } catch {
          // Continue
        }
      }
    }

    // No existing test — infer placement convention from the repo's existing tests
    const inferredDir = this.inferTestDir(workDir, dir);
    const testFilePath = path.join(inferredDir, `${base}.test${testExt}`);
    return { testFilePath, existingTestContent: null };
  }

  /**
   * Walk existing test files to infer whether the repo uses co-located tests
   * or a `__tests__` subdirectory convention.
   */
  private inferTestDir(workDir: string, sourceDir: string): string {
    // Quick heuristic: look for __tests__ directories anywhere in the repo
    const hasTestsDir = this.dirExistsAnywhere(workDir, '__tests__');
    if (hasTestsDir) {
      return path.join(sourceDir, '__tests__');
    }
    // Default: co-located
    return sourceDir;
  }

  private dirExistsAnywhere(root: string, dirName: string): boolean {
    const excluded = new Set(['node_modules', '.git', 'dist', 'coverage']);
    const check = (dir: string, depth: number): boolean => {
      if (depth > 6) return false;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory() || excluded.has(entry.name)) continue;
          if (entry.name === dirName) return true;
          if (check(path.join(dir, entry.name), depth + 1)) return true;
        }
      } catch {
        // Ignore permission errors
      }
      return false;
    };
    return check(root, 0);
  }

  /** Read relative imports from source file and include them if they fit size limit. */
  private loadRelatedFiles(
    workDir: string,
    sourceFilePath: string,
    sourceContent: string,
    fileSizeLimitKb: number,
  ): Array<{ path: string; content: string }> {
    const related: Array<{ path: string; content: string }> = [];
    const sourceDir = path.dirname(path.join(workDir, sourceFilePath));

    const importRegex = /from\s+['"](\.[^'"]+)['"]/g;
    let match: RegExpExecArray | null;

    while ((match = importRegex.exec(sourceContent)) !== null) {
      const importPath = match[1];
      // Try with various extensions
      for (const ext of ['.ts', '.tsx', '.js', '.jsx', '']) {
        const absPath = path.resolve(sourceDir, importPath + ext);
        const relPath = path.relative(workDir, absPath);
        if (!fs.existsSync(absPath)) continue;
        try {
          const stat = fs.statSync(absPath);
          if (stat.size > fileSizeLimitKb * 1024) break;
          const content = fs.readFileSync(absPath, 'utf-8');
          related.push({ path: relPath, content });
        } catch {
          // Skip
        }
        break;
      }
      // Cap at 5 related files to keep context manageable
      if (related.length >= 5) break;
    }

    return related;
  }

  private readFileIfExists(absPath: string): string | null {
    try {
      return fs.readFileSync(absPath, 'utf-8');
    } catch {
      return null;
    }
  }

  /**
   * Walk up from the source file's directory until a package.json is found,
   * stopping at the workspace root. Returns parsed JSON or null.
   */
  private loadNearestPackageJson(workDir: string, sourceFilePath: string): Record<string, unknown> | null {
    let dir = path.dirname(path.join(workDir, sourceFilePath));
    while (dir.startsWith(workDir)) {
      const candidate = path.join(dir, 'package.json');
      const content = this.readFileIfExists(candidate);
      if (content) {
        try {
          return JSON.parse(content) as Record<string, unknown>;
        } catch {
          return null;
        }
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    return null;
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

  private getScopedTestCommand(testFramework: TestFramework, testFilePath: string): string {
    switch (testFramework) {
      case TestFramework.JEST:
        return `npx jest ${testFilePath} --passWithNoTests`;
      case TestFramework.VITEST:
        return `npx vitest run ${testFilePath}`;
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

  private async runCoverageWithFallback(
    packageJson: any,
    packageManager: PackageManager,
    testFramework: TestFramework,
    workDir: string,
    appendLog: (line: string) => void,
    tag: string,
    jobId: string,
  ): Promise<{ ok: boolean; summaryPath?: string; reason?: string }> {
    const scripts = packageJson?.scripts || {};

    // Step 1: scripts.test:coverage
    if (scripts['test:coverage']) {
      const cmd = this.getRunScriptCommand(packageManager, 'test:coverage');
      this.logger.log(`${tag} running coverage: ${cmd}`);
      appendLog(`Running: ${cmd}`);
      try {
        const { stdout, stderr } = await this.runCmd(cmd, workDir, jobId);
        if (stdout) appendLog(stdout);
        if (stderr) appendLog(stderr);
      } catch (e) {
        if (isExecError(e)) {
          if (e.stdout) appendLog(e.stdout);
          if (e.stderr) appendLog(e.stderr);
        }
        appendLog('test:coverage failed with non-zero exit.');
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
        const { stdout, stderr } = await this.runCmd(cmd, workDir, jobId);
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
      const { stdout, stderr } = await this.runCmd(fallbackCmd, workDir, jobId);
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

  private deleteCoverageSummaryArtifacts(workDir: string): void {
    // Remove the common coverage output locations so we don't accidentally parse stale
    // json-summary reports from the previous run.
    try {
      fs.rmSync(path.join(workDir, 'coverage'), { recursive: true, force: true });
    } catch {
      // Best-effort
    }
    try {
      fs.rmSync(path.join(workDir, 'coverage-summary.json'), { force: true });
    } catch {
      // Best-effort
    }
    try {
      const found = this.coverageParser.findCoverageSummary(workDir);
      if (found) fs.rmSync(found, { force: true });
    } catch {
      // Best-effort
    }
  }

  private normalizeCoveragePath(p: string): string {
    return p.replace(/\\/g, '/').replace(/^\.\//, '');
  }

  private getCoveragePctForFileFromSummary(
    summaryPath: string,
    workDir: string,
    filePath: string,
  ): number | null {
    const parseResult = this.coverageParser.parse(summaryPath, workDir);
    const target = this.normalizeCoveragePath(filePath);
    const hit = parseResult.coverageFiles.find((cf) => {
      const candidate = this.normalizeCoveragePath(cf.filePath);
      return candidate === target || candidate.endsWith(`/${target}`) || candidate.endsWith(target);
    });
    return hit ? hit.coveragePct : null;
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

  private async ensureVitestCoverageProviderInstalled(
    workDir: string,
    packageManager: PackageManager,
    coverageFramework: CoverageFramework,
    tag: string,
    appendLog: (line: string) => void,
    jobId: string,
  ): Promise<void> {
    const coveragePkg =
      coverageFramework === CoverageFramework.ISTANBUL
        ? '@vitest/coverage-istanbul'
        : '@vitest/coverage-v8';
    const coveragePkgDir = path.join(workDir, 'node_modules', coveragePkg);
    if (fs.existsSync(coveragePkgDir)) return;

    // Pin to the exact installed vitest version to avoid peer dependency mismatches
    const vitestVersion = this.getInstalledPackageVersion(workDir, 'vitest');
    const coveragePkgSpec = vitestVersion ? `${coveragePkg}@${vitestVersion}` : coveragePkg;
    const coverageInstallCmd = this.getCoverageProviderInstallCommand(packageManager, coveragePkgSpec);

    this.logger.warn(`${tag} coverage provider missing — installing: ${coverageInstallCmd}`);
    appendLog(`Installing missing coverage provider: ${coverageInstallCmd}`);

    try {
      const { stdout, stderr } = await this.runCmd(coverageInstallCmd, workDir, jobId);
      if (stdout) appendLog(stdout);
      if (stderr) appendLog(stderr);
    } catch (e) {
      if (isExecError(e)) {
        if (e.stdout) appendLog(e.stdout);
        if (e.stderr) appendLog(e.stderr);
      }
      throw e;
    }
  }

  private cleanupWorkspace(workDir: string): void {
    if (workDir && fs.existsSync(workDir)) {
      try {
        fs.rmSync(workDir, { recursive: true, force: true });
      } catch {
        // Best-effort
      }
    }
  }

  private runCmd(
    cmd: string,
    cwd: string,
    jobId: string,
    timeoutMs = 10 * 60 * 1000,
  ): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const env = { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', CI: '1' };
      const child = exec(
        cmd,
        { cwd, env, maxBuffer: 50 * 1024 * 1024, timeout: timeoutMs },
        (error, stdout, stderr) => {
          this.activeProcesses.delete(jobId);
          if (error) {
            reject(new ExecError(error.message, stdout, stderr));
          } else {
            resolve({ stdout, stderr });
          }
        },
      );
      this.activeProcesses.set(jobId, child);
    });
  }

  async getJobsForFile(repositoryId: string, fileId: string): Promise<IImprovementJob[]> {
    const file = await this.coverageFileRepo.findById(fileId);
    if (!file || file.repositoryId !== repositoryId) {
      throw new NotFoundException(`Coverage file ${fileId} not found`);
    }
    return this.improvementJobRepo.findByRepositoryIdAndFilePath(repositoryId, file.filePath);
  }
}
