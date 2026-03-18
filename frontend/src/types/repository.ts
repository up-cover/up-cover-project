export interface Repository {
  id: string;
  owner: string;
  name: string;
  url: string;
  hasTypeScript: boolean;
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
