import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Octokit } from '@octokit/rest';
import { randomUUID } from 'crypto';
import { RepositoryRepository } from '../infrastructure/persistence/repositories/repository.repository';
import { IRepository } from '../domain/interfaces';
import { ScanStatus } from '../domain/enums/scan-status.enum';

@Injectable()
export class RepositoriesService {
  private readonly octokit: Octokit;
  private readonly tsSizeThreshold: number;

  constructor(
    private readonly repoRepository: RepositoryRepository,
    private readonly configService: ConfigService,
  ) {
    const token = this.configService.get<string>('GITHUB_TOKEN');
    this.octokit = new Octokit({ auth: token });
    this.tsSizeThreshold = this.configService.get<number>('TS_SIZE_THRESHOLD', 1000);
  }

  async register(owner: string, repo: string): Promise<IRepository> {
    // Duplicate check
    const existing = await this.repoRepository.findByOwnerAndName(owner, repo);
    if (existing) {
      throw new HttpException(
        { error: 'ALREADY_REGISTERED', message: 'This repository has already been added.' },
        HttpStatus.CONFLICT,
      );
    }

    // GitHub PAT + repo access check
    let repoData: Awaited<ReturnType<typeof this.octokit.repos.get>>['data'];
    try {
      const response = await this.octokit.repos.get({ owner, repo });
      repoData = response.data;
    } catch (err: unknown) {
      const status =
        typeof err === 'object' && err !== null && 'status' in err ? err.status : undefined;
      if (status === 401) {
        throw new HttpException(
          { error: 'INVALID_TOKEN', message: 'The configured GitHub token is invalid or expired.' },
          HttpStatus.BAD_REQUEST,
        );
      }
      if (status === 403) {
        throw new HttpException(
          {
            error: 'INSUFFICIENT_PERMS',
            message: `Token lacks required permissions. Ensure the token has \`repo\` scope.`,
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      throw new HttpException(
        { error: 'REPO_NOT_FOUND', message: 'Repository not found or not accessible with the configured token.' },
        HttpStatus.BAD_REQUEST,
      );
    }

    // Permission check: need push access to create branches and PRs
    const permissions = repoData.permissions;
    if (!permissions?.push) {
      const missing = ['push'];
      throw new HttpException(
        {
          error: 'INSUFFICIENT_PERMS',
          message: `Token lacks required permissions: ${missing.join(', ')}. Ensure the token has \`repo\` scope.`,
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    // Languages check
    let languages: Record<string, number>;
    try {
      const response = await this.octokit.repos.listLanguages({ owner, repo });
      languages = response.data;
    } catch {
      languages = {};
    }

    if (!languages['TypeScript']) {
      throw new HttpException(
        { error: 'NO_TYPESCRIPT', message: 'This repository contains no TypeScript files.' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const tsBytes = languages['TypeScript'];
    if (tsBytes < this.tsSizeThreshold) {
      throw new HttpException(
        {
          error: 'TS_TOO_SMALL',
          message: `Repository TypeScript codebase is too small (< ${this.tsSizeThreshold} bytes). It may not have meaningful coverage to improve.`,
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    // Persist
    const repository: IRepository = {
      id: randomUUID(),
      owner,
      name: repo,
      url: `https://github.com/${owner}/${repo}`,
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
    };

    return this.repoRepository.save(repository);
  }

  async findAll(): Promise<IRepository[]> {
    return this.repoRepository.findAll();
  }
}
