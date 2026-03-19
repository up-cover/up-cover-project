import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RepoInputForm } from '../components/RepoInputForm';
import { RepoCard } from '../components/RepoCard';
import { listRepositories } from '../api/repositories';
import { Repository } from '../types/repository';

export function LandingPage() {
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchRepos = useCallback(() => {
    listRepositories()
      .then(setRepositories)
      .catch(() => setLoadError('Failed to load repositories.'));
  }, []);

  useEffect(() => {
    fetchRepos();
  }, [fetchRepos]);

  const handleRegistered = (repo: Repository) => {
    setRepositories((prev) => [repo, ...prev]);
  };

  const parentRepos = repositories.filter((r) => r.parentRepositoryId === null);
  const childrenByParent = new Map<string, Repository[]>();
  for (const r of repositories) {
    if (r.parentRepositoryId !== null) {
      const arr = childrenByParent.get(r.parentRepositoryId) ?? [];
      arr.push(r);
      childrenByParent.set(r.parentRepositoryId, arr);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-3xl space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">UpCover</h1>
          <p className="mt-1 text-sm text-gray-500">Automated test coverage generator</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add a Repository</CardTitle>
          </CardHeader>
          <CardContent>
            <RepoInputForm onRegistered={handleRegistered} />
          </CardContent>
        </Card>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-800">Repositories</h2>

          {loadError && (
            <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2">
              <p className="text-sm text-red-700">{loadError}</p>
            </div>
          )}

          {parentRepos.length === 0 && !loadError && (
            <p className="text-sm text-gray-400">No repositories added yet.</p>
          )}

          {parentRepos.map((repo) => {
            const children = childrenByParent.get(repo.id) ?? [];
            return (
              <div key={repo.id} className="space-y-2">
                <RepoCard
                  repository={repo}
                  childCount={children.length}
                  onRemoved={() =>
                    setRepositories((prev) =>
                      prev.filter((r) => r.id !== repo.id && r.parentRepositoryId !== repo.id),
                    )
                  }
                  onScanComplete={fetchRepos}
                />
                {children.length > 0 && (
                  <div className="ml-6 space-y-2">
                    {children.map((child) => (
                      <RepoCard
                        key={child.id}
                        repository={child}
                        onRemoved={() =>
                          setRepositories((prev) => prev.filter((r) => r.id !== child.id))
                        }
                        onScanComplete={fetchRepos}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </section>
      </div>
    </div>
  );
}
