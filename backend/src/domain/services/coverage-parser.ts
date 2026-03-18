import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { ICoverageFile } from '../interfaces/coverage-file.interface';

export interface CoverageParseResult {
  coverageFiles: Omit<ICoverageFile, 'id' | 'repositoryId'>[];
  totalCoverage: number | null;
  avgCoverage: number | null;
  minCoverage: { pct: number; filePath: string } | null;
}

@Injectable()
export class CoverageParser {
  /**
   * Searches the standard locations for coverage-summary.json.
   * Returns the absolute path if found, null otherwise.
   */
  findCoverageSummary(workDir: string): string | null {
    const candidates = [
      path.join(workDir, 'coverage', 'coverage-summary.json'),
      path.join(workDir, 'coverage-summary.json'),
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return candidate;
    }

    // ./reports/**/coverage-summary.json
    const reportsDir = path.join(workDir, 'reports');
    if (fs.existsSync(reportsDir)) {
      const found = this.findInDir(reportsDir, 'coverage-summary.json');
      if (found) return found;
    }

    return null;
  }

  parse(summaryPath: string, workDir: string): CoverageParseResult {
    let raw: any;
    try {
      raw = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
    } catch (e) {
      throw new Error(`Could not parse coverage-summary.json: ${(e as Error).message}`);
    }

    const coverageFiles: Omit<ICoverageFile, 'id' | 'repositoryId'>[] = [];
    let totalCoverage: number | null = null;

    for (const [filePath, data] of Object.entries(raw)) {
      const fileData = data as any;

      if (filePath === 'total') {
        totalCoverage = fileData?.lines?.pct ?? null;
        continue;
      }

      const lines = fileData?.lines?.pct ?? 0;
      const statements = fileData?.statements?.pct ?? 0;
      const branches = fileData?.branches?.pct ?? 0;
      const functions = fileData?.functions?.pct ?? 0;

      // Make path relative to workDir if absolute
      let relPath = filePath;
      if (path.isAbsolute(filePath)) {
        relPath = path.relative(workDir, filePath);
      }

      // coveragePct = lines.pct only, per global rules
      coverageFiles.push({
        filePath: relPath,
        coveragePct: lines,
        statements,
        branches,
        functions,
        lines,
      });
    }

    const avgCoverage =
      coverageFiles.length > 0
        ? coverageFiles.reduce((sum, f) => sum + f.coveragePct, 0) / coverageFiles.length
        : null;

    const minCoverage =
      coverageFiles.length > 0
        ? coverageFiles.reduce(
            (min, f) =>
              f.coveragePct < min.pct ? { pct: f.coveragePct, filePath: f.filePath } : min,
            { pct: coverageFiles[0].coveragePct, filePath: coverageFiles[0].filePath },
          )
        : null;

    return { coverageFiles, totalCoverage, avgCoverage, minCoverage };
  }

  private findInDir(dir: string, filename: string): string | null {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          const found = this.findInDir(fullPath, filename);
          if (found) return found;
        } else if (entry.name === filename) {
          return fullPath;
        }
      }
    } catch {
      // ignore
    }
    return null;
  }
}
