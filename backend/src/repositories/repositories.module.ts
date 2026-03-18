import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RepositoryEntity } from '../infrastructure/persistence/entities/repository.entity';
import { ScanJobEntity } from '../infrastructure/persistence/entities/scan-job.entity';
import { RepositoryRepository } from '../infrastructure/persistence/repositories/repository.repository';
import { ScanJobRepository } from '../infrastructure/persistence/repositories/scan-job.repository';
import { RepositoriesService } from './repositories.service';
import { RepositoriesController } from './repositories.controller';

@Module({
  imports: [TypeOrmModule.forFeature([RepositoryEntity, ScanJobEntity])],
  providers: [RepositoryRepository, ScanJobRepository, RepositoriesService],
  controllers: [RepositoriesController],
  exports: [RepositoriesService, RepositoryRepository],
})
export class RepositoriesModule {}
