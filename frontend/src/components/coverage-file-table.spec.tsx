import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { CoverageFileTable } from './CoverageFileTable';
import * as api from '../api/repositories';
import { CoverageFile, ImprovementJob } from '../types/repository';

vi.mock('../api/repositories');

const mockFetchJobs = vi.mocked(api.fetchImprovementJobsForFile);
const mockStartImprovement = vi.mocked(api.startImprovement);

function makeFile(overrides: Partial<CoverageFile> = {}): CoverageFile {
  return {
    id: 'file-1',
    repositoryId: 'repo-1',
    filePath: 'src/utils.ts',
    coveragePct: 50,
    statements: 50,
    branches: 50,
    functions: 50,
    lines: 50,
    fileSizeKb: 10,
    ...overrides,
  };
}

function makeJob(overrides: Partial<ImprovementJob> = {}): ImprovementJob {
  return {
    id: 'job-1',
    repositoryId: 'repo-1',
    filePath: 'src/utils.ts',
    status: 'COMPLETE',
    branchName: 'upcover/src-utils',
    prUrl: 'https://github.com/owner/repo/pull/1',
    errorMessage: null,
    logOutput: '',
    testsPass: true,
    coverageBeforePct: 50,
    coverageAfterPct: 80,
    coverageDeltaPct: 30,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function renderTable(
  files: CoverageFile[],
  overrides: {
    total?: number;
    page?: number;
    limit?: number;
    repositoryId?: string;
    onPageChange?: (p: number) => void;
  } = {},
) {
  return render(
    <CoverageFileTable
      files={files}
      total={overrides.total ?? files.length}
      page={overrides.page ?? 1}
      limit={overrides.limit ?? 50}
      repositoryId={overrides.repositoryId ?? 'repo-1'}
      onPageChange={overrides.onPageChange ?? vi.fn()}
    />,
  );
}

describe('CoverageFileTable', () => {
  beforeEach(() => {
    mockFetchJobs.mockResolvedValue([]);
    mockStartImprovement.mockReset();
  });

  // ---------------------------------------------------------------------------
  describe('empty state', () => {
    it('shows "No coverage files found." when files array is empty', () => {
      renderTable([]);
      expect(screen.getByText('No coverage files found.')).toBeInTheDocument();
    });

    it('does not render pagination when there is only one page', () => {
      renderTable([makeFile()], { total: 1, limit: 50 });
      expect(screen.queryByRole('button', { name: /previous/i })).not.toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  describe('file row rendering', () => {
    it('renders the file path', async () => {
      renderTable([makeFile({ filePath: 'src/special/file.ts' })]);
      await waitFor(() => expect(screen.getByText('src/special/file.ts')).toBeInTheDocument());
    });

    it('renders coveragePct as the "Coverage" column', async () => {
      renderTable([makeFile({ coveragePct: 75 })]);
      await waitFor(() => expect(screen.getAllByText('75%').length).toBeGreaterThan(0));
    });

    it('adds red background class to row when coveragePct < threshold (default 80)', async () => {
      renderTable([makeFile({ coveragePct: 50 })]);
      await waitFor(() => {
        const row = screen.getByText('src/utils.ts').closest('tr');
        expect(row).toHaveClass('bg-red-50');
      });
    });

    it('does not add red background when coveragePct >= threshold', async () => {
      renderTable([makeFile({ coveragePct: 90 })]);
      await waitFor(() => {
        const row = screen.getByText('src/utils.ts').closest('tr');
        expect(row).not.toHaveClass('bg-red-50');
      });
    });
  });

  // ---------------------------------------------------------------------------
  describe('Improve button states', () => {
    it('Improve button is enabled for a normal file with no active jobs', async () => {
      renderTable([makeFile()]);
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /improve/i })).not.toBeDisabled(),
      );
    });

    it('Improve button is disabled when file is too large (> 200 KB)', async () => {
      renderTable([makeFile({ fileSizeKb: 201 })]);
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /improve/i })).toBeDisabled(),
      );
    });

    it('Improve button is disabled when there is an active improvement job', async () => {
      mockFetchJobs.mockResolvedValue([makeJob({ status: 'GENERATING' })]);
      renderTable([makeFile()]);
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /improve/i })).toBeDisabled(),
      );
    });

    it('Improve button is enabled when all jobs are in terminal status', async () => {
      mockFetchJobs.mockResolvedValue([makeJob({ status: 'COMPLETE' })]);
      renderTable([makeFile()]);
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /improve/i })).not.toBeDisabled(),
      );
    });
  });

  // ---------------------------------------------------------------------------
  describe('pagination', () => {
    it('renders Previous and Next buttons when there are multiple pages', () => {
      renderTable([], { total: 60, page: 1, limit: 50 });
      expect(screen.getByRole('button', { name: /previous/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument();
    });

    it('Previous button is disabled on page 1', () => {
      renderTable([], { total: 60, page: 1, limit: 50 });
      expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled();
    });

    it('Next button is disabled on last page', () => {
      renderTable([], { total: 60, page: 2, limit: 50 });
      expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();
    });

    it('calls onPageChange with page - 1 when Previous is clicked', async () => {
      const onPageChange = vi.fn();
      const user = userEvent.setup();
      renderTable([], { total: 60, page: 2, limit: 50, onPageChange });
      await user.click(screen.getByRole('button', { name: /previous/i }));
      expect(onPageChange).toHaveBeenCalledWith(1);
    });

    it('calls onPageChange with page + 1 when Next is clicked', async () => {
      const onPageChange = vi.fn();
      const user = userEvent.setup();
      renderTable([], { total: 60, page: 1, limit: 50, onPageChange });
      await user.click(screen.getByRole('button', { name: /next/i }));
      expect(onPageChange).toHaveBeenCalledWith(2);
    });

    it('shows page info text', () => {
      renderTable([], { total: 60, page: 1, limit: 50 });
      expect(screen.getByText(/page 1 of 2/i)).toBeInTheDocument();
    });
  });
});
