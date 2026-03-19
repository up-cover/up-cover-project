import { ImprovementStatus } from '../enums/improvement-status.enum';

export interface IImprovementJob {
  id: string;
  repositoryId: string;
  filePath: string;
  status: ImprovementStatus;
  workDir: string;
  branchName: string;
  prUrl: string | null;
  errorMessage: string | null;
  logOutput: string;
  testsPass: boolean | null;
  coverageBeforePct: number | null;
  coverageAfterPct: number | null;
  coverageDeltaPct: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IImprovementJobRepository {
  findById(id: string): Promise<IImprovementJob | null>;
  findByRepositoryId(repositoryId: string): Promise<IImprovementJob[]>;
  findByRepositoryIdAndFilePath(repositoryId: string, filePath: string): Promise<IImprovementJob[]>;
  save(job: IImprovementJob): Promise<IImprovementJob>;
  update(id: string, partial: Partial<IImprovementJob>): Promise<IImprovementJob>;
  delete(id: string): Promise<void>;
  deleteByRepositoryId(repositoryId: string): Promise<void>;
}
