import { Injectable } from '@nestjs/common';
import simpleGit from 'simple-git';

@Injectable()
export class GitClient {
  async clone(repoUrl: string, targetDir: string, token: string): Promise<void> {
    const authenticatedUrl = repoUrl.startsWith('https://')
      ? `https://x-access-token:${token}@${repoUrl.slice('https://'.length)}`
      : repoUrl;

    const git = simpleGit();
    await git.clone(authenticatedUrl, targetDir, ['--depth=1']);
  }
}
