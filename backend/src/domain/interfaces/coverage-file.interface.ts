export interface ICoverageFile {
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

export interface ICoverageFileRepository {
  findByRepositoryId(repositoryId: string): Promise<ICoverageFile[]>;
  findByRepositoryIdPaginated(repositoryId: string, skip: number, take: number): Promise<{ items: ICoverageFile[]; total: number }>;
  findById(id: string): Promise<ICoverageFile | null>;
  saveMany(coverageFiles: ICoverageFile[]): Promise<ICoverageFile[]>;
  deleteByRepositoryId(repositoryId: string): Promise<void>;
}
