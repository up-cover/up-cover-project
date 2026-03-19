import { Repository, CoverageFilesPage, ApiError, ImprovementJob } from '../types/repository';

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

export async function fetchRepository(id: string): Promise<Repository> {
  const res = await fetch(`/api/repositories/${id}`);
  if (!res.ok) throw new Error('Failed to load repository');
  return res.json();
}

export async function fetchCoverageFiles(id: string, page = 1, limit = 50): Promise<CoverageFilesPage> {
  const res = await fetch(`/api/repositories/${id}/coverage-files?page=${page}&limit=${limit}`);
  if (!res.ok) throw new Error('Failed to load coverage files');
  return res.json();
}

export async function fetchImprovementJobsForFile(repoId: string, fileId: string): Promise<ImprovementJob[]> {
  const res = await fetch(`/api/repositories/${repoId}/files/${fileId}/improvement-jobs`);
  if (!res.ok) throw new Error('Failed to load improvement jobs');
  return res.json();
}

export async function startImprovement(repoId: string, fileId: string): Promise<ImprovementJob> {
  const res = await fetch(`/api/repositories/${repoId}/files/${fileId}/improve`, { method: 'POST' });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const err: ApiError = {
      error: (data as { error?: string }).error ?? 'UNKNOWN_ERROR',
      message: (data as { message?: string }).message ?? 'Failed to start improvement job.',
    };
    throw err;
  }
  return res.json();
}

export async function deleteImprovementJob(jobId: string): Promise<void> {
  const res = await fetch(`/api/improvement-jobs/${jobId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to cancel improvement job.');
}

export async function deleteRepository(id: string): Promise<void> {
  const res = await fetch(`/api/repositories/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const err: ApiError = {
      error: (data as { error?: string }).error ?? 'UNKNOWN_ERROR',
      message: (data as { message?: string }).message ?? 'Failed to remove repository.',
    };
    throw err;
  }
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
