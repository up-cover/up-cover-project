import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { ImprovementStatus } from '../../../domain/enums/improvement-status.enum';

@Entity('improvement_jobs')
@Index(['repositoryId', 'filePath'])
export class ImprovementJobEntity {
  @PrimaryColumn({ type: 'text' })
  id: string;

  @Column({ name: 'repository_id', type: 'text' })
  repositoryId: string;

  @Column({ name: 'file_path', type: 'text' })
  filePath: string;

  @Column({ type: 'text' })
  status: ImprovementStatus;

  @Column({ name: 'work_dir', type: 'text' })
  workDir: string;

  @Column({ name: 'branch_name', type: 'text' })
  branchName: string;

  @Column({ name: 'pr_url', type: 'text', nullable: true })
  prUrl: string | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ name: 'log_output', type: 'text', default: '' })
  logOutput: string;

  @Column({ name: 'tests_pass', type: 'integer', nullable: true })
  testsPass: boolean | null;

  @Column({ name: 'coverage_before_pct', type: 'real', nullable: true })
  coverageBeforePct: number | null;

  @Column({ name: 'coverage_after_pct', type: 'real', nullable: true })
  coverageAfterPct: number | null;

  @Column({ name: 'coverage_delta_pct', type: 'real', nullable: true })
  coverageDeltaPct: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'text' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'text' })
  updatedAt: Date;
}
