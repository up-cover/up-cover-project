import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { RepositoryEntity } from '../entities/repository.entity';
import {
  IRepository,
  IRepositoryRepository,
  MinCoverage,
} from '../../../domain/interfaces';
import { ScanStatus } from '../../../domain/enums/scan-status.enum';

@Injectable()
export class RepositoryRepository implements IRepositoryRepository {
  constructor(
    @InjectRepository(RepositoryEntity)
    private readonly orm: Repository<RepositoryEntity>,
  ) {}

  async findAll(): Promise<IRepository[]> {
    const entities = await this.orm.find({ order: { createdAt: 'DESC' } });
    return entities.map(this.toDomain);
  }

  async findAllInProgress(): Promise<IRepository[]> {
    const entities = await this.orm.find({
      where: {
        scanStatus: In([ScanStatus.CLONING, ScanStatus.SCANNING, ScanStatus.INSTALLING, ScanStatus.TESTING]),
      },
    });
    return entities.map(this.toDomain);
  }

  async findById(id: string): Promise<IRepository | null> {
    const entity = await this.orm.findOneBy({ id });
    return entity ? this.toDomain(entity) : null;
  }

  async findByOwnerAndName(owner: string, name: string): Promise<IRepository | null> {
    const entity = await this.orm.findOneBy({ owner, name });
    return entity ? this.toDomain(entity) : null;
  }

  async findByParentRepositoryId(parentId: string): Promise<IRepository[]> {
    const entities = await this.orm.findBy({ parentRepositoryId: parentId });
    return entities.map(this.toDomain);
  }

  async save(repository: IRepository): Promise<IRepository> {
    const entity = this.toEntity(repository);
    const saved = await this.orm.save(entity);
    return this.toDomain(saved);
  }

  async delete(id: string): Promise<void> {
    await this.orm.delete({ id });
  }

  async update(id: string, partial: Partial<IRepository>): Promise<IRepository> {
    const entity = await this.orm.findOneByOrFail({ id });
    const updated = this.applyPartial(entity, partial);
    const saved = await this.orm.save(updated);
    return this.toDomain(saved);
  }

  private toDomain(entity: RepositoryEntity): IRepository {
    const minCoverage: MinCoverage | null =
      entity.minCoveragePct !== null && entity.minCoverageFile !== null
        ? { pct: entity.minCoveragePct, filePath: entity.minCoverageFile }
        : null;

    return {
      id: entity.id,
      owner: entity.owner,
      name: entity.name,
      url: entity.url,
      hasTypeScript: entity.hasTypeScript,
      parentRepositoryId: entity.parentRepositoryId,
      subPath: entity.subPath,
      totalTsFiles: entity.totalTsFiles,
      packageManager: entity.packageManager,
      testFramework: entity.testFramework,
      coverageFramework: entity.coverageFramework,
      totalCoverage: entity.totalCoverage,
      avgCoverage: entity.avgCoverage,
      minCoverage,
      scanStatus: entity.scanStatus,
      scanError: entity.scanError,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  private toEntity(domain: IRepository): RepositoryEntity {
    const entity = new RepositoryEntity();
    entity.id = domain.id;
    entity.owner = domain.owner;
    entity.name = domain.name;
    entity.url = domain.url;
    entity.hasTypeScript = domain.hasTypeScript;
    entity.parentRepositoryId = domain.parentRepositoryId;
    entity.subPath = domain.subPath;
    entity.totalTsFiles = domain.totalTsFiles;
    entity.packageManager = domain.packageManager;
    entity.testFramework = domain.testFramework;
    entity.coverageFramework = domain.coverageFramework;
    entity.totalCoverage = domain.totalCoverage;
    entity.avgCoverage = domain.avgCoverage;
    entity.minCoveragePct = domain.minCoverage?.pct ?? null;
    entity.minCoverageFile = domain.minCoverage?.filePath ?? null;
    entity.scanStatus = domain.scanStatus;
    entity.scanError = domain.scanError;
    return entity;
  }

  private applyPartial(
    entity: RepositoryEntity,
    partial: Partial<IRepository>,
  ): RepositoryEntity {
    if (partial.parentRepositoryId !== undefined) entity.parentRepositoryId = partial.parentRepositoryId;
    if (partial.subPath !== undefined) entity.subPath = partial.subPath;
    if (partial.totalTsFiles !== undefined) entity.totalTsFiles = partial.totalTsFiles;
    if (partial.packageManager !== undefined) entity.packageManager = partial.packageManager;
    if (partial.testFramework !== undefined) entity.testFramework = partial.testFramework;
    if (partial.coverageFramework !== undefined) entity.coverageFramework = partial.coverageFramework;
    if (partial.totalCoverage !== undefined) entity.totalCoverage = partial.totalCoverage;
    if (partial.avgCoverage !== undefined) entity.avgCoverage = partial.avgCoverage;
    if (partial.minCoverage !== undefined) {
      entity.minCoveragePct = partial.minCoverage?.pct ?? null;
      entity.minCoverageFile = partial.minCoverage?.filePath ?? null;
    }
    if (partial.scanStatus !== undefined) entity.scanStatus = partial.scanStatus;
    if (partial.scanError !== undefined) entity.scanError = partial.scanError;
    return entity;
  }
}
