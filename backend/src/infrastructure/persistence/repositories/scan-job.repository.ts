import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ScanJobEntity } from '../entities/scan-job.entity';
import { IScanJob, IScanJobRepository } from '../../../domain/interfaces';

@Injectable()
export class ScanJobRepository implements IScanJobRepository {
  constructor(
    @InjectRepository(ScanJobEntity)
    private readonly orm: Repository<ScanJobEntity>,
  ) {}

  async findById(id: string): Promise<IScanJob | null> {
    const entity = await this.orm.findOneBy({ id });
    return entity ? this.toDomain(entity) : null;
  }

  async findByRepositoryId(repositoryId: string): Promise<IScanJob[]> {
    const entities = await this.orm.find({
      where: { repositoryId },
      order: { createdAt: 'DESC' },
    });
    return entities.map(this.toDomain);
  }

  async findLatestByRepositoryId(repositoryId: string): Promise<IScanJob | null> {
    const entity = await this.orm.findOne({
      where: { repositoryId },
      order: { createdAt: 'DESC' },
    });
    return entity ? this.toDomain(entity) : null;
  }

  async findAllFailed(): Promise<IScanJob[]> {
    const { ScanStatus } = await import('../../../domain/enums/scan-status.enum');
    const entities = await this.orm.find({ where: { status: ScanStatus.FAILED } });
    return entities.map(this.toDomain);
  }

  async save(scanJob: IScanJob): Promise<IScanJob> {
    const entity = this.toEntity(scanJob);
    const saved = await this.orm.save(entity);
    return this.toDomain(saved);
  }

  async update(id: string, partial: Partial<IScanJob>): Promise<IScanJob> {
    const entity = await this.orm.findOneByOrFail({ id });
    if (partial.status !== undefined) entity.status = partial.status;
    if (partial.workDir !== undefined) entity.workDir = partial.workDir;
    if (partial.errorMessage !== undefined) entity.errorMessage = partial.errorMessage;
    if (partial.logOutput !== undefined) entity.logOutput = partial.logOutput;
    const saved = await this.orm.save(entity);
    return this.toDomain(saved);
  }

  private toDomain(entity: ScanJobEntity): IScanJob {
    return {
      id: entity.id,
      repositoryId: entity.repositoryId,
      status: entity.status,
      workDir: entity.workDir,
      errorMessage: entity.errorMessage,
      logOutput: entity.logOutput,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  private toEntity(domain: IScanJob): ScanJobEntity {
    const entity = new ScanJobEntity();
    entity.id = domain.id;
    entity.repositoryId = domain.repositoryId;
    entity.status = domain.status;
    entity.workDir = domain.workDir;
    entity.errorMessage = domain.errorMessage;
    entity.logOutput = domain.logOutput;
    return entity;
  }
}
