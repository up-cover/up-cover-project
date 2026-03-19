import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ScanStatus } from '../../../domain/enums/scan-status.enum';
import { PackageManager } from '../../../domain/enums/package-manager.enum';
import { TestFramework } from '../../../domain/enums/test-framework.enum';
import { CoverageFramework } from '../../../domain/enums/coverage-framework.enum';

@Entity('repositories')
export class RepositoryEntity {
  @PrimaryColumn({ type: 'text' })
  id: string;

  @Column({ type: 'text' })
  owner: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text' })
  url: string;

  @Column({ name: 'has_typescript', type: 'integer' })
  hasTypeScript: boolean;

  @Column({ name: 'parent_repository_id', type: 'text', nullable: true })
  parentRepositoryId: string | null;

  @Column({ name: 'sub_path', type: 'text', nullable: true })
  subPath: string | null;

  @Column({ name: 'total_ts_files', type: 'integer', nullable: true })
  totalTsFiles: number | null;

  @Column({ name: 'package_manager', type: 'text', nullable: true })
  packageManager: PackageManager | null;

  @Column({ name: 'test_framework', type: 'text', nullable: true })
  testFramework: TestFramework | null;

  @Column({ name: 'coverage_framework', type: 'text', nullable: true })
  coverageFramework: CoverageFramework | null;

  @Column({ name: 'total_coverage', type: 'real', nullable: true })
  totalCoverage: number | null;

  @Column({ name: 'avg_coverage', type: 'real', nullable: true })
  avgCoverage: number | null;

  @Column({ name: 'min_coverage_pct', type: 'real', nullable: true })
  minCoveragePct: number | null;

  @Column({ name: 'min_coverage_file', type: 'text', nullable: true })
  minCoverageFile: string | null;

  @Column({ name: 'scan_status', type: 'text', default: ScanStatus.NOT_STARTED })
  scanStatus: ScanStatus;

  @Column({ name: 'scan_error', type: 'text', nullable: true })
  scanError: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'text' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'text' })
  updatedAt: Date;
}
