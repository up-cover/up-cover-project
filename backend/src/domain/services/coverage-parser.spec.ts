import * as path from 'path';
import { CoverageParser } from './coverage-parser';
import { mockFs } from '../../test/fs-mock.helpers';

jest.mock('fs');

const WORK_DIR = '/work';

function makeSummary(files: Record<string, Partial<{
  lines: number; statements: number; branches: number; functions: number;
}>>): string {
  const obj: Record<string, unknown> = {};
  for (const [filePath, pcts] of Object.entries(files)) {
    obj[filePath] = {
      lines: { pct: pcts.lines ?? 0 },
      statements: { pct: pcts.statements ?? 0 },
      branches: { pct: pcts.branches ?? 0 },
      functions: { pct: pcts.functions ?? 0 },
    };
  }
  return JSON.stringify(obj);
}

describe('CoverageParser', () => {
  let parser: CoverageParser;
  let restoreFs: () => void;

  beforeEach(() => {
    parser = new CoverageParser();
  });

  afterEach(() => {
    if (restoreFs) restoreFs();
  });

  // ---------------------------------------------------------------------------
  describe('findCoverageSummary', () => {
    it('returns coverage/coverage-summary.json when it exists', () => {
      const summaryPath = path.join(WORK_DIR, 'coverage', 'coverage-summary.json');
      ({ restore: restoreFs } = mockFs({ [summaryPath]: '{}' }));

      expect(parser.findCoverageSummary(WORK_DIR)).toBe(summaryPath);
    });

    it('returns root coverage-summary.json when coverage/ variant does not exist', () => {
      const summaryPath = path.join(WORK_DIR, 'coverage-summary.json');
      ({ restore: restoreFs } = mockFs({ [summaryPath]: '{}' }));

      expect(parser.findCoverageSummary(WORK_DIR)).toBe(summaryPath);
    });

    it('finds coverage-summary.json nested inside reports/', () => {
      const nested = path.join(WORK_DIR, 'reports', 'sub', 'coverage-summary.json');
      ({ restore: restoreFs } = mockFs({ [nested]: '{}' }));

      expect(parser.findCoverageSummary(WORK_DIR)).toBe(nested);
    });

    it('returns null when no coverage-summary.json exists anywhere', () => {
      ({ restore: restoreFs } = mockFs({ [path.join(WORK_DIR, 'src', 'index.ts')]: '' }));

      expect(parser.findCoverageSummary(WORK_DIR)).toBeNull();
    });

    it('prefers coverage/ over root when both exist', () => {
      const coverageDir = path.join(WORK_DIR, 'coverage', 'coverage-summary.json');
      const rootFile = path.join(WORK_DIR, 'coverage-summary.json');
      ({ restore: restoreFs } = mockFs({ [coverageDir]: '{}', [rootFile]: '{}' }));

      expect(parser.findCoverageSummary(WORK_DIR)).toBe(coverageDir);
    });

    it('returns null and does not throw when reports/ dir causes readdirSync error', () => {
      // reports/ exists but reading it throws — findInDir catches and returns null
      const reportsDir = path.join(WORK_DIR, 'reports');
      ({ restore: restoreFs } = mockFs({ [path.join(reportsDir, '.keep')]: '' }));
      // Override readdirSync for the reports path to throw
      const fs = require('fs');
      const orig = fs.readdirSync;
      fs.readdirSync = jest.fn((p: string, ...args: any[]) => {
        if (p === reportsDir) throw new Error('permission denied');
        return orig(p, ...args);
      });

      expect(parser.findCoverageSummary(WORK_DIR)).toBeNull();

      fs.readdirSync = orig;
    });
  });

  // ---------------------------------------------------------------------------
  describe('parse', () => {
    it('parses total key → sets totalCoverage from lines.pct, no coverageFile entry', () => {
      const summaryPath = path.join(WORK_DIR, 'coverage-summary.json');
      ({ restore: restoreFs } = mockFs({
        [summaryPath]: JSON.stringify({
          total: { lines: { pct: 87.5 }, statements: { pct: 80 }, branches: { pct: 70 }, functions: { pct: 90 } },
        }),
      }));

      const result = parser.parse(summaryPath, WORK_DIR);

      expect(result.totalCoverage).toBe(87.5);
      expect(result.coverageFiles).toHaveLength(0);
      expect(result.avgCoverage).toBeNull();
      expect(result.minCoverage).toBeNull();
    });

    it('sets coveragePct = lines.pct (not statements, not branches)', () => {
      const filePath = path.join(WORK_DIR, 'src', 'foo.ts');
      const summaryPath = path.join(WORK_DIR, 'coverage-summary.json');
      ({ restore: restoreFs } = mockFs({
        [summaryPath]: JSON.stringify({
          [filePath]: { lines: { pct: 75 }, statements: { pct: 50 }, branches: { pct: 60 }, functions: { pct: 55 } },
        }),
        [filePath]: { content: 'export const x = 1;', size: 512 },
      }));

      const result = parser.parse(summaryPath, WORK_DIR);

      expect(result.coverageFiles).toHaveLength(1);
      expect(result.coverageFiles[0].coveragePct).toBe(75);
      expect(result.coverageFiles[0].lines).toBe(75);
      expect(result.coverageFiles[0].statements).toBe(50);
      expect(result.coverageFiles[0].branches).toBe(60);
      expect(result.coverageFiles[0].functions).toBe(55);
    });

    it('converts absolute file paths to relative using workDir', () => {
      const absFilePath = path.join(WORK_DIR, 'src', 'utils.ts');
      const summaryPath = path.join(WORK_DIR, 'coverage-summary.json');
      ({ restore: restoreFs } = mockFs({
        [summaryPath]: JSON.stringify({
          [absFilePath]: { lines: { pct: 100 }, statements: { pct: 100 }, branches: { pct: 100 }, functions: { pct: 100 } },
        }),
        [absFilePath]: 'export const x = 1;',
      }));

      const result = parser.parse(summaryPath, WORK_DIR);

      expect(result.coverageFiles[0].filePath).toBe('src/utils.ts');
    });

    it('leaves relative file paths unchanged', () => {
      const summaryPath = path.join(WORK_DIR, 'coverage-summary.json');
      const relPath = 'src/utils.ts';
      ({ restore: restoreFs } = mockFs({
        [summaryPath]: JSON.stringify({
          [relPath]: { lines: { pct: 100 }, statements: { pct: 100 }, branches: { pct: 100 }, functions: { pct: 100 } },
        }),
        [path.join(WORK_DIR, relPath)]: 'export const x = 1;',
      }));

      const result = parser.parse(summaryPath, WORK_DIR);

      expect(result.coverageFiles[0].filePath).toBe(relPath);
    });

    it('sets fileSizeKb from statSync size / 1024', () => {
      const filePath = path.join(WORK_DIR, 'src', 'big.ts');
      const summaryPath = path.join(WORK_DIR, 'coverage-summary.json');
      ({ restore: restoreFs } = mockFs({
        [summaryPath]: JSON.stringify({
          [filePath]: { lines: { pct: 50 }, statements: { pct: 50 }, branches: { pct: 50 }, functions: { pct: 50 } },
        }),
        [filePath]: { content: 'export const x = 1;', size: 2048 },
      }));

      const result = parser.parse(summaryPath, WORK_DIR);

      expect(result.coverageFiles[0].fileSizeKb).toBe(2);
    });

    it('sets fileSizeKb to null when statSync throws (file missing)', () => {
      const filePath = path.join(WORK_DIR, 'src', 'missing.ts');
      const summaryPath = path.join(WORK_DIR, 'coverage-summary.json');
      // Only provide the summary, not the source file
      ({ restore: restoreFs } = mockFs({
        [summaryPath]: JSON.stringify({
          [filePath]: { lines: { pct: 50 }, statements: { pct: 50 }, branches: { pct: 50 }, functions: { pct: 50 } },
        }),
      }));

      const result = parser.parse(summaryPath, WORK_DIR);

      expect(result.coverageFiles[0].fileSizeKb).toBeNull();
    });

    it('computes avgCoverage as mean of all file coveragePcts', () => {
      const summaryPath = path.join(WORK_DIR, 'coverage-summary.json');
      ({ restore: restoreFs } = mockFs({
        [summaryPath]: makeSummary({
          'src/a.ts': { lines: 40 },
          'src/b.ts': { lines: 60 },
          'src/c.ts': { lines: 80 },
        }),
      }));

      const result = parser.parse(summaryPath, WORK_DIR);

      expect(result.avgCoverage).toBeCloseTo(60, 5);
    });

    it('computes minCoverage as the entry with the lowest coveragePct', () => {
      const summaryPath = path.join(WORK_DIR, 'coverage-summary.json');
      ({ restore: restoreFs } = mockFs({
        [summaryPath]: makeSummary({
          'src/a.ts': { lines: 90 },
          'src/b.ts': { lines: 10 },
          'src/c.ts': { lines: 50 },
        }),
      }));

      const result = parser.parse(summaryPath, WORK_DIR);

      expect(result.minCoverage).toEqual({ pct: 10, filePath: 'src/b.ts' });
    });

    it('returns null avgCoverage and minCoverage when only total key is present', () => {
      const summaryPath = path.join(WORK_DIR, 'coverage-summary.json');
      ({ restore: restoreFs } = mockFs({
        [summaryPath]: JSON.stringify({
          total: { lines: { pct: 75 }, statements: { pct: 75 }, branches: { pct: 75 }, functions: { pct: 75 } },
        }),
      }));

      const result = parser.parse(summaryPath, WORK_DIR);

      expect(result.avgCoverage).toBeNull();
      expect(result.minCoverage).toBeNull();
    });

    it('defaults missing pct fields to 0', () => {
      const summaryPath = path.join(WORK_DIR, 'coverage-summary.json');
      ({ restore: restoreFs } = mockFs({
        [summaryPath]: JSON.stringify({
          'src/partial.ts': {},
        }),
      }));

      const result = parser.parse(summaryPath, WORK_DIR);

      expect(result.coverageFiles[0].coveragePct).toBe(0);
      expect(result.coverageFiles[0].statements).toBe(0);
      expect(result.coverageFiles[0].branches).toBe(0);
      expect(result.coverageFiles[0].functions).toBe(0);
    });

    it('sets totalCoverage to null when total key is absent', () => {
      const summaryPath = path.join(WORK_DIR, 'coverage-summary.json');
      ({ restore: restoreFs } = mockFs({
        [summaryPath]: makeSummary({ 'src/a.ts': { lines: 80 } }),
      }));

      const result = parser.parse(summaryPath, WORK_DIR);

      expect(result.totalCoverage).toBeNull();
    });

    it('throws when the file is not valid JSON', () => {
      const summaryPath = path.join(WORK_DIR, 'coverage-summary.json');
      ({ restore: restoreFs } = mockFs({ [summaryPath]: 'not json {{{' }));

      expect(() => parser.parse(summaryPath, WORK_DIR)).toThrow('Could not parse coverage-summary.json');
    });

    it('throws when JSON is null (not an object)', () => {
      const summaryPath = path.join(WORK_DIR, 'coverage-summary.json');
      ({ restore: restoreFs } = mockFs({ [summaryPath]: 'null' }));

      expect(() => parser.parse(summaryPath, WORK_DIR)).toThrow('unexpected format');
    });

    it('throws when readFileSync throws (file unreadable)', () => {
      const summaryPath = path.join(WORK_DIR, 'coverage-summary.json');
      // mockFs with no entry → readFileSync will throw ENOENT
      ({ restore: restoreFs } = mockFs({}));

      expect(() => parser.parse(summaryPath, WORK_DIR)).toThrow('Could not parse coverage-summary.json');
    });
  });
});
