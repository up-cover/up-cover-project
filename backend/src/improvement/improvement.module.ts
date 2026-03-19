import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ImprovementController } from './improvement.controller';
import { ImprovementOrchestrator } from './improvement-orchestrator.service';
import { JobQueueService } from './job-queue.service';
import { GitClient } from '../infrastructure/git/git-client';
import { GitHubClient } from '../infrastructure/github/github-client';
import { OllamaClient } from '../infrastructure/ollama/ollama-client';
import { ClaudeClient } from '../infrastructure/llm/claude-client';
import { LLM_CLIENT } from '../infrastructure/llm/llm-client.token';
import { ImprovementJobRepository } from '../infrastructure/persistence/repositories/improvement-job.repository';
import { RepositoryRepository } from '../infrastructure/persistence/repositories/repository.repository';
import { CoverageFileRepository } from '../infrastructure/persistence/repositories/coverage-file.repository';
import { ImprovementJobEntity } from '../infrastructure/persistence/entities/improvement-job.entity';
import { RepositoryEntity } from '../infrastructure/persistence/entities/repository.entity';
import { CoverageFileEntity } from '../infrastructure/persistence/entities/coverage-file.entity';
import { CoverageParser } from '../domain/services/coverage-parser';

@Module({
  imports: [
    TypeOrmModule.forFeature([ImprovementJobEntity, RepositoryEntity, CoverageFileEntity]),
  ],
  controllers: [ImprovementController],
  providers: [
    ImprovementOrchestrator,
    JobQueueService,
    GitClient,
    GitHubClient,
    {
      provide: LLM_CLIENT,
      useFactory: (config: ConfigService) => {
        const provider = config.get<string>('LLM_PROVIDER', 'ollama');
        if (provider === 'claude') return new ClaudeClient(config);
        return new OllamaClient(config);
      },
      inject: [ConfigService],
    },
    ImprovementJobRepository,
    RepositoryRepository,
    CoverageFileRepository,
    CoverageParser,
  ],
  exports: [ImprovementJobRepository],
})
export class ImprovementModule {}
