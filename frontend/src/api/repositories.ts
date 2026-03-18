import { Repository, ApiError } from '../types/repository';

export async function registerRepository(
  owner: string,
  repo: string,
): Promise<Repository> {
  const res = await fetch('/api/repositories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ owner, repo }),
  });

  const data = await res.json();

  if (!res.ok) {
    const err: ApiError = {
      error: data.error ?? 'UNKNOWN_ERROR',
      message: data.message ?? 'An unexpected error occurred.',
    };
    throw err;
  }

  return data as Repository;
}

export async function listRepositories(): Promise<Repository[]> {
  const res = await fetch('/api/repositories');
  if (!res.ok) {
    throw new Error('Failed to load repositories');
  }
  return res.json();
}

export async function fetchScanLog(id: string): Promise<string[]> {
  const res = await fetch(`/api/repositories/${id}/scan-log`);
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data.lines) ? data.lines : [];
}

export async function startScan(id: string): Promise<void> {
  const res = await fetch(`/api/repositories/${id}/scan`, { method: 'POST' });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const err: ApiError = {
      error: data.error ?? 'UNKNOWN_ERROR',
      message: data.message ?? 'Failed to start scan.',
    };
    throw err;
  }
}
