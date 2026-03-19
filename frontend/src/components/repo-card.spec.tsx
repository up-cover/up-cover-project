import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { renderWithRouter } from '../test/render-helpers';
import { RepoCard } from './RepoCard';
import * as api from '../api/repositories';
import { Repository } from '../types/repository';

vi.mock('../api/repositories');

const mockStartScan = vi.mocked(api.startScan);
const mockDeleteRepo = vi.mocked(api.deleteRepository);
const mockFetchScanLog = vi.mocked(api.fetchScanLog);

function makeRepo(overrides: Partial<Repository> = {}): Repository {
  return {
    id: '1',
    owner: 'owner',
    name: 'myrepo',
    url: 'https://github.com/owner/myrepo',
    hasTypeScript: true,
    totalTsFiles: 42,
    packageManager: 'npm',
    testFramework: 'jest',
    coverageFramework: 'istanbul',
    totalCoverage: 75.5,
    avgCoverage: 70.0,
    minCoverage: { pct: 10.5, filePath: 'src/low.ts' },
    scanStatus: 'NOT_STARTED',
    scanError: null,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('RepoCard', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    user = userEvent.setup();
    mockStartScan.mockReset();
    mockDeleteRepo.mockReset();
    mockFetchScanLog.mockResolvedValue([]);
  });

  // ---------------------------------------------------------------------------
  describe('status badge rendering', () => {
    const statusLabels: Array<[Repository['scanStatus'], string]> = [
      ['NOT_STARTED', 'not started'],
      ['CLONING', 'cloning'],
      ['SCANNING', 'scanning'],
      ['INSTALLING', 'installing'],
      ['TESTING', 'testing'],
      ['COMPLETE', 'complete'],
      ['FAILED', 'failed'],
    ];

    for (const [status, label] of statusLabels) {
      it(`shows "${label}" badge for status ${status}`, async () => {
        renderWithRouter(<RepoCard repository={makeRepo({ scanStatus: status })} />);
        await waitFor(() => expect(screen.getByText(label)).toBeInTheDocument());
      });
    }
  });

  // ---------------------------------------------------------------------------
  describe('scan button visibility', () => {
    it('shows "Start Scan" button when status is NOT_STARTED', async () => {
      renderWithRouter(<RepoCard repository={makeRepo({ scanStatus: 'NOT_STARTED' })} />);
      await waitFor(() => expect(screen.getByRole('button', { name: /start scan/i })).toBeInTheDocument());
    });

    it('shows "Rescan" button when status is FAILED', async () => {
      renderWithRouter(<RepoCard repository={makeRepo({ scanStatus: 'FAILED' })} />);
      await waitFor(() => expect(screen.getByRole('button', { name: /rescan/i })).toBeInTheDocument());
    });

    it('does not show scan button when status is COMPLETE', async () => {
      renderWithRouter(<RepoCard repository={makeRepo({ scanStatus: 'COMPLETE' })} />);
      await waitFor(() => {
        expect(screen.queryByRole('button', { name: /start scan/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /rescan/i })).not.toBeInTheDocument();
      });
    });

    it('does not show scan button when status is CLONING (active)', async () => {
      renderWithRouter(<RepoCard repository={makeRepo({ scanStatus: 'CLONING' })} />);
      await waitFor(() =>
        expect(screen.queryByRole('button', { name: /start scan|rescan/i })).not.toBeInTheDocument(),
      );
    });

    it('shows "View Details" link when status is COMPLETE', async () => {
      renderWithRouter(<RepoCard repository={makeRepo({ scanStatus: 'COMPLETE', id: '42' })} />);
      await waitFor(() => {
        const link = screen.getByRole('link', { name: /view details/i });
        expect(link).toBeInTheDocument();
        expect(link).toHaveAttribute('href', '/repos/42');
      });
    });

    it('shows "Scan in progress…" text when status is active', async () => {
      renderWithRouter(<RepoCard repository={makeRepo({ scanStatus: 'TESTING' })} />);
      await waitFor(() => expect(screen.getByText(/scan in progress/i)).toBeInTheDocument());
    });
  });

  // ---------------------------------------------------------------------------
  describe('remove button', () => {
    it('remove button is enabled when scan is not active', async () => {
      renderWithRouter(<RepoCard repository={makeRepo({ scanStatus: 'NOT_STARTED' })} />);
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /^remove$/i })).not.toBeDisabled(),
      );
    });

    it('remove button is disabled during active scan (CLONING)', async () => {
      renderWithRouter(<RepoCard repository={makeRepo({ scanStatus: 'CLONING' })} />);
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /^remove$/i })).toBeDisabled(),
      );
    });

    it('remove button is disabled during active scan (TESTING)', async () => {
      renderWithRouter(<RepoCard repository={makeRepo({ scanStatus: 'TESTING' })} />);
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /^remove$/i })).toBeDisabled(),
      );
    });

    it('calls deleteRepository and onRemove on successful remove', async () => {
      mockDeleteRepo.mockResolvedValue(undefined);
      const onRemove = vi.fn();
      renderWithRouter(<RepoCard repository={makeRepo()} onRemove={onRemove} />);
      await waitFor(() => screen.getByRole('button', { name: /^remove$/i }));
      await user.click(screen.getByRole('button', { name: /^remove$/i }));
      await waitFor(() => expect(onRemove).toHaveBeenCalled());
      expect(mockDeleteRepo).toHaveBeenCalledWith('1');
    });

    it('shows error message when deleteRepository fails', async () => {
      mockDeleteRepo.mockRejectedValue(new Error('network error'));
      renderWithRouter(<RepoCard repository={makeRepo()} />);
      await waitFor(() => screen.getByRole('button', { name: /^remove$/i }));
      await user.click(screen.getByRole('button', { name: /^remove$/i }));
      await waitFor(() =>
        expect(screen.getByText(/failed to remove repository/i)).toBeInTheDocument(),
      );
    });
  });

  // ---------------------------------------------------------------------------
  describe('start scan', () => {
    it('calls startScan when scan button is clicked', async () => {
      mockStartScan.mockResolvedValue(undefined);
      renderWithRouter(<RepoCard repository={makeRepo({ scanStatus: 'NOT_STARTED' })} />);
      await waitFor(() => screen.getByRole('button', { name: /start scan/i }));
      await user.click(screen.getByRole('button', { name: /start scan/i }));
      await waitFor(() => expect(mockStartScan).toHaveBeenCalledWith('1'));
    });

    it('shows error message when startScan fails', async () => {
      mockStartScan.mockRejectedValue({ message: 'Scan already running.' });
      renderWithRouter(<RepoCard repository={makeRepo({ scanStatus: 'NOT_STARTED' })} />);
      await waitFor(() => screen.getByRole('button', { name: /start scan/i }));
      await user.click(screen.getByRole('button', { name: /start scan/i }));
      await waitFor(() => expect(screen.getByText('Scan already running.')).toBeInTheDocument());
    });
  });

  // ---------------------------------------------------------------------------
  describe('repository data rendering', () => {
    it('renders owner/name in the card header', async () => {
      renderWithRouter(<RepoCard repository={makeRepo({ owner: 'acme', name: 'widget' })} />);
      await waitFor(() => expect(screen.getByText('acme/widget')).toBeInTheDocument());
    });

    it('shows scan error message when status is FAILED and scanError is set', async () => {
      renderWithRouter(
        <RepoCard repository={makeRepo({ scanStatus: 'FAILED', scanError: 'jest not found' })} />,
      );
      await waitFor(() => expect(screen.getByText('jest not found')).toBeInTheDocument());
    });
  });
});
