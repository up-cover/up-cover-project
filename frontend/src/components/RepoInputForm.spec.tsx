import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RepoInputForm } from './RepoInputForm';
import * as api from '../api/repositories';
import { Repository } from '../types/repository';

vi.mock('../api/repositories');

const mockRepo: Repository = {
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
};

describe('RepoInputForm', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders the input and submit button', () => {
    render(<RepoInputForm onRegistered={vi.fn()} />);
    expect(screen.getByPlaceholderText(/owner\/repo/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add repository/i })).toBeInTheDocument();
  });

  it('disables submit button when input is empty', () => {
    render(<RepoInputForm onRegistered={vi.fn()} />);
    expect(screen.getByRole('button', { name: /add repository/i })).toBeDisabled();
  });

  it('shows validation error for invalid input (no slash)', async () => {
    render(<RepoInputForm onRegistered={vi.fn()} />);
    await userEvent.type(screen.getByRole('textbox'), 'invalid-no-slash');
    fireEvent.submit(screen.getByRole('button', { name: /add repository/i }).closest('form')!);
    expect(
      await screen.findByText(/Enter a valid GitHub URL/i),
    ).toBeInTheDocument();
  });

  it('accepts owner/repo format and calls registerRepository', async () => {
    vi.mocked(api.registerRepository).mockResolvedValue(mockRepo);
    const onRegistered = vi.fn();
    render(<RepoInputForm onRegistered={onRegistered} />);
    await userEvent.type(screen.getByRole('textbox'), 'acme/myrepo');
    fireEvent.click(screen.getByRole('button', { name: /add repository/i }));
    await waitFor(() => expect(api.registerRepository).toHaveBeenCalledWith('acme', 'myrepo'));
  });

  it('accepts full GitHub URL format and calls registerRepository', async () => {
    vi.mocked(api.registerRepository).mockResolvedValue(mockRepo);
    const onRegistered = vi.fn();
    render(<RepoInputForm onRegistered={onRegistered} />);
    await userEvent.type(screen.getByRole('textbox'), 'https://github.com/acme/myrepo');
    fireEvent.click(screen.getByRole('button', { name: /add repository/i }));
    await waitFor(() => expect(api.registerRepository).toHaveBeenCalledWith('acme', 'myrepo'));
  });

  it('calls onRegistered with the returned repo on success', async () => {
    vi.mocked(api.registerRepository).mockResolvedValue(mockRepo);
    const onRegistered = vi.fn();
    render(<RepoInputForm onRegistered={onRegistered} />);
    await userEvent.type(screen.getByRole('textbox'), 'acme/myrepo');
    fireEvent.click(screen.getByRole('button', { name: /add repository/i }));
    await waitFor(() => expect(onRegistered).toHaveBeenCalledWith(mockRepo));
  });

  it('clears the input on successful registration', async () => {
    vi.mocked(api.registerRepository).mockResolvedValue(mockRepo);
    render(<RepoInputForm onRegistered={vi.fn()} />);
    const input = screen.getByRole('textbox');
    await userEvent.type(input, 'acme/myrepo');
    fireEvent.click(screen.getByRole('button', { name: /add repository/i }));
    await waitFor(() => expect(input).toHaveValue(''));
  });

  it('shows API error message on failed registration', async () => {
    vi.mocked(api.registerRepository).mockRejectedValue({ message: 'Repository not found.' });
    render(<RepoInputForm onRegistered={vi.fn()} />);
    await userEvent.type(screen.getByRole('textbox'), 'acme/myrepo');
    fireEvent.click(screen.getByRole('button', { name: /add repository/i }));
    expect(await screen.findByText('Repository not found.')).toBeInTheDocument();
  });

  it('disables form during loading state', async () => {
    let resolve: (r: Repository) => void;
    vi.mocked(api.registerRepository).mockImplementation(
      () => new Promise((res) => { resolve = res; }),
    );
    render(<RepoInputForm onRegistered={vi.fn()} />);
    await userEvent.type(screen.getByRole('textbox'), 'acme/myrepo');
    fireEvent.click(screen.getByRole('button', { name: /add repository/i }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /adding/i })).toBeDisabled(),
    );
    resolve!(mockRepo);
  });
});
