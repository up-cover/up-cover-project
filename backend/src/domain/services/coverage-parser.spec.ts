import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CoverageParser } from './coverage-parser';

describe('CoverageParser', () => {
  let parser: CoverageParser;
  let workDir: string;

  beforeEach(() => {
    parser = new CoverageParser();
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'upcover-cov-'));
  });

  afterEach(() => {
    fs.rmSync(workDir, { recursive: true, force: true });
  });

  function writeSummary(dir: string, data: unknown) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'coverage-summary.json'), JSON.stringify(data));
  }

  const sampleSummary = {
    total: { lines: { pct: 75.5 }, statements: { pct: 74 }, branches: { pct: 60 }, functions: { pct: 80 } },
    '/abs/src/foo.ts': { lines: { pct: 90 }, statements: { pct: 88 }, branches: { pct: 70 }, functions: { pct: 100 } },
    '/abs/src/bar.ts': { lines: { pct: 45 }, statements: { pct: 43 }, branches: { pct: 20 }, functions: { pct: 60 } },
  };

  // --- findCoverageSummary ---

  describe('findCoverageSummary', () => {
    it('finds coverage/coverage-summary.json', () => {
      writeSummary(path.join(workDir, 'coverage'), sampleSummary);
      expect(parser.findCoverageSummary(workDir)).toBe(
        path.join(workDir, 'coverage', 'coverage-summary.json'),
      );
    });

    it('finds coverage-summary.json in workDir root', () => {
      writeSummary(workDir, sampleSummary);
      expect(parser.findCoverageSummary(workDir)).toBe(
        path.join(workDir, 'coverage-summary.json'),
      );
    });

    it('finds coverage-summary.json nested under reports/', () => {
      writeSummary(path.join(workDir, 'reports', 'html'), sampleSummary);
      expect(parser.findCoverageSummary(workDir)).toBe(
        path.join(workDir, 'reports', 'html', 'coverage-summary.json'),
      );
    });

    it('returns null when no coverage-summary.json exists anywhere', () => {
      expect(parser.findCoverageSummary(workDir)).toBeNull();
    });

    it('prefers coverage/ over root when both exist', () => {
      writeSummary(path.join(workDir, 'coverage'), sampleSummary);
      writeSummary(workDir, sampleSummary);
      expect(parser.findCoverageSummary(workDir)).toBe(
        path.join(workDir, 'coverage', 'coverage-summary.json'),
      );
    });
  });

  // --- parse ---

  describe('parse', () => {
    function writeSummaryAt(relPath: string, data: unknown): string {
      const fullPath = path.join(workDir, relPath);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, JSON.stringify(data));
      return fullPath;
    }

    it('extracts totalCoverage from the total.lines.pct field', () => {
      const summaryPath = writeSummaryAt('coverage/coverage-summary.json', sampleSummary);
      const result = parser.parse(summaryPath, workDir);
      expect(result.totalCoverage).toBe(75.5);
    });

    it('makes absolute file paths relative to workDir', () => {
      const absWorkDir = fs.realpathSync(workDir);
      const summary = {
        total: { lines: { pct: 80 }, statements: { pct: 80 }, branches: { pct: 80 }, functions: { pct: 80 } },
        [`${absWorkDir}/src/app.ts`]: { lines: { pct: 80 }, statements: { pct: 80 }, branches: { pct: 80 }, functions: { pct: 80 } },
      };
      const summaryPath = writeSummaryAt('coverage/coverage-summary.json', summary);
      const result = parser.parse(summaryPath, absWorkDir);
      expect(result.coverageFiles[0].filePath).toBe('src/app.ts');
    });

    it('keeps non-absolute paths as-is', () => {
      const summary = {
        total: { lines: { pct: 80 }, statements: { pct: 80 }, branches: { pct: 80 }, functions: { pct: 80 } },
        'src/app.ts': { lines: { pct: 80 }, statements: { pct: 80 }, branches: { pct: 80 }, functions: { pct: 80 } },
      };
      const summaryPath = writeSummaryAt('coverage/coverage-summary.json', summary);
      const result = parser.parse(summaryPath, workDir);
      expect(result.coverageFiles[0].filePath).toBe('src/app.ts');
    });

    it('sets fileSizeKb when the actual source file exists', () => {
      fs.mkdirSync(path.join(workDir, 'src'), { recursive: true });
      fs.writeFileSync(path.join(workDir, 'src', 'app.ts'), 'const x = 1;');
      const summary = {
        total: { lines: { pct: 80 }, statements: { pct: 80 }, branches: { pct: 80 }, functions: { pct: 80 } },
        'src/app.ts': { lines: { pct: 80 }, statements: { pct: 80 }, branches: { pct: 80 }, functions: { pct: 80 } },
      };
      const summaryPath = writeSummaryAt('coverage/coverage-summary.json', summary);
      const result = parser.parse(summaryPath, workDir);
      expect(result.coverageFiles[0].fileSizeKb).not.toBeNull();
      expect(result.coverageFiles[0].fileSizeKb).toBeGreaterThan(0);
    });

    it('sets fileSizeKb to null when file does not exist on disk', () => {
      const summary = {
        total: { lines: { pct: 80 }, statements: { pct: 80 }, branches: { pct: 80 }, functions: { pct: 80 } },
        '/nonexistent/path/ghost.ts': { lines: { pct: 80 }, statements: { pct: 80 }, branches: { pct: 80 }, functions: { pct: 80 } },
      };
      const summaryPath = writeSummaryAt('coverage/coverage-summary.json', summary);
      const result = parser.parse(summaryPath, workDir);
      expect(result.coverageFiles[0].fileSizeKb).toBeNull();
    });

    it('calculates avgCoverage as mean of all file coveragePct values', () => {
      const summaryPath = writeSummaryAt('coverage/coverage-summary.json', sampleSummary);
      const result = parser.parse(summaryPath, workDir);
      expect(result.avgCoverage).toBe((90 + 45) / 2);
    });

    it('identifies minCoverage correctly', () => {
      const summaryPath = writeSummaryAt('coverage/coverage-summary.json', sampleSummary);
      const result = parser.parse(summaryPath, workDir);
      expect(result.minCoverage!.pct).toBe(45);
    });

    it('handles coverage-summary.json with only the total key', () => {
      const summary = {
        total: { lines: { pct: 80 }, statements: { pct: 80 }, branches: { pct: 80 }, functions: { pct: 80 } },
      };
      const summaryPath = writeSummaryAt('coverage/coverage-summary.json', summary);
      const result = parser.parse(summaryPath, workDir);
      expect(result.coverageFiles).toHaveLength(0);
      expect(result.avgCoverage).toBeNull();
      expect(result.minCoverage).toBeNull();
      expect(result.totalCoverage).toBe(80);
    });

    it('defaults missing metric fields to 0', () => {
      const summary = {
        total: { lines: { pct: 80 } },
        'src/app.ts': {},
      };
      const summaryPath = writeSummaryAt('coverage/coverage-summary.json', summary);
      const result = parser.parse(summaryPath, workDir);
      expect(result.coverageFiles[0].lines).toBe(0);
      expect(result.coverageFiles[0].branches).toBe(0);
      expect(result.coverageFiles[0].functions).toBe(0);
      expect(result.coverageFiles[0].statements).toBe(0);
    });

    it('throws when the file contains invalid JSON', () => {
      const badPath = path.join(workDir, 'bad.json');
      fs.writeFileSync(badPath, 'not json {{{');
      expect(() => parser.parse(badPath, workDir)).toThrow('Could not parse coverage-summary.json');
    });

    it('throws when the file is not an object', () => {
      const badPath = path.join(workDir, 'bad.json');
      fs.writeFileSync(badPath, '"just a string"');
      expect(() => parser.parse(badPath, workDir)).toThrow('unexpected format');
    });
  });
});
