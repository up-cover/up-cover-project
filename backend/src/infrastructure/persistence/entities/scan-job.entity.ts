import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { ScanStatus } from '../../../domain/enums/scan-status.enum';

@Entity('scan_jobs')
@Index(['repositoryId'])
export class ScanJobEntity {
  @PrimaryColumn({ type: 'text' })
  id: string;

  @Column({ name: 'repository_id', type: 'text' })
  repositoryId: string;

  @Column({ type: 'text' })
  status: ScanStatus;

  @Column({ name: 'work_dir', type: 'text' })
  workDir: string;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ name: 'log_output', type: 'text', default: '' })
  logOutput: string;

  @CreateDateColumn({ name: 'created_at', type: 'text' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'text' })
  updatedAt: Date;
}
