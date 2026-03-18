import { Controller, Post, Param, HttpCode } from '@nestjs/common';
import { ScanOrchestrator } from './scan-orchestrator.service';

@Controller('repositories')
export class ScanController {
  constructor(private readonly scanOrchestrator: ScanOrchestrator) {}

  @Post(':id/scan')
  @HttpCode(202)
  async startScan(@Param('id') id: string) {
    const scanJob = await this.scanOrchestrator.startScan(id);
    return { scanJobId: scanJob.id, status: scanJob.status, workDir: scanJob.workDir };
  }
}
