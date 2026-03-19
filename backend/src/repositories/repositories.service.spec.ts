import { HttpException, NotFoundException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RepositoriesService } from './repositories.service';
import { RepositoryRepository } from '../infrastructure/persistence/repositories/repository.repository';
import { ScanJobRepository } from '../infrastructure/persistence/repositories/scan-job.repository';
import { CoverageFileRepository } from '../infrastructure/persistence/repositories/coverage-file.repository';
import { ImprovementJobRepository } from '../infrastructure/persistence/repositories/improvement-job.repository';
import { ScanStatus } from '../domain/enums/scan-status.enum';

// Mock Octokit at module level so the constructor call doesn't fail
const mockOctokitGet = jest.fn();
const mockOctokitListLanguages = jest.fn();

jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn().mockImplementation(() => ({
    repos: {
      get: mockOctokitGet,
      listLanguages: mockOctokitListLanguages,
    },
  })),
}));

interface RepoOverrides {
  scanStatus?: ScanStatus;
  [key: string]: unknown;
}

function makeRepo(overrides: RepoOverrides = {}) {
  return {
    id: 'repo-1',
    owner: 'acme',
    name: 'myrepo',
    url: 'https://github.com/acme/myrepo',
    hasTypeScript: true,
    parentRepositoryId: null,
    subPath: null,
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

describe('RepositoriesService', () => {
  let service: RepositoriesService;
  let repoRepository: jest.Mocked<RepositoryRepository>;
  let scanJobRepository: jest.Mocked<ScanJobRepository>;
  let coverageFileRepository: jest.Mocked<CoverageFileRepository>;
  let improvementJobRepository: jest.Mocked<ImprovementJobRepository>;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(() => {
    repoRepository = {
      findByOwnerAndName: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      findByParentRepositoryId: jest.fn().mockResolvedValue([]),
      save: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    } as any;

    scanJobRepository = {
      findLatestByRepositoryId: jest.fn(),
      findByRepositoryId: jest.fn(),
      deleteByRepositoryId: jest.fn(),
    } as any;

    coverageFileRepository = {
      findByRepositoryIdPaginated: jest.fn(),
      deleteByRepositoryId: jest.fn(),
    } as any;

    improvementJobRepository = {
      findByRepositoryId: jest.fn().mockResolvedValue([]),
      delete: jest.fn(),
    } as any;

    configService = {
      get: jest.fn().mockImplementation((key: string, defaultVal?: unknown) => {
        if (key === 'GITHUB_TOKEN') return 'fake-token';
        if (key === 'TS_SIZE_THRESHOLD') return 1000;
        if (key === 'DEBUG_OUTPUT') return 'false';
        return defaultVal;
      }),
    } as any;

    service = new RepositoriesService(
      repoRepository,
      scanJobRepository,
      coverageFileRepository,
      improvementJobRepository,
      configService,
    );

    // Default: successful GitHub responses
    mockOctokitGet.mockResolvedValue({ data: { permissions: { push: true } } });
    mockOctokitListLanguages.mockResolvedValue({ data: { TypeScript: 5000 } });
    repoRepository.findByOwnerAndName.mockResolvedValue(null);
    repoRepository.save.mockImplementation(async (repo) => repo);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // --- register ---

  describe('register', () => {
    it('throws ALREADY_REGISTERED when repo already exists', async () => {
      repoRepository.findByOwnerAndName.mockResolvedValue(makeRepo());
      await expect(service.register('acme', 'myrepo')).rejects.toThrow(HttpException);
      const err = await service.register('acme', 'myrepo').catch((e) => e) as HttpException;
      expect(err.getResponse()).toMatchObject({ error: 'ALREADY_REGISTERED' });
    });

    it('throws INVALID_TOKEN when GitHub returns 401', async () => {
      mockOctokitGet.mockRejectedValue({ status: 401 });
      await expect(service.register('acme', 'myrepo')).rejects.toMatchObject({
        response: { error: 'INVALID_TOKEN' },
      });
    });

    it('throws INSUFFICIENT_PERMS when GitHub returns 403', async () => {
      mockOctokitGet.mockRejectedValue({ status: 403 });
      await expect(service.register('acme', 'myrepo')).rejects.toMatchObject({
        response: { error: 'INSUFFICIENT_PERMS' },
      });
    });

    it('throws REPO_NOT_FOUND when GitHub returns another error', async () => {
      mockOctokitGet.mockRejectedValue({ status: 404 });
      await expect(service.register('acme', 'myrepo')).rejects.toMatchObject({
        response: { error: 'REPO_NOT_FOUND' },
      });
    });

    it('throws INSUFFICIENT_PERMS when push permission is false', async () => {
      mockOctokitGet.mockResolvedValue({ data: { permissions: { push: false } } });
      await expect(service.register('acme', 'myrepo')).rejects.toMatchObject({
        response: { error: 'INSUFFICIENT_PERMS' },
      });
    });

    it('throws NO_TYPESCRIPT when languages has no TypeScript key', async () => {
      mockOctokitListLanguages.mockResolvedValue({ data: { JavaScript: 10000 } });
      await expect(service.register('acme', 'myrepo')).rejects.toMatchObject({
        response: { error: 'NO_TYPESCRIPT' },
      });
    });

    it('throws TS_TOO_SMALL when TypeScript bytes below threshold', async () => {
      mockOctokitListLanguages.mockResolvedValue({ data: { TypeScript: 100 } });
      await expect(service.register('acme', 'myrepo')).rejects.toMatchObject({
        response: { error: 'TS_TOO_SMALL' },
      });
    });

    it('saves and returns a new IRepository on success', async () => {
      const result = await service.register('acme', 'myrepo');
      expect(result.owner).toBe('acme');
      expect(result.name).toBe('myrepo');
      expect(result.url).toBe('https://github.com/acme/myrepo');
      expect(result.scanStatus).toBe(ScanStatus.NOT_STARTED);
      expect(repoRepository.save).toHaveBeenCalledTimes(1);
    });

    it('generates a UUID for the new repository id', async () => {
      const result = await service.register('acme', 'myrepo');
      expect(result.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    });
  });

  // --- findAll ---

  describe('findAll', () => {
    it('delegates to repoRepository.findAll and returns results', async () => {
      const repos = [makeRepo()];
      repoRepository.findAll.mockResolvedValue(repos);
      const result = await service.findAll();
      expect(result).toBe(repos);
      expect(repoRepository.findAll).toHaveBeenCalledTimes(1);
    });
  });

  // --- findById ---

  describe('findById', () => {
    it('returns the repository when found', async () => {
      const repo = makeRepo();
      repoRepository.findById.mockResolvedValue(repo);
      const result = await service.findById('repo-1');
      expect(result).toBe(repo);
    });

    it('throws NotFoundException when not found', async () => {
      repoRepository.findById.mockResolvedValue(null);
      await expect(service.findById('missing')).rejects.toThrow(NotFoundException);
    });
  });

  // --- delete ---

  describe('delete', () => {
    it('throws NotFoundException when repo does not exist', async () => {
      repoRepository.findById.mockResolvedValue(null);
      await expect(service.delete('missing')).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when scan is in progress', async () => {
      repoRepository.findById.mockResolvedValue(makeRepo({ scanStatus: ScanStatus.CLONING }));
      await expect(service.delete('repo-1')).rejects.toThrow(ConflictException);
    });

    it('calls deleteByRepositoryId on scan and coverage repos, and delete on repo', async () => {
      repoRepository.findById.mockResolvedValue(makeRepo());
      scanJobRepository.findByRepositoryId.mockResolvedValue([]);
      improvementJobRepository.findByRepositoryId.mockResolvedValue([]);

      await service.delete('repo-1');

      expect(scanJobRepository.deleteByRepositoryId).toHaveBeenCalledWith('repo-1');
      expect(coverageFileRepository.deleteByRepositoryId).toHaveBeenCalledWith('repo-1');
      expect(repoRepository.delete).toHaveBeenCalledWith('repo-1');
    });
  });
});
