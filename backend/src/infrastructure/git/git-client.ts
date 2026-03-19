import { Injectable } from '@nestjs/common';
import simpleGit from 'simple-git';

@Injectable()
export class GitClient {
  private authUrl(repoUrl: string, token: string): string {
    return repoUrl.startsWith('https://')
      ? `https://x-access-token:${token}@${repoUrl.slice('https://'.length)}`
      : repoUrl;
  }

  async clone(repoUrl: string, targetDir: string, token: string, shallow = true): Promise<void> {
    const git = simpleGit();
    const flags = shallow ? ['--depth=1'] : [];
    await git.clone(this.authUrl(repoUrl, token), targetDir, flags);
  }

  async remoteBranchExists(repoUrl: string, branchName: string, token: string): Promise<boolean> {
    const git = simpleGit();
    const result = await git.listRemote(['--heads', this.authUrl(repoUrl, token), branchName]);
    return result.trim().length > 0;
  }

  async createBranch(workDir: string, branchName: string): Promise<void> {
    const git = simpleGit(workDir);
    await git.checkoutLocalBranch(branchName);
  }

  async addFile(workDir: string, filePath: string): Promise<void> {
    const git = simpleGit(workDir);
    await git.add(filePath);
  }

  async commit(workDir: string, message: string, authorName: string, authorEmail: string): Promise<void> {
    const git = simpleGit(workDir);
    await git.addConfig('user.name', authorName);
    await git.addConfig('user.email', authorEmail);
    await git.commit(message, undefined, { '--no-verify': null });
  }

  async push(workDir: string, branchName: string, repoUrl: string, token: string): Promise<void> {
    const git = simpleGit(workDir);
    await git.remote(['set-url', 'origin', this.authUrl(repoUrl, token)]);
    await git.push('origin', branchName);
  }
}
