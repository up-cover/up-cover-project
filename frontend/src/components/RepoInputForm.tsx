import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { registerRepository } from '../api/repositories';
import { Repository, ApiError } from '../types/repository';

interface RepoInputFormProps {
  onRegistered: (repo: Repository) => void;
}

function normalizeInput(raw: string): { owner: string; repo: string } | null {
  const trimmed = raw.trim();

  // https://github.com/owner/repo[/anything...]
  const urlMatch = trimmed.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)/);
  if (urlMatch) {
    return { owner: urlMatch[1], repo: urlMatch[2] };
  }

  // owner/repo
  const slugMatch = trimmed.match(/^([^/]+)\/([^/]+)$/);
  if (slugMatch) {
    return { owner: slugMatch[1], repo: slugMatch[2] };
  }

  return null;
}

export function RepoInputForm({ onRegistered }: RepoInputFormProps) {
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const parsed = normalizeInput(value);
    if (!parsed) {
      setError('Enter a valid GitHub URL (https://github.com/owner/repo) or owner/repo.');
      return;
    }

    setLoading(true);
    try {
      const repo = await registerRepository(parsed.owner, parsed.repo);
      setValue('');
      onRegistered(repo);
    } catch (err) {
      const apiErr = err as ApiError;
      setError(apiErr.message ?? 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex gap-2">
        <Input
          placeholder="https://github.com/owner/repo or owner/repo"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={loading}
          className="flex-1"
        />
        <Button type="submit" disabled={loading || !value.trim()}>
          {loading ? 'Adding…' : 'Add Repository'}
        </Button>
      </div>
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
    </form>
  );
}
