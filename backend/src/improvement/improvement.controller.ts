import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ImprovementOrchestrator } from './improvement-orchestrator.service';

@Controller()
export class ImprovementController {
  constructor(private readonly orchestrator: ImprovementOrchestrator) {}

  @Get('repositories/:id/files/:fileId/improvement-jobs')
  async getJobsForFile(@Param('id') repositoryId: string, @Param('fileId') fileId: string) {
    return this.orchestrator.getJobsForFile(repositoryId, fileId);
  }

  @Post('repositories/:id/files/:fileId/improve')
  @HttpCode(HttpStatus.ACCEPTED)
  async improve(@Param('id') repositoryId: string, @Param('fileId') fileId: string) {
    return this.orchestrator.enqueueImprovement(repositoryId, fileId);
  }

  @Delete('improvement-jobs/:jobId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async cancel(@Param('jobId') jobId: string): Promise<void> {
    await this.orchestrator.cancelJob(jobId);
  }
}
