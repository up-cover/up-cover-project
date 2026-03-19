import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CoverageFileTable } from './CoverageFileTable';
import { CoverageFile } from '../types/repository';
import * as api from '../api/repositories';

vi.mock('../api/repositories');

function makeFile(id: string, filePath: string, coveragePct: number): CoverageFile {
  return {
    id,
    repositoryId: 'repo-1',
    filePath,
    coveragePct,
    statements: coveragePct,
    branches: coveragePct,
    functions: coveragePct,
    lines: coveragePct,
    fileSizeKb: 10,
  };
}

const defaultProps = {
  repositoryId: 'repo-1',
  total: 0,
  page: 1,
  limit: 50,
  onPageChange: vi.fn(),
};

describe('CoverageFileTable', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(api.fetchImprovementJobsForFile).mockResolvedValue([]);
  });

  it('renders table headers', () => {
    render(<CoverageFileTable {...defaultProps} files={[]} />);
    expect(screen.getByText('File')).toBeInTheDocument();
    expect(screen.getByText('Statements')).toBeInTheDocument();
    expect(screen.getByText('Branches')).toBeInTheDocument();
    expect(screen.getByText('Functions')).toBeInTheDocument();
    expect(screen.getByText('Lines')).toBeInTheDocument();
    expect(screen.getByText('Coverage')).toBeInTheDocument();
    expect(screen.getByText('Action')).toBeInTheDocument();
  });

  it('renders "No coverage files found" when files array is empty', () => {
    render(<CoverageFileTable {...defaultProps} files={[]} />);
    expect(screen.getByText(/No coverage files found/i)).toBeInTheDocument();
  });

  it('renders one row per coverage file', async () => {
    const files = [
      makeFile('1', 'src/foo.ts', 90),
      makeFile('2', 'src/bar.ts', 60),
    ];
    render(<CoverageFileTable {...defaultProps} files={files} total={2} />);
    await waitFor(() => {
      expect(screen.getByText('src/foo.ts')).toBeInTheDocument();
      expect(screen.getByText('src/bar.ts')).toBeInTheDocument();
    });
  });

  it('applies red background to rows below coverage threshold (< 80)', async () => {
    const files = [makeFile('1', 'src/low.ts', 50)];
    render(<CoverageFileTable {...defaultProps} files={files} total={1} />);
    await waitFor(() => {
      const row = screen.getByText('src/low.ts').closest('tr');
      expect(row).toHaveClass('bg-red-50');
    });
  });

  it('does not apply red background to rows at or above threshold', async () => {
    const files = [makeFile('1', 'src/good.ts', 90)];
    render(<CoverageFileTable {...defaultProps} files={files} total={1} />);
    await waitFor(() => {
      const row = screen.getByText('src/good.ts').closest('tr');
      expect(row).not.toHaveClass('bg-red-50');
    });
  });

  it('hides pagination when all files fit on one page', () => {
    const files = [makeFile('1', 'src/foo.ts', 90)];
    render(<CoverageFileTable {...defaultProps} files={files} total={1} limit={50} page={1} />);
    expect(screen.queryByRole('button', { name: /previous/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /next/i })).not.toBeInTheDocument();
  });

  it('shows pagination when total exceeds limit', () => {
    const files = [makeFile('1', 'src/foo.ts', 90)];
    render(<CoverageFileTable {...defaultProps} files={files} total={100} limit={50} page={1} />);
    expect(screen.getByRole('button', { name: /previous/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument();
  });

  it('disables Previous button on first page', () => {
    const files = [makeFile('1', 'src/foo.ts', 90)];
    render(<CoverageFileTable {...defaultProps} files={files} total={100} limit={50} page={1} />);
    expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled();
  });

  it('disables Next button on last page', () => {
    const files = [makeFile('1', 'src/foo.ts', 90)];
    render(<CoverageFileTable {...defaultProps} files={files} total={100} limit={50} page={2} />);
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();
  });

  it('calls onPageChange with page - 1 when Previous is clicked', () => {
    const onPageChange = vi.fn();
    const files = [makeFile('1', 'src/foo.ts', 90)];
    render(
      <CoverageFileTable
        {...defaultProps}
        files={files}
        total={100}
        limit={50}
        page={2}
        onPageChange={onPageChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /previous/i }));
    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it('calls onPageChange with page + 1 when Next is clicked', () => {
    const onPageChange = vi.fn();
    const files = [makeFile('1', 'src/foo.ts', 90)];
    render(
      <CoverageFileTable
        {...defaultProps}
        files={files}
        total={100}
        limit={50}
        page={1}
        onPageChange={onPageChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });
});
