import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Repository } from '../types/repository';
import { useSSE } from '../hooks/useSSE';
import { startScan, fetchScanLog } from '../api/repositories';
import { DebugLog } from './DebugLog';

const pct = (n: number) => `${Number(n.toFixed(2))}%`;

const ACTIVE_STATUSES = new Set<Repository['scanStatus']>([
  'CLONING',
  'SCANNING',
  'INSTALLING',
  'TESTING',
]);

interface RepoCardProps {
  repository: Repository;
}

function ScanStatusBadge({ status }: { status: Repository['scanStatus'] }) {
  const map: Record<
    Repository['scanStatus'],
    { label: string; variant: React.ComponentProps<typeof Badge>['variant'] }
  > = {
    NOT_STARTED: { label: 'not started', variant: 'muted' },
    CLONING: { label: 'cloning', variant: 'warning' },
    SCANNING: { label: 'scanning', variant: 'warning' },
    INSTALLING: { label: 'installing', variant: 'warning' },
    TESTING: { label: 'testing', variant: 'warning' },
    COMPLETE: { label: 'complete', variant: 'success' },
    FAILED: { label: 'failed', variant: 'destructive' },
  };
  const { label, variant } = map[status] ?? { label: status, variant: 'muted' };
  return <Badge variant={variant}>{label}</Badge>;
}


export function RepoCard({ repository: initial }: RepoCardProps) {
  const [repo, setRepo] = useState<Repository>(initial);
  const [logs, setLogs] = useState<string[]>([]);
  const [starting, setStarting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Load persisted log on mount (backend only returns lines when DEBUG_OUTPUT=true)
  useEffect(() => {
    fetchScanLog(repo.id).then((lines) => {
      if (lines.length > 0) setLogs(lines);
    });
  }, [repo.id]);

  useSSE(`/api/sse/repositories/${repo.id}`, {
    'repo:updated': (data) => {
      setRepo((r) => ({ ...r, ...(data as Partial<Repository>) }));
    },
    'scan:log': (data) => {
      const line =
        typeof data === 'string'
          ? data
          : typeof (data as { line?: string }).line === 'string'
            ? (data as { line: string }).line
            : JSON.stringify(data);
      setLogs((prev) => [...prev, line]);
    },
  });

  const handleScan = async () => {
    setActionError(null);
    setStarting(true);
    setLogs([]);
    try {
      await startScan(repo.id);
    } catch (err) {
      const apiErr = err as { message?: string };
      setActionError(apiErr.message ?? 'Failed to start scan.');
    } finally {
      setStarting(false);
    }
  };

  const { owner, name, url, scanStatus, scanError } = repo;
  const isActive = ACTIVE_STATUSES.has(scanStatus);

  const fields: { label: string; value: React.ReactNode }[] = [
    { label: 'Owner', value: owner },
    { label: 'Repository', value: name },
    {
      label: 'URL',
      value: (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline break-all"
        >
          {url}
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
    {
      label: 'Total TS coverage',
      value: repo.totalCoverage != null ? pct(repo.totalCoverage) : '—',
    },
    {
      label: 'Avg TS coverage',
      value: repo.avgCoverage != null ? pct(repo.avgCoverage) : '—',
    },
    {
      label: 'Min TS coverage',
      value: repo.minCoverage != null ? pct(repo.minCoverage.pct) : '—',
    },
    { label: 'Scan status', value: <ScanStatusBadge status={scanStatus} /> },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">
          {owner}/{name}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-sm">
          {fields.map(({ label, value }) => (
            <React.Fragment key={label}>
              <dt className="text-gray-500 whitespace-nowrap">{label}</dt>
              <dd className="text-gray-900">{value}</dd>
            </React.Fragment>
          ))}
        </dl>

        {scanStatus === 'FAILED' && scanError && (
          <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2">
            <p className="text-xs text-red-700 font-mono">{scanError}</p>
          </div>
        )}

        {actionError && (
          <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2">
            <p className="text-xs text-red-700">{actionError}</p>
          </div>
        )}

        {logs.length > 0 && <DebugLog lines={logs} />}

        <div className="flex items-center gap-2 pt-1">
          {(scanStatus === 'NOT_STARTED' || scanStatus === 'FAILED') && (
            <Button size="sm" variant="default" onClick={handleScan} disabled={starting}>
              {starting ? 'Starting…' : scanStatus === 'FAILED' ? 'Rescan' : 'Start Scan'}
            </Button>
          )}
          {scanStatus === 'COMPLETE' && (
            <Link
              to={`/repos/${repo.id}`}
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              View Details
            </Link>
          )}
          {isActive && (
            <span className="text-xs text-gray-400">Scan in progress…</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
