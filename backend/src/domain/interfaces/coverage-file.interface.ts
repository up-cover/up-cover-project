export interface ICoverageFile {
  id: string;
  repositoryId: string;
  filePath: string;
  coveragePct: number;
  statements: number;
  branches: number;
  functions: number;
  lines: number;
}

export interface ICoverageFileRepository {
  findByRepositoryId(repositoryId: string): Promise<ICoverageFile[]>;
  findById(id: string): Promise<ICoverageFile | null>;
  saveMany(coverageFiles: ICoverageFile[]): Promise<ICoverageFile[]>;
  deleteByRepositoryId(repositoryId: string): Promise<void>;
}
