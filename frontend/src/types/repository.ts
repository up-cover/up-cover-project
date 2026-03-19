export interface Repository {
  id: string;
  owner: string;
  name: string;
  url: string;
  hasTypeScript: boolean;
  parentRepositoryId: string | null;
  subPath: string | null;
  totalTsFiles: number | null;
  packageManager: 'npm' | 'yarn' | 'pnpm' | null;
  testFramework: 'jest' | 'vitest' | null;
  coverageFramework: 'istanbul' | 'v8' | null;
  totalCoverage: number | null;
  avgCoverage: number | null;
  minCoverage: { pct: number; filePath: string } | null;
  scanStatus:
    | 'NOT_STARTED'
    | 'CLONING'
    | 'SCANNING'
    | 'INSTALLING'
    | 'TESTING'
    | 'COMPLETE'
    | 'FAILED';
  scanError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CoverageFile {
  id: string;
  repositoryId: string;
  filePath: string;
  coveragePct: number;
  statements: number;
  branches: number;
  functions: number;
  lines: number;
  fileSizeKb: number | null;
}

export interface CoverageFilesPage {
  items: CoverageFile[];
  total: number;
  page: number;
  limit: number;
}

export interface ApiError {
  error: string;
  message: string;
}

export type ImprovementStatus =
  | 'QUEUED'
  | 'CLONING'
  | 'GENERATING'
  | 'TESTING'
  | 'PUSHING'
  | 'CREATING_PR'
  | 'COMPLETE'
  | 'FAILED'
  | 'CANCELLED';

export interface ImprovementJob {
  id: string;
  repositoryId: string;
  filePath: string;
  status: ImprovementStatus;
  branchName: string | null;
  prUrl: string | null;
  errorMessage: string | null;
  logOutput: string;
  testsPass: boolean | null;
  newCoveragePct: number | null;
  createdAt: string;
  updatedAt: string;
}
