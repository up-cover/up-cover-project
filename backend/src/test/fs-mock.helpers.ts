import * as fs from 'fs';
import * as path from 'path';

export interface FsEntry {
  content?: string;
  /** size in bytes, used by statSync */
  size?: number;
}

/**
 * Virtual filesystem factory.
 *
 * Pass a flat map of absolute path → FsEntry (or string shorthand for content)
 * and call `install()` before your tests. The returned `restore()` function
 * resets all mocked implementations so you can call it in afterEach.
 *
 * Usage:
 *   const { restore } = mockFs({ '/work/package.json': '{"name":"test"}' });
 *   afterEach(restore);
 */
export function mockFs(files: Record<string, string | FsEntry>): { restore: () => void } {
  const normalized: Record<string, FsEntry> = {};
  for (const [p, v] of Object.entries(files)) {
    normalized[p] = typeof v === 'string' ? { content: v } : v;
  }

  // Build a set of directory paths implied by the file entries
  const dirs = new Set<string>();
  for (const p of Object.keys(normalized)) {
    let cur = path.dirname(p);
    while (cur !== path.dirname(cur)) {
      dirs.add(cur);
      cur = path.dirname(cur);
    }
  }

  const origExistsSync = fs.existsSync;
  const origReadFileSync = fs.readFileSync;
  const origReaddirSync = fs.readdirSync;
  const origStatSync = fs.statSync;

  (fs.existsSync as jest.Mock) = jest.fn((p: fs.PathLike) => {
    const key = String(p);
    return key in normalized || dirs.has(key);
  });

  (fs.readFileSync as jest.Mock) = jest.fn((p: fs.PathLike | number, ...args: any[]) => {
    const key = String(p);
    if (key in normalized) {
      const entry = normalized[key];
      if (entry.content !== undefined) return entry.content;
    }
    throw Object.assign(new Error(`ENOENT: no such file or directory, open '${key}'`), {
      code: 'ENOENT',
    });
  });

  (fs.readdirSync as jest.Mock) = jest.fn((p: fs.PathLike, options?: any) => {
    const dirPath = String(p);
    const withFileTypes = options && options.withFileTypes;
    const children = new Map<string, boolean>(); // name → isDirectory

    for (const filePath of Object.keys(normalized)) {
      if (path.dirname(filePath) === dirPath) {
        children.set(path.basename(filePath), false);
      }
    }
    for (const dirPathEntry of dirs) {
      if (path.dirname(dirPathEntry) === dirPath) {
        children.set(path.basename(dirPathEntry), true);
      }
    }

    if (children.size === 0 && !dirs.has(dirPath)) {
      throw Object.assign(new Error(`ENOENT: no such file or directory, scandir '${dirPath}'`), {
        code: 'ENOENT',
      });
    }

    if (withFileTypes) {
      return Array.from(children.entries()).map(([name, isDir]) => ({
        name,
        isDirectory: () => isDir,
        isFile: () => !isDir,
      }));
    }
    return Array.from(children.keys());
  });

  (fs.statSync as jest.Mock) = jest.fn((p: fs.PathLike) => {
    const key = String(p);
    if (key in normalized) {
      const entry = normalized[key];
      const content = entry.content ?? '';
      return { size: entry.size ?? Buffer.byteLength(content, 'utf-8') };
    }
    throw Object.assign(new Error(`ENOENT: no such file or directory, stat '${key}'`), {
      code: 'ENOENT',
    });
  });

  const restore = () => {
    (fs.existsSync as any) = origExistsSync;
    (fs.readFileSync as any) = origReadFileSync;
    (fs.readdirSync as any) = origReaddirSync;
    (fs.statSync as any) = origStatSync;
  };

  return { restore };
}
