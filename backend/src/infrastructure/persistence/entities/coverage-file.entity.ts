import { Entity, PrimaryColumn, Column, Index } from 'typeorm';

@Entity('coverage_files')
@Index(['repositoryId'])
export class CoverageFileEntity {
  @PrimaryColumn({ type: 'text' })
  id: string;

  @Column({ name: 'repository_id', type: 'text' })
  repositoryId: string;

  @Column({ name: 'file_path', type: 'text' })
  filePath: string;

  @Column({ name: 'coverage_pct', type: 'real' })
  coveragePct: number;

  @Column({ type: 'real' })
  statements: number;

  @Column({ type: 'real' })
  branches: number;

  @Column({ type: 'real' })
  functions: number;

  @Column({ type: 'real' })
  lines: number;
}
