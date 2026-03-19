import { HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import { RepositoriesService } from './repositories.service';
import { ScanStatus } from '../domain/enums/scan-status.enum';

// @octokit/rest is ESM-only; mock the module so Jest can import the service
jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn().mockImplementation(() => ({
    repos: {
      get: jest.fn(),
      listLanguages: jest.fn(),
    },
  })),
}));

// ---------------------------------------------------------------------------
// Minimal mock factories
// ---------------------------------------------------------------------------

function makeRepo(overrides = {}) {
  return {
    id: 'repo-1',
    owner: 'owner',
    name: 'myrepo',
    url: 'https://github.com/owner/myrepo',
    hasTypeScript: true,
    totalTsFiles: null,
    packageManager: null,
    testFramework: null,
    coverageFramework: null,
    totalCoverage: null,
    avgCoverage: null,
    minCoverage: null,
    scanStatus: ScanStatus.NOT_STARTED,
    scanError: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeOctokit(repoData: object = { permissions: { push: true } }, languages: object = { TypeScript: 5000 }) {
  return {
    repos: {
      get: jest.fn().mockResolvedValue({ data: repoData }),
      listLanguages: jest.fn().mockResolvedValue({ data: languages }),
    },
  };
}

function makeRepoRepository(overrides = {}) {
  return {
    findByOwnerAndName: jest.fn().mockResolvedValue(null),
    findById: jest.fn().mockResolvedValue(null),
    findAll: jest.fn().mockResolvedValue([]),
    save: jest.fn().mockImplementation((r) => Promise.resolve(r)),
    delete: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeScanJobRepository(overrides = {}) {
  return {
    findLatestByRepositoryId: jest.fn().mockResolvedValue(null),
    deleteByRepositoryId: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeCoverageFileRepository(overrides = {}) {
  return {
    findByRepositoryIdPaginated: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    deleteByRepositoryId: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeImprovementJobRepository(overrides = {}) {
  return {
    deleteByRepositoryId: jest.fn().mockResolvedValue(undefined),
  };
}

function makeConfigService(values: Record<string, unknown> = {}) {
  return {
    get: jest.fn((key: string, defaultVal?: unknown) => {
      if (key in values) return values[key];
      return defaultVal;
    }),
  };
}

// ---------------------------------------------------------------------------
// Helper to build a RepositoriesService with all dependencies injectable
// ---------------------------------------------------------------------------

function buildService(overrides: {
  repoRepo?: ReturnType<typeof makeRepoRepository>;
  scanJobRepo?: ReturnType<typeof makeScanJobRepository>;
  coverageFileRepo?: ReturnType<typeof makeCoverageFileRepository>;
  improvementJobRepo?: ReturnType<typeof makeImprovementJobRepository>;
  configValues?: Record<string, unknown>;
  octokitOverrides?: object;
  languagesOverrides?: object;
} = {}) {
  const repoRepo = overrides.repoRepo ?? makeRepoRepository();
  const scanJobRepo = overrides.scanJobRepo ?? makeScanJobRepository();
  const coverageFileRepo = overrides.coverageFileRepo ?? makeCoverageFileRepository();
  const improvementJobRepo = overrides.improvementJobRepo ?? makeImprovementJobRepository();
  const configService = makeConfigService({ GITHUB_TOKEN: 'ghp_test', TS_SIZE_THRESHOLD: 1000, ...overrides.configValues });

  const service = new RepositoriesService(
    repoRepo as any,
    scanJobRepo as any,
    coverageFileRepo as any,
    improvementJobRepo as any,
    configService as any,
  );

  // Replace the internally created Octokit with a mock
  const octokitMock = makeOctokit(
    overrides.octokitOverrides ?? { permissions: { push: true } },
    overrides.languagesOverrides ?? { TypeScript: 5000 },
  );
  (service as any).octokit = octokitMock;

  return { service, repoRepo, scanJobRepo, coverageFileRepo, improvementJobRepo, configService, octokitMock };
}

// ---------------------------------------------------------------------------

describe('RepositoriesService', () => {
  describe('register', () => {
    it('throws CONFLICT when repo already registered', async () => {
      const { service, repoRepo } = buildService();
      repoRepo.findByOwnerAndName.mockResolvedValue(makeRepo());

      await expect(service.register('owner', 'myrepo')).rejects.toThrow(HttpException);
      try {
        await service.register('owner', 'myrepo');
      } catch (e) {
        expect(e instanceof HttpException && e.getStatus()).toBe(HttpStatus.CONFLICT);
        const body = e instanceof HttpException ? (e.getResponse() as any) : null;
        expect(body?.error).toBe('ALREADY_REGISTERED');
      }
    });

    it('throws INVALID_TOKEN when octokit.repos.get returns 401', async () => {
      const { service } = buildService();
      (service as any).octokit.repos.get.mockRejectedValue({ status: 401 });

      await expect(service.register('owner', 'repo')).rejects.toMatchObject({
        response: { error: 'INVALID_TOKEN' },
      });
    });

    it('throws INSUFFICIENT_PERMS when octokit.repos.get returns 403', async () => {
      const { service } = buildService();
      (service as any).octokit.repos.get.mockRejectedValue({ status: 403 });

      await expect(service.register('owner', 'repo')).rejects.toMatchObject({
        response: { error: 'INSUFFICIENT_PERMS' },
      });
    });

    it('throws REPO_NOT_FOUND for other Octokit errors', async () => {
      const { service } = buildService();
      (service as any).octokit.repos.get.mockRejectedValue({ status: 404 });

      await expect(service.register('owner', 'repo')).rejects.toMatchObject({
        response: { error: 'REPO_NOT_FOUND' },
      });
    });

    it('throws INSUFFICIENT_PERMS when repo lacks push permission', async () => {
      const { service } = buildService({ octokitOverrides: { permissions: { push: false } } });

      await expect(service.register('owner', 'repo')).rejects.toMatchObject({
        response: { error: 'INSUFFICIENT_PERMS' },
      });
    });

    it('throws NO_TYPESCRIPT when repo has no TypeScript language', async () => {
      const { service } = buildService({ languagesOverrides: { JavaScript: 5000 } });

      await expect(service.register('owner', 'repo')).rejects.toMatchObject({
        response: { error: 'NO_TYPESCRIPT' },
      });
    });

    it('throws TS_TOO_SMALL when TypeScript bytes < TS_SIZE_THRESHOLD', async () => {
      const { service } = buildService({ languagesOverrides: { TypeScript: 500 } });

      await expect(service.register('owner', 'repo')).rejects.toMatchObject({
        response: { error: 'TS_TOO_SMALL' },
      });
    });

    it('saves and returns the repository on success', async () => {
      const { service, repoRepo } = buildService();
      const saved = makeRepo({ owner: 'owner', name: 'myrepo' });
      repoRepo.save.mockResolvedValue(saved);

      const result = await service.register('owner', 'myrepo');

      expect(repoRepo.save).toHaveBeenCalled();
      expect(result.owner).toBe('owner');
      expect(result.name).toBe('myrepo');
      expect(result.scanStatus).toBe(ScanStatus.NOT_STARTED);
    });

    it('constructs the correct GitHub URL', async () => {
      const { service } = buildService();
      const result = await service.register('foo', 'bar');
      expect(result.url).toBe('https://github.com/foo/bar');
    });
  });

  // ---------------------------------------------------------------------------
  describe('deleteRepository', () => {
    it('throws NotFoundException when repo does not exist', async () => {
      const { service } = buildService();

      await expect(service.deleteRepository('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('deletes all related data and the repo itself', async () => {
      const repo = makeRepo();
      const { service, repoRepo, scanJobRepo, coverageFileRepo, improvementJobRepo } = buildService({
        repoRepo: makeRepoRepository({ findById: jest.fn().mockResolvedValue(repo) }),
      });

      await service.deleteRepository('repo-1');

      expect(coverageFileRepo.deleteByRepositoryId).toHaveBeenCalledWith('repo-1');
      expect(improvementJobRepo.deleteByRepositoryId).toHaveBeenCalledWith('repo-1');
      expect(scanJobRepo.deleteByRepositoryId).toHaveBeenCalledWith('repo-1');
      expect(repoRepo.delete).toHaveBeenCalledWith('repo-1');
    });
  });

  // ---------------------------------------------------------------------------
  describe('findAll', () => {
    it('delegates to repoRepository.findAll', async () => {
      const repos = [makeRepo(), makeRepo({ id: 'repo-2' })];
      const { service, repoRepo } = buildService({
        repoRepo: makeRepoRepository({ findAll: jest.fn().mockResolvedValue(repos) }),
      });

      const result = await service.findAll();

      expect(repoRepo.findAll).toHaveBeenCalled();
      expect(result).toHaveLength(2);
    });
  });

  // ---------------------------------------------------------------------------
  describe('findById', () => {
    it('returns the repository when found', async () => {
      const repo = makeRepo();
      const { service } = buildService({
        repoRepo: makeRepoRepository({ findById: jest.fn().mockResolvedValue(repo) }),
      });

      expect(await service.findById('repo-1')).toBe(repo);
    });

    it('throws NotFoundException when not found', async () => {
      const { service } = buildService();
      await expect(service.findById('missing')).rejects.toThrow(NotFoundException);
    });
  });

  // ---------------------------------------------------------------------------
  describe('getScanLog', () => {
    it('returns empty array when DEBUG_OUTPUT is not "true"', async () => {
      const { service } = buildService({ configValues: { DEBUG_OUTPUT: 'false' } });
      expect(await service.getScanLog('repo-1')).toEqual([]);
    });

    it('returns empty array when no scan job exists', async () => {
      const { service } = buildService({ configValues: { DEBUG_OUTPUT: 'true' } });
      expect(await service.getScanLog('repo-1')).toEqual([]);
    });

    it('splits logOutput by newline and filters empty lines', async () => {
      const { service } = buildService({
        configValues: { DEBUG_OUTPUT: 'true' },
        scanJobRepo: makeScanJobRepository({
          findLatestByRepositoryId: jest.fn().mockResolvedValue({ logOutput: 'line1\nline2\n\nline3\n' }),
        }),
      });

      expect(await service.getScanLog('repo-1')).toEqual(['line1', 'line2', 'line3']);
    });
  });
});
