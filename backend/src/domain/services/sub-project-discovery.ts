import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export interface SubProject {
  /** Relative path from the repo root, e.g. "backend" or "packages/api" */
  subPath: string;
  /** Absolute path to the sub-project directory */
  absPath: string;
}

@Injectable()
export class SubProjectDiscovery {
  /**
   * Returns sub-project candidates up to 2 levels deep.
   *
   * Stops at the first package.json found in a directory branch — if backend/
   * has a package.json we do not descend into backend/packages/.
   *
   * Returns an empty array when no sub-project package.json files are found;
   * the caller should treat the repo as a single-project and use the root.
   */
  discover(rootDir: string): SubProject[] {
    const found: SubProject[] = [];

    let depth1Entries: fs.Dirent[];
    try {
      depth1Entries = fs.readdirSync(rootDir, { withFileTypes: true });
    } catch {
      return [];
    }

    for (const d1 of depth1Entries) {
      if (!d1.isDirectory()) continue;
      if (d1.name === 'node_modules' || d1.name === '.git') continue;

      const dir1 = path.join(rootDir, d1.name);

      if (fs.existsSync(path.join(dir1, 'package.json'))) {
        found.push({ subPath: d1.name, absPath: dir1 });
        continue; // stop — don't descend into this branch
      }

      // No package.json at depth 1 — look one level deeper
      let depth2Entries: fs.Dirent[];
      try {
        depth2Entries = fs.readdirSync(dir1, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const d2 of depth2Entries) {
        if (!d2.isDirectory()) continue;
        if (d2.name === 'node_modules' || d2.name === '.git') continue;

        const dir2 = path.join(dir1, d2.name);
        if (fs.existsSync(path.join(dir2, 'package.json'))) {
          found.push({ subPath: path.join(d1.name, d2.name), absPath: dir2 });
        }
      }
    }

    return found;
  }
}
