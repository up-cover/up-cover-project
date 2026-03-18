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

export interface ApiError {
  error: string;
  message: string;
}
