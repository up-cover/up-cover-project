import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CoverageFileEntity } from '../entities/coverage-file.entity';
import { ICoverageFile, ICoverageFileRepository } from '../../../domain/interfaces';

@Injectable()
export class CoverageFileRepository implements ICoverageFileRepository {
  constructor(
    @InjectRepository(CoverageFileEntity)
    private readonly orm: Repository<CoverageFileEntity>,
  ) {}

  async findByRepositoryId(repositoryId: string): Promise<ICoverageFile[]> {
    const entities = await this.orm.find({ where: { repositoryId } });
    return entities.map(this.toDomain);
  }

  async findById(id: string): Promise<ICoverageFile | null> {
    const entity = await this.orm.findOneBy({ id });
    return entity ? this.toDomain(entity) : null;
  }

  async saveMany(coverageFiles: ICoverageFile[]): Promise<ICoverageFile[]> {
    const entities = coverageFiles.map(this.toEntity);
    const saved = await this.orm.save(entities);
    return saved.map(this.toDomain);
  }

  async deleteByRepositoryId(repositoryId: string): Promise<void> {
    await this.orm.delete({ repositoryId });
  }

  private toDomain(entity: CoverageFileEntity): ICoverageFile {
    return {
      id: entity.id,
      repositoryId: entity.repositoryId,
      filePath: entity.filePath,
      coveragePct: entity.coveragePct,
      statements: entity.statements,
      branches: entity.branches,
      functions: entity.functions,
      lines: entity.lines,
    };
  }

  private toEntity(domain: ICoverageFile): CoverageFileEntity {
    const entity = new CoverageFileEntity();
    entity.id = domain.id;
    entity.repositoryId = domain.repositoryId;
    entity.filePath = domain.filePath;
    entity.coveragePct = domain.coveragePct;
    entity.statements = domain.statements;
    entity.branches = domain.branches;
    entity.functions = domain.functions;
    entity.lines = domain.lines;
    return entity;
  }
}
