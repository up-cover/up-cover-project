import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RepoInputForm } from '../components/RepoInputForm';
import { RepoCard } from '../components/RepoCard';
import { listRepositories } from '../api/repositories';
import { Repository } from '../types/repository';

export function LandingPage() {
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    listRepositories()
      .then(setRepositories)
      .catch(() => setLoadError('Failed to load repositories.'));
  }, []);

  const handleRegistered = (repo: Repository) => {
    setRepositories((prev) => [repo, ...prev]);
  };

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

          {repositories.length === 0 && !loadError && (
            <p className="text-sm text-gray-400">No repositories added yet.</p>
          )}

          {repositories.map((repo) => (
            <RepoCard key={repo.id} repository={repo} />
          ))}
        </section>
      </div>
    </div>
  );
}
