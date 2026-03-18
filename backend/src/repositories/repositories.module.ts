import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RepositoryEntity } from '../infrastructure/persistence/entities/repository.entity';
import { RepositoryRepository } from '../infrastructure/persistence/repositories/repository.repository';
import { RepositoriesService } from './repositories.service';
import { RepositoriesController } from './repositories.controller';

@Module({
  imports: [TypeOrmModule.forFeature([RepositoryEntity])],
  providers: [RepositoryRepository, RepositoriesService],
  controllers: [RepositoriesController],
  exports: [RepositoriesService, RepositoryRepository],
})
export class RepositoriesModule {}
