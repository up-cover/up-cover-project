import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ImprovementJob, ImprovementStatus } from '../types/repository';
import { useSSE } from '../hooks/useSSE';
import { deleteImprovementJob } from '../api/repositories';
import { DebugLog } from './DebugLog';

const TERMINAL_STATUSES = new Set<ImprovementStatus>(['COMPLETE', 'FAILED', 'CANCELLED']);

function JobStatusBadge({ status }: { status: ImprovementStatus }) {
  const map: Record<ImprovementStatus, { label: string; variant: React.ComponentProps<typeof Badge>['variant'] }> = {
    QUEUED: { label: 'queued', variant: 'muted' },
    CLONING: { label: 'cloning', variant: 'warning' },
    GENERATING: { label: 'generating', variant: 'warning' },
    TESTING: { label: 'testing', variant: 'warning' },
    PUSHING: { label: 'pushing', variant: 'warning' },
    CREATING_PR: { label: 'creating PR', variant: 'warning' },
    COMPLETE: { label: 'complete', variant: 'success' },
    FAILED: { label: 'failed', variant: 'destructive' },
    CANCELLED: { label: 'cancelled', variant: 'muted' },
  };
  const { label, variant } = map[status] ?? { label: status.toLowerCase(), variant: 'muted' };
  return <Badge variant={variant}>{label}</Badge>;
}

interface ImprovementJobEntryProps {
  initialJob: ImprovementJob;
  onJobUpdated: (job: ImprovementJob) => void;
  onRemoved: (jobId: string) => void;
}

export function ImprovementJobEntry({ initialJob, onJobUpdated, onRemoved }: ImprovementJobEntryProps) {
  const [job, setJob] = useState<ImprovementJob>(initialJob);
  const [logs, setLogs] = useState<string[]>(() =>
    initialJob.logOutput ? initialJob.logOutput.split('\n').filter((l) => l.length > 0) : [],
  );
  const [removing, setRemoving] = useState(false);

  const isTerminal = TERMINAL_STATUSES.has(job.status);

  useSSE(isTerminal ? null : `/api/sse/improvement-jobs/${job.id}`, {
    'job:updated': (data) => {
      const updated = { ...job, ...(data as Partial<ImprovementJob>) };
      setJob(updated);
      onJobUpdated(updated);
    },
    'job:log': (data) => {
      const line =
        typeof data === 'string'
          ? data
          : typeof (data as { line?: string }).line === 'string'
            ? (data as { line: string }).line
            : JSON.stringify(data);
      setLogs((prev) => [...prev, line]);
    },
  });

  const handleRemove = async () => {
    setRemoving(true);
    try {
      await deleteImprovementJob(job.id);
      onRemoved(job.id);
    } catch {
      setRemoving(false);
    }
  };

  return (
    <div className="flex flex-col gap-1.5 py-2 border-b border-gray-100 last:border-0">
      <div className="flex items-center gap-2 text-xs flex-wrap">
        <JobStatusBadge status={job.status} />
        <span className="text-gray-400 font-mono">{job.id.slice(0, 8)}</span>
        {job.status === 'COMPLETE' && job.prUrl && (
          <a
            href={job.prUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            View PR →
          </a>
        )}
        <div className="ml-auto">
          <Button size="sm" variant="outline" onClick={handleRemove} disabled={removing}>
            {removing ? 'Removing…' : 'Remove'}
          </Button>
        </div>
      </div>
      {job.status === 'FAILED' && job.errorMessage && (
        <div className="rounded bg-red-50 border border-red-200 px-2 py-1">
          <p className="text-xs text-red-700 font-mono whitespace-pre-wrap">{job.errorMessage}</p>
        </div>
      )}
      {logs.length > 0 && <DebugLog lines={logs} />}
    </div>
  );
}
