import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RepoCard } from './RepoCard';
import * as api from '../api/repositories';
import { Repository } from '../types/repository';

vi.mock('../api/repositories');
vi.mock('../hooks/useSSE', () => ({ useSSE: vi.fn() }));

function makeRepo(overrides: Partial<Repository> = {}): Repository {
  return {
    id: 'repo-1',
    owner: 'acme',
    name: 'myrepo',
    url: 'https://github.com/acme/myrepo',
    hasTypeScript: true,
    parentRepositoryId: null,
    subPath: null,
    totalTsFiles: null,
    packageManager: null,
    testFramework: null,
    coverageFramework: null,
    totalCoverage: null,
    avgCoverage: null,
    minCoverage: null,
    scanStatus: 'NOT_STARTED',
    scanError: null,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function renderCard(repo: Repository, onRemoved = vi.fn()) {
  return render(
    <MemoryRouter>
      <RepoCard repository={repo} onRemoved={onRemoved} />
    </MemoryRouter>,
  );
}

describe('RepoCard', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(api.fetchScanLog).mockResolvedValue([]);
  });

  it('renders repo owner/name as title', () => {
    renderCard(makeRepo());
    expect(screen.getByText('acme/myrepo')).toBeInTheDocument();
  });

  it('shows "Start Scan" button when scanStatus is NOT_STARTED', () => {
    renderCard(makeRepo({ scanStatus: 'NOT_STARTED' }));
    expect(screen.getByRole('button', { name: /start scan/i })).toBeInTheDocument();
  });

  it('shows "Rescan" button when scanStatus is FAILED', () => {
    renderCard(makeRepo({ scanStatus: 'FAILED' }));
    expect(screen.getByRole('button', { name: /rescan/i })).toBeInTheDocument();
  });

  it('shows scan error message when scanStatus is FAILED and scanError is set', () => {
    renderCard(makeRepo({ scanStatus: 'FAILED', scanError: 'Clone failed: auth error' }));
    expect(screen.getByText('Clone failed: auth error')).toBeInTheDocument();
  });

  it('shows "Scan in progress" text when scan is active', () => {
    renderCard(makeRepo({ scanStatus: 'CLONING' }));
    expect(screen.getByText(/scan in progress/i)).toBeInTheDocument();
  });

  it('shows "View Details" link when scanStatus is COMPLETE', () => {
    renderCard(makeRepo({ scanStatus: 'COMPLETE' }));
    expect(screen.getByRole('link', { name: /view details/i })).toBeInTheDocument();
  });

  it('Remove button is disabled during active scan', () => {
    renderCard(makeRepo({ scanStatus: 'TESTING' }));
    expect(screen.getByRole('button', { name: /remove/i })).toBeDisabled();
  });

  it('calls deleteRepository and invokes onRemoved on successful remove', async () => {
    vi.stubGlobal('confirm', () => true);
    vi.mocked(api.deleteRepository).mockResolvedValue(undefined);
    const onRemoved = vi.fn();
    renderCard(makeRepo(), onRemoved);
    fireEvent.click(screen.getByRole('button', { name: /remove/i }));
    await waitFor(() => expect(api.deleteRepository).toHaveBeenCalledWith('repo-1'));
    await waitFor(() => expect(onRemoved).toHaveBeenCalledTimes(1));
  });

  it('shows error message when deleteRepository fails', async () => {
    vi.stubGlobal('confirm', () => true);
    vi.mocked(api.deleteRepository).mockRejectedValue({ message: 'Server error' });
    renderCard(makeRepo());
    fireEvent.click(screen.getByRole('button', { name: /remove/i }));
    expect(await screen.findByText('Server error')).toBeInTheDocument();
  });

  it('calls startScan when "Start Scan" is clicked', async () => {
    vi.mocked(api.startScan).mockResolvedValue(undefined);
    renderCard(makeRepo({ scanStatus: 'NOT_STARTED' }));
    fireEvent.click(screen.getByRole('button', { name: /start scan/i }));
    await waitFor(() => expect(api.startScan).toHaveBeenCalledWith('repo-1'));
  });
});
