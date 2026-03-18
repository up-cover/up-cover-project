import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import { ScanJobRepository } from '../infrastructure/persistence/repositories/scan-job.repository';

@Injectable()
export class CleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CleanupService.name);
  private intervalHandle: NodeJS.Timeout;

  constructor(
    private readonly configService: ConfigService,
    private readonly scanJobRepo: ScanJobRepository,
  ) {}

  onModuleInit() {
    const intervalMs = this.configService.get<number>('CLEANUP_INTERVAL_MS', 3600000);
    this.intervalHandle = setInterval(() => this.cleanupFailedWorkspaces(), intervalMs);
    this.logger.log(`Cleanup service started (interval: ${intervalMs}ms).`);
  }

  onModuleDestroy() {
    if (this.intervalHandle) clearInterval(this.intervalHandle);
  }

  async cleanupFailedWorkspaces(): Promise<void> {
    const intervalMs = this.configService.get<number>('CLEANUP_INTERVAL_MS', 3600000);
    const cutoff = Date.now() - intervalMs;

    try {
      const failedJobs = await this.scanJobRepo.findAllFailed();
      let deleted = 0;

      for (const job of failedJobs) {
        if (!job.workDir) continue;

        const createdAt = job.createdAt instanceof Date
          ? job.createdAt.getTime()
          : new Date(job.createdAt).getTime();

        if (createdAt > cutoff) continue;

        if (fs.existsSync(job.workDir)) {
          try {
            fs.rmSync(job.workDir, { recursive: true, force: true });
            deleted++;
            this.logger.log(`Deleted failed workspace: ${job.workDir}`);
          } catch (e) {
            this.logger.warn(`Failed to delete workspace ${job.workDir}: ${(e as Error).message}`);
          }
        }
      }

      if (deleted > 0) {
        this.logger.log(`Cleanup complete: removed ${deleted} failed workspace(s).`);
      }
    } catch (e) {
      this.logger.error(`Cleanup error: ${(e as Error).message}`);
    }
  }
}
