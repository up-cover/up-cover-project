import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Octokit } from '@octokit/rest';

@Injectable()
export class GitHubClient {
  private readonly octokit: Octokit;

  constructor(private readonly configService: ConfigService) {
    const token = this.configService.get<string>('GITHUB_TOKEN', '');
    this.octokit = new Octokit({ auth: token });
  }

  async getDefaultBranch(owner: string, repo: string): Promise<string> {
    const { data } = await this.octokit.repos.get({ owner, repo });
    return data.default_branch;
  }

  async createPullRequest(
    owner: string,
    repo: string,
    head: string,
    base: string,
    title: string,
    body: string,
  ): Promise<string> {
    const { data } = await this.octokit.pulls.create({ owner, repo, head, base, title, body });
    return data.html_url;
  }
}
