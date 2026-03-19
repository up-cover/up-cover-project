import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RepositoryEntity } from '../infrastructure/persistence/entities/repository.entity';
import { ScanJobEntity } from '../infrastructure/persistence/entities/scan-job.entity';
import { CoverageFileEntity } from '../infrastructure/persistence/entities/coverage-file.entity';
import { ImprovementJobEntity } from '../infrastructure/persistence/entities/improvement-job.entity';
import { RepositoryRepository } from '../infrastructure/persistence/repositories/repository.repository';
import { ScanJobRepository } from '../infrastructure/persistence/repositories/scan-job.repository';
import { CoverageFileRepository } from '../infrastructure/persistence/repositories/coverage-file.repository';
import { ImprovementJobRepository } from '../infrastructure/persistence/repositories/improvement-job.repository';
import { RepositoriesService } from './repositories.service';
import { RepositoriesController } from './repositories.controller';

@Module({
  imports: [TypeOrmModule.forFeature([RepositoryEntity, ScanJobEntity, CoverageFileEntity, ImprovementJobEntity])],
  providers: [RepositoryRepository, ScanJobRepository, CoverageFileRepository, ImprovementJobRepository, RepositoriesService],
  controllers: [RepositoriesController],
  exports: [RepositoriesService, RepositoryRepository, CoverageFileRepository],
})
export class RepositoriesModule {}
