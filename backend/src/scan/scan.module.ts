import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScanController } from './scan.controller';
import { ScanOrchestrator } from './scan-orchestrator.service';
import { CleanupService } from './cleanup.service';
import { GitClient } from '../infrastructure/git/git-client';
import { FrameworkDetector } from '../domain/services/framework-detector';
import { CoverageParser } from '../domain/services/coverage-parser';
import { RepositoryRepository } from '../infrastructure/persistence/repositories/repository.repository';
import { ScanJobRepository } from '../infrastructure/persistence/repositories/scan-job.repository';
import { CoverageFileRepository } from '../infrastructure/persistence/repositories/coverage-file.repository';
import { RepositoryEntity } from '../infrastructure/persistence/entities/repository.entity';
import { ScanJobEntity } from '../infrastructure/persistence/entities/scan-job.entity';
import { CoverageFileEntity } from '../infrastructure/persistence/entities/coverage-file.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([RepositoryEntity, ScanJobEntity, CoverageFileEntity]),
  ],
  controllers: [ScanController],
  providers: [
    ScanOrchestrator,
    CleanupService,
    GitClient,
    FrameworkDetector,
    CoverageParser,
    RepositoryRepository,
    ScanJobRepository,
    CoverageFileRepository,
  ],
  exports: [ScanJobRepository, CoverageFileRepository],
})
export class ScanModule {}
