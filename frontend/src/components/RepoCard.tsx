import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Repository } from '../types/repository';

interface RepoCardProps {
  repository: Repository;
}

function ScanStatusBadge({ status }: { status: Repository['scanStatus'] }) {
  const map: Record<Repository['scanStatus'], { label: string; variant: React.ComponentProps<typeof Badge>['variant'] }> = {
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

export function RepoCard({ repository }: RepoCardProps) {
  const { owner, name, url, scanStatus, scanError } = repository;

  const fields: { label: string; value: React.ReactNode }[] = [
    { label: 'Owner', value: owner },
    { label: 'Repository', value: name },
    { label: 'URL', value: <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">{url}</a> },
    { label: 'Has TypeScript', value: 'true' },
    { label: 'Total TS files', value: repository.totalTsFiles ?? '—' },
    { label: 'Package manager', value: repository.packageManager ?? '—' },
    { label: 'Test framework', value: repository.testFramework ?? '—' },
    { label: 'Coverage framework', value: repository.coverageFramework ?? '—' },
    { label: 'Total TS coverage', value: repository.totalCoverage != null ? `${repository.totalCoverage}%` : '—' },
    { label: 'Avg TS coverage', value: repository.avgCoverage != null ? `${repository.avgCoverage}%` : '—' },
    { label: 'Min TS coverage', value: repository.minCoverage != null ? `${repository.minCoverage.pct}%` : '—' },
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

        <div className="flex gap-2 pt-1">
          {(scanStatus === 'NOT_STARTED' || scanStatus === 'FAILED') && (
            <Button size="sm" variant="default" disabled>
              {scanStatus === 'FAILED' ? 'Rescan' : 'Start Scan'}
            </Button>
          )}
          {scanStatus === 'COMPLETE' && (
            <Button size="sm" variant="outline" disabled>
              View Details
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
