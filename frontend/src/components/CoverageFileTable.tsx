import React from 'react';
import { Button } from '@/components/ui/button';
import { CoverageFile } from '../types/repository';

const COVERAGE_THRESHOLD = Number(import.meta.env.VITE_COVERAGE_THRESHOLD ?? 80);
const FILE_SIZE_LIMIT_KB = Number(import.meta.env.VITE_FILE_SIZE_LIMIT_KB ?? 200);

const pct = (n: number) => `${Number(n.toFixed(2))}%`;

interface CoverageFileRowProps {
  file: CoverageFile;
}

function CoverageFileRow({ file }: CoverageFileRowProps) {
  const belowThreshold = file.coveragePct < COVERAGE_THRESHOLD;
  const tooLarge = file.fileSizeKb !== null && file.fileSizeKb > FILE_SIZE_LIMIT_KB;
  // activeJob stubbed false — Stage 8 will wire real detection
  const hasActiveJob = false;
  const improveDisabled = tooLarge || hasActiveJob;

  let improveTitle: string | undefined;
  if (tooLarge) {
    improveTitle = `File exceeds ${FILE_SIZE_LIMIT_KB}KB — too large for AI improvement`;
  } else if (hasActiveJob) {
    improveTitle = 'An improvement job is already in progress for this file';
  }

  return (
    <tr className={belowThreshold ? 'bg-red-50' : undefined}>
      <td className="px-3 py-2 font-mono text-xs text-gray-700 break-all max-w-xs">{file.filePath}</td>
      <td className="px-3 py-2 text-right text-sm tabular-nums">{pct(file.statements)}</td>
      <td className="px-3 py-2 text-right text-sm tabular-nums">{pct(file.branches)}</td>
      <td className="px-3 py-2 text-right text-sm tabular-nums">{pct(file.functions)}</td>
      <td className="px-3 py-2 text-right text-sm tabular-nums">{pct(file.lines)}</td>
      <td className={`px-3 py-2 text-right text-sm tabular-nums font-semibold ${belowThreshold ? 'text-red-600' : 'text-green-700'}`}>
        {pct(file.coveragePct)}
      </td>
      <td className="px-3 py-2 text-right">
        <span title={improveTitle}>
          <Button size="sm" variant="outline" disabled={improveDisabled}>
            Improve
          </Button>
        </span>
      </td>
    </tr>
  );
}

interface CoverageFileTableProps {
  files: CoverageFile[];
  total: number;
  page: number;
  limit: number;
  onPageChange: (page: number) => void;
}

export function CoverageFileTable({ files, total, page, limit, onPageChange }: CoverageFileTableProps) {
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-md border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="px-3 py-2 text-left">File</th>
              <th className="px-3 py-2 text-right">Statements</th>
              <th className="px-3 py-2 text-right">Branches</th>
              <th className="px-3 py-2 text-right">Functions</th>
              <th className="px-3 py-2 text-right">Lines</th>
              <th className="px-3 py-2 text-right">Coverage</th>
              <th className="px-3 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {files.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-gray-400 text-sm">
                  No coverage files found.
                </td>
              </tr>
            ) : (
              files.map((file) => <CoverageFileRow key={file.id} file={file} />)
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>
            Page {page} of {totalPages} ({total} files)
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
