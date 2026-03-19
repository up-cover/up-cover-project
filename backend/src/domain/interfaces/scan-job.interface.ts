import { ScanStatus } from '../enums/scan-status.enum';

export interface IScanJob {
  id: string;
  repositoryId: string;
  status: ScanStatus;
  workDir: string;
  errorMessage: string | null;
  logOutput: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IScanJobRepository {
  findById(id: string): Promise<IScanJob | null>;
  findByRepositoryId(repositoryId: string): Promise<IScanJob[]>;
  findLatestByRepositoryId(repositoryId: string): Promise<IScanJob | null>;
  save(scanJob: IScanJob): Promise<IScanJob>;
  update(id: string, partial: Partial<IScanJob>): Promise<IScanJob>;
  deleteByRepositoryId(repositoryId: string): Promise<void>;
}
