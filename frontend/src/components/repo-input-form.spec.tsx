import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { RepoInputForm } from './RepoInputForm';
import * as api from '../api/repositories';
import { Repository } from '../types/repository';

vi.mock('../api/repositories');

const mockRegister = vi.mocked(api.registerRepository);

function makeRepo(overrides: Partial<Repository> = {}): Repository {
  return {
    id: '1',
    owner: 'owner',
    name: 'repo',
    url: 'https://github.com/owner/repo',
    hasTypeScript: true,
    totalTsFiles: 10,
    packageManager: 'npm',
    testFramework: 'jest',
    coverageFramework: 'istanbul',
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

describe('RepoInputForm', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    user = userEvent.setup();
    mockRegister.mockReset();
  });

  // ---------------------------------------------------------------------------
  describe('rendering', () => {
    it('renders the input and submit button', () => {
      render(<RepoInputForm onRegistered={vi.fn()} />);
      expect(screen.getByRole('textbox')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /add repository/i })).toBeInTheDocument();
    });

    it('submit button is disabled when input is empty', () => {
      render(<RepoInputForm onRegistered={vi.fn()} />);
      expect(screen.getByRole('button', { name: /add repository/i })).toBeDisabled();
    });

    it('submit button is disabled while loading', async () => {
      let resolveRegister: (r: Repository) => void;
      mockRegister.mockReturnValue(new Promise((res) => { resolveRegister = res; }));

      render(<RepoInputForm onRegistered={vi.fn()} />);
      await user.type(screen.getByRole('textbox'), 'owner/repo');
      await user.click(screen.getByRole('button', { name: /add repository/i }));

      expect(screen.getByRole('button', { name: /adding/i })).toBeDisabled();

      resolveRegister!(makeRepo());
    });

    it('shows "Adding…" text on the button while loading', async () => {
      mockRegister.mockReturnValue(new Promise(() => {}));
      render(<RepoInputForm onRegistered={vi.fn()} />);
      await user.type(screen.getByRole('textbox'), 'owner/repo');
      await user.click(screen.getByRole('button'));
      expect(screen.getByText('Adding…')).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  describe('input validation', () => {
    it('shows an error for invalid input (no URL, no slug)', async () => {
      render(<RepoInputForm onRegistered={vi.fn()} />);
      await user.type(screen.getByRole('textbox'), 'justplaintext');
      await user.click(screen.getByRole('button'));
      expect(screen.getByText(/enter a valid github url/i)).toBeInTheDocument();
    });

    it('does not call registerRepository for invalid input', async () => {
      render(<RepoInputForm onRegistered={vi.fn()} />);
      await user.type(screen.getByRole('textbox'), 'invalid');
      await user.click(screen.getByRole('button'));
      expect(mockRegister).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  describe('URL parsing', () => {
    it('parses a full HTTPS URL: https://github.com/owner/repo', async () => {
      mockRegister.mockResolvedValue(makeRepo());
      render(<RepoInputForm onRegistered={vi.fn()} />);
      await user.type(screen.getByRole('textbox'), 'https://github.com/owner/repo');
      await user.click(screen.getByRole('button'));
      await waitFor(() => expect(mockRegister).toHaveBeenCalledWith('owner', 'repo'));
    });

    it('parses a URL with trailing path', async () => {
      mockRegister.mockResolvedValue(makeRepo());
      render(<RepoInputForm onRegistered={vi.fn()} />);
      await user.type(screen.getByRole('textbox'), 'https://github.com/owner/repo/tree/main');
      await user.click(screen.getByRole('button'));
      await waitFor(() => expect(mockRegister).toHaveBeenCalledWith('owner', 'repo'));
    });

    it('parses an owner/repo slug', async () => {
      mockRegister.mockResolvedValue(makeRepo());
      render(<RepoInputForm onRegistered={vi.fn()} />);
      await user.type(screen.getByRole('textbox'), 'owner/repo');
      await user.click(screen.getByRole('button'));
      await waitFor(() => expect(mockRegister).toHaveBeenCalledWith('owner', 'repo'));
    });

    it('rejects a bare repo name (no slash)', async () => {
      render(<RepoInputForm onRegistered={vi.fn()} />);
      await user.type(screen.getByRole('textbox'), 'justarepo');
      await user.click(screen.getByRole('button'));
      expect(screen.getByText(/enter a valid github url/i)).toBeInTheDocument();
      expect(mockRegister).not.toHaveBeenCalled();
    });

    it('rejects input with leading/trailing whitespace after trim (invalid)', async () => {
      render(<RepoInputForm onRegistered={vi.fn()} />);
      await user.type(screen.getByRole('textbox'), '   notaslug   ');
      await user.click(screen.getByRole('button'));
      expect(screen.getByText(/enter a valid github url/i)).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  describe('success flow', () => {
    it('calls onRegistered with the returned repo on success', async () => {
      const onRegistered = vi.fn();
      const repo = makeRepo({ id: '42', name: 'my-project' });
      mockRegister.mockResolvedValue(repo);

      render(<RepoInputForm onRegistered={onRegistered} />);
      await user.type(screen.getByRole('textbox'), 'owner/my-project');
      await user.click(screen.getByRole('button'));

      await waitFor(() => expect(onRegistered).toHaveBeenCalledWith(repo));
    });

    it('clears the input on successful registration', async () => {
      mockRegister.mockResolvedValue(makeRepo());
      render(<RepoInputForm onRegistered={vi.fn()} />);
      const input = screen.getByRole('textbox');
      await user.type(input, 'owner/repo');
      await user.click(screen.getByRole('button'));
      await waitFor(() => expect(input).toHaveValue(''));
    });

    it('resets loading state after success', async () => {
      mockRegister.mockResolvedValue(makeRepo());
      render(<RepoInputForm onRegistered={vi.fn()} />);
      await user.type(screen.getByRole('textbox'), 'owner/repo');
      await user.click(screen.getByRole('button'));
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /add repository/i })).toBeInTheDocument(),
      );
    });
  });

  // ---------------------------------------------------------------------------
  describe('error flow', () => {
    it('displays API error message on failure', async () => {
      mockRegister.mockRejectedValue({ error: 'REPO_NOT_FOUND', message: 'Repository not found.' });
      render(<RepoInputForm onRegistered={vi.fn()} />);
      await user.type(screen.getByRole('textbox'), 'owner/missing');
      await user.click(screen.getByRole('button'));
      await waitFor(() => expect(screen.getByText('Repository not found.')).toBeInTheDocument());
    });

    it('resets loading state after API error', async () => {
      mockRegister.mockRejectedValue({ error: 'ERR', message: 'Something went wrong.' });
      render(<RepoInputForm onRegistered={vi.fn()} />);
      await user.type(screen.getByRole('textbox'), 'owner/repo');
      await user.click(screen.getByRole('button'));
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /add repository/i })).not.toBeDisabled(),
      );
    });
  });
});
