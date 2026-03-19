import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ImprovementJobEntity } from '../entities/improvement-job.entity';
import { IImprovementJob, IImprovementJobRepository } from '../../../domain/interfaces';

@Injectable()
export class ImprovementJobRepository implements IImprovementJobRepository {
  constructor(
    @InjectRepository(ImprovementJobEntity)
    private readonly orm: Repository<ImprovementJobEntity>,
  ) {}

  async findById(id: string): Promise<IImprovementJob | null> {
    const entity = await this.orm.findOneBy({ id });
    return entity ? this.toDomain(entity) : null;
  }

  async findByRepositoryId(repositoryId: string): Promise<IImprovementJob[]> {
    const entities = await this.orm.find({
      where: { repositoryId },
      order: { createdAt: 'DESC' },
    });
    return entities.map((e) => this.toDomain(e));
  }

  async findByRepositoryIdAndFilePath(
    repositoryId: string,
    filePath: string,
  ): Promise<IImprovementJob[]> {
    const entities = await this.orm.find({
      where: { repositoryId, filePath },
      order: { createdAt: 'DESC' },
    });
    return entities.map((e) => this.toDomain(e));
  }

  async save(job: IImprovementJob): Promise<IImprovementJob> {
    const saved = await this.orm.save(this.toEntity(job));
    return this.toDomain(saved);
  }

  async update(id: string, partial: Partial<IImprovementJob>): Promise<IImprovementJob> {
    const entity = await this.orm.findOneByOrFail({ id });
    if (partial.status !== undefined) entity.status = partial.status;
    if (partial.workDir !== undefined) entity.workDir = partial.workDir;
    if (partial.branchName !== undefined) entity.branchName = partial.branchName;
    if (partial.prUrl !== undefined) entity.prUrl = partial.prUrl;
    if (partial.errorMessage !== undefined) entity.errorMessage = partial.errorMessage;
    if (partial.logOutput !== undefined) entity.logOutput = partial.logOutput;
    if (partial.testsPass !== undefined) entity.testsPass = partial.testsPass;
    if (partial.coverageBeforePct !== undefined) entity.coverageBeforePct = partial.coverageBeforePct;
    if (partial.coverageAfterPct !== undefined) entity.coverageAfterPct = partial.coverageAfterPct;
    if (partial.coverageDeltaPct !== undefined) entity.coverageDeltaPct = partial.coverageDeltaPct;
    const saved = await this.orm.save(entity);
    return this.toDomain(saved);
  }

  async delete(id: string): Promise<void> {
    await this.orm.delete({ id });
  }

  private toDomain(entity: ImprovementJobEntity): IImprovementJob {
    return {
      id: entity.id,
      repositoryId: entity.repositoryId,
      filePath: entity.filePath,
      status: entity.status,
      workDir: entity.workDir,
      branchName: entity.branchName,
      prUrl: entity.prUrl,
      errorMessage: entity.errorMessage,
      logOutput: entity.logOutput,
      testsPass: entity.testsPass,
      coverageBeforePct: entity.coverageBeforePct,
      coverageAfterPct: entity.coverageAfterPct,
      coverageDeltaPct: entity.coverageDeltaPct,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  private toEntity(domain: IImprovementJob): ImprovementJobEntity {
    const entity = new ImprovementJobEntity();
    entity.id = domain.id;
    entity.repositoryId = domain.repositoryId;
    entity.filePath = domain.filePath;
    entity.status = domain.status;
    entity.workDir = domain.workDir;
    entity.branchName = domain.branchName;
    entity.prUrl = domain.prUrl;
    entity.errorMessage = domain.errorMessage;
    entity.logOutput = domain.logOutput;
    entity.testsPass = domain.testsPass;
    entity.coverageBeforePct = domain.coverageBeforePct;
    entity.coverageAfterPct = domain.coverageAfterPct;
    entity.coverageDeltaPct = domain.coverageDeltaPct;
    return entity;
  }
}
