import { ScanStatus } from '../enums/scan-status.enum';
import { PackageManager } from '../enums/package-manager.enum';
import { TestFramework } from '../enums/test-framework.enum';
import { CoverageFramework } from '../enums/coverage-framework.enum';

export interface MinCoverage {
  pct: number;
  filePath: string;
}

export interface IRepository {
  id: string;
  owner: string;
  name: string;
  url: string;
  hasTypeScript: boolean;
  parentRepositoryId: string | null;
  subPath: string | null;
  totalTsFiles: number | null;
  packageManager: PackageManager | null;
  testFramework: TestFramework | null;
  coverageFramework: CoverageFramework | null;
  totalCoverage: number | null;
  avgCoverage: number | null;
  minCoverage: MinCoverage | null;
  scanStatus: ScanStatus;
  scanError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IRepositoryRepository {
  findAll(): Promise<IRepository[]>;
  findAllInProgress(): Promise<IRepository[]>;
  findById(id: string): Promise<IRepository | null>;
  findByOwnerAndName(owner: string, name: string): Promise<IRepository | null>;
  findByParentRepositoryId(parentId: string): Promise<IRepository[]>;
  save(repository: IRepository): Promise<IRepository>;
  update(id: string, partial: Partial<IRepository>): Promise<IRepository>;
  delete(id: string): Promise<void>;
}
