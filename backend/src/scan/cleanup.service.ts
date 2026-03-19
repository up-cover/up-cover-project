import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { ScanJobRepository } from '../infrastructure/persistence/repositories/scan-job.repository';
import { ImprovementJobRepository } from '../infrastructure/persistence/repositories/improvement-job.repository';
import { ScanStatus } from '../domain/enums/scan-status.enum';

const UUID_RE =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

const IMPROVE_RE =
  /^improve-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

const CLEANUP_INTERVAL = parseInt(process.env['CLEANUP_INTERVAL_MS'] ?? '3600000', 10);

@Injectable()
export class CleanupService {
  private readonly logger = new Logger(CleanupService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly scanJobRepo: ScanJobRepository,
    private readonly improvementJobRepo: ImprovementJobRepository,
  ) {}

  @Interval(CLEANUP_INTERVAL)
  async cleanupFailedWorkspaces(): Promise<void> {
    const cloneDir = this.configService.get<string>('CLONE_DIR', './workspaces');
    const intervalMs = this.configService.get<number>('CLEANUP_INTERVAL_MS', 3600000);
    const cutoff = Date.now() - intervalMs;

    if (!fs.existsSync(cloneDir)) return;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(cloneDir, { withFileTypes: true });
    } catch (e) {
      this.logger.error(`Failed to read CLONE_DIR ${cloneDir}: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }

    let deleted = 0;
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const scanMatch = UUID_RE.exec(entry.name);
      if (scanMatch) {
        const scanJobId = scanMatch[2];
        let job;
        try {
          job = await this.scanJobRepo.findById(scanJobId);
        } catch (e) {
          this.logger.warn(`Failed to query scan job ${scanJobId}: ${e instanceof Error ? e.message : String(e)}`);
          continue;
        }

        // Orphaned (repo deleted) — job record no longer exists
        const isOrphaned = !job;
        // Failed and old enough to clean up
        const isStaleFailure = job?.status === ScanStatus.FAILED && job.createdAt.getTime() <= cutoff;

        if (!isOrphaned && !isStaleFailure) continue;

        const dirPath = path.join(cloneDir, entry.name);
        try {
          fs.rmSync(dirPath, { recursive: true, force: true });
          deleted++;
          this.logger.log(`Deleted ${isOrphaned ? 'orphaned' : 'failed'} scan workspace: ${dirPath}`);
        } catch (e) {
          this.logger.warn(`Failed to delete workspace ${dirPath}: ${e instanceof Error ? e.message : String(e)}`);
        }
        continue;
      }

      const improveMatch = IMPROVE_RE.exec(entry.name);
      if (improveMatch) {
        const jobId = improveMatch[1];
        let job;
        try {
          job = await this.improvementJobRepo.findById(jobId);
        } catch (e) {
          this.logger.warn(`Failed to query improvement job ${jobId}: ${e instanceof Error ? e.message : String(e)}`);
          continue;
        }

        if (job) continue; // Still exists — leave it alone

        const dirPath = path.join(cloneDir, entry.name);
        try {
          fs.rmSync(dirPath, { recursive: true, force: true });
          deleted++;
          this.logger.log(`Deleted orphaned improvement workspace: ${dirPath}`);
        } catch (e) {
          this.logger.warn(`Failed to delete workspace ${dirPath}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }

    if (deleted > 0) {
      this.logger.log(`Cleanup complete: removed ${deleted} workspace(s).`);
    }
  }
}
