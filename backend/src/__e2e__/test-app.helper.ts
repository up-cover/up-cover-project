import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { RepositoriesModule } from '../repositories/repositories.module';
import { ScanModule } from '../scan/scan.module';
import { SseModule } from '../sse/sse.module';
import { HealthModule } from '../health/health.module';
import { SseEmitter } from '../sse/sse-emitter.service';
import { GitClient } from '../infrastructure/git/git-client';
import {
  RepositoryEntity,
  ScanJobEntity,
  CoverageFileEntity,
  ImprovementJobEntity,
} from '../infrastructure/persistence/entities';

export const mockOctokitGet = jest.fn();
export const mockOctokitListLanguages = jest.fn();

jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn().mockImplementation(() => ({
    repos: {
      get: mockOctokitGet,
      listLanguages: mockOctokitListLanguages,
    },
  })),
}));

const mockSseEmitter = {
  emit: jest.fn(),
  subscribe: jest.fn(),
  unsubscribe: jest.fn(),
};

const mockGitClient = {
  clone: jest.fn().mockResolvedValue(undefined),
  createBranch: jest.fn().mockResolvedValue(undefined),
  remoteBranchExists: jest.fn().mockResolvedValue(false),
  addFile: jest.fn().mockResolvedValue(undefined),
  commit: jest.fn().mockResolvedValue(undefined),
  push: jest.fn().mockResolvedValue(undefined),
};

/**
 * Build a NestJS test application with in-memory SQLite and all external
 * dependencies (Octokit, GitClient, SseEmitter, ScanOrchestrator background
 * execution) mocked so tests are fully self-contained.
 */
export async function createTestApp(): Promise<INestApplication> {
  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        load: [
          () => ({
            GITHUB_TOKEN: 'test-token',
            TS_SIZE_THRESHOLD: 1000,
            CLONE_DIR: '/tmp/upcover-e2e-workspaces',
            DEBUG_OUTPUT: 'false',
          }),
        ],
      }),
      ScheduleModule.forRoot(),
      TypeOrmModule.forRoot({
        type: 'better-sqlite3',
        database: ':memory:',
        synchronize: true,
        dropSchema: true,
        entities: [RepositoryEntity, ScanJobEntity, CoverageFileEntity, ImprovementJobEntity],
      }),
      SseModule,
      RepositoriesModule,
      ScanModule,
      HealthModule,
    ],
  })
    .overrideProvider(SseEmitter)
    .useValue(mockSseEmitter)
    .overrideProvider(GitClient)
    .useValue(mockGitClient)
    .compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  await app.init();
  return app;
}

export function resetMocks() {
  jest.clearAllMocks();
  // Restore default successful GitHub responses
  mockOctokitGet.mockResolvedValue({ data: { permissions: { push: true } } });
  mockOctokitListLanguages.mockResolvedValue({ data: { TypeScript: 5000 } });
}
