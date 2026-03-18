import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Repository, CoverageFile, CoverageFilesPage } from '../types/repository';
import { fetchRepository, fetchCoverageFiles } from '../api/repositories';
import { CoverageFileTable } from '../components/CoverageFileTable';

const pct = (n: number) => `${Number(n.toFixed(2))}%`;

function MetaGrid({ repo }: { repo: Repository }) {
  const fields: { label: string; value: React.ReactNode }[] = [
    { label: 'Owner', value: repo.owner },
    { label: 'Repository', value: repo.name },
    {
      label: 'URL',
      value: (
        <a href={repo.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">
          {repo.url}
        </a>
      ),
    },
    { label: 'Has TypeScript', value: 'true' },
    { label: 'Total TS files', value: repo.totalTsFiles ?? '—' },
    {
      label: 'Package manager',
      value: repo.packageManager ? <Badge variant="success">{repo.packageManager}</Badge> : '—',
    },
    {
      label: 'Test framework',
      value: repo.testFramework ? <Badge variant="success">{repo.testFramework}</Badge> : '—',
    },
    {
      label: 'Coverage framework',
      value: repo.coverageFramework ? <Badge variant="success">{repo.coverageFramework}</Badge> : '—',
    },
    { label: 'Total TS coverage', value: repo.totalCoverage != null ? pct(repo.totalCoverage) : '—' },
    { label: 'Avg TS coverage', value: repo.avgCoverage != null ? pct(repo.avgCoverage) : '—' },
    { label: 'Min TS coverage', value: repo.minCoverage != null ? pct(repo.minCoverage.pct) : '—' },
    { label: 'Scan status', value: <Badge variant="success">{repo.scanStatus.toLowerCase().replace('_', ' ')}</Badge> },
  ];

  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
      {fields.map(({ label, value }) => (
        <React.Fragment key={label}>
          <dt className="text-gray-500 whitespace-nowrap">{label}</dt>
          <dd className="text-gray-900">{value}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

export function RepoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [repo, setRepo] = useState<Repository | null>(null);
  const [filesPage, setFilesPage] = useState<CoverageFilesPage | null>(null);
  const [page, setPage] = useState(1);
  const [repoError, setRepoError] = useState<string | null>(null);
  const [filesError, setFilesError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setRepoError(null);
    fetchRepository(id)
      .then(setRepo)
      .catch(() => setRepoError('Failed to load repository.'));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    setFilesError(null);
    fetchCoverageFiles(id, page)
      .then(setFilesPage)
      .catch(() => setFilesError('Failed to load coverage files.'));
  }, [id, page]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      <Link to="/" className="text-sm text-blue-600 hover:underline">
        ← Back to repositories
      </Link>

      {repoError && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {repoError}
        </div>
      )}

      {repo && (
        <section className="space-y-3">
          <h1 className="text-xl font-semibold">
            {repo.owner}/{repo.name}
          </h1>
          <MetaGrid repo={repo} />
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Coverage Files</h2>

        {filesError && (
          <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {filesError}
          </div>
        )}

        {filesPage && (
          <CoverageFileTable
            files={filesPage.items}
            total={filesPage.total}
            page={filesPage.page}
            limit={filesPage.limit}
            onPageChange={setPage}
          />
        )}

        {!filesPage && !filesError && (
          <p className="text-sm text-gray-400">Loading coverage data…</p>
        )}
      </section>
    </div>
  );
}
