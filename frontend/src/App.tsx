import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type HealthStatus = {
  status: string;
} | null;

type FetchState = 'idle' | 'loading' | 'success' | 'error';

function App() {
  const [health, setHealth] = useState<HealthStatus>(null);
  const [fetchState, setFetchState] = useState<FetchState>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');

  const checkHealth = async () => {
    setFetchState('loading');
    setErrorMessage('');
    try {
      const res = await fetch('/api/health');
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const data = await res.json();
      setHealth(data);
      setFetchState('success');
    } catch (err) {
      setFetchState('error');
      setErrorMessage(err instanceof Error ? err.message : 'Unknown error occurred');
      setHealth(null);
    }
  };

  useEffect(() => {
    checkHealth();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">UpCover</h1>
          <p className="mt-1 text-sm text-gray-500">Automated test coverage generator</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              API Health Check
              <span
                className={cn(
                  'inline-block h-2.5 w-2.5 rounded-full ml-auto',
                  fetchState === 'success' && 'bg-green-500',
                  fetchState === 'error' && 'bg-red-500',
                  fetchState === 'loading' && 'bg-yellow-400 animate-pulse',
                  fetchState === 'idle' && 'bg-gray-300',
                )}
              />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {fetchState === 'loading' && (
              <p className="text-sm text-muted-foreground">Connecting to backend...</p>
            )}

            {fetchState === 'success' && health && (
              <div className="rounded-md bg-green-50 border border-green-200 p-3">
                <p className="text-sm font-medium text-green-800">Backend reachable</p>
                <pre className="mt-1 text-xs text-green-700 font-mono">
                  {JSON.stringify(health, null, 2)}
                </pre>
              </div>
            )}

            {fetchState === 'error' && (
              <div className="rounded-md bg-red-50 border border-red-200 p-3">
                <p className="text-sm font-medium text-red-800">Failed to reach backend</p>
                <p className="mt-1 text-xs text-red-600 font-mono">{errorMessage}</p>
              </div>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={checkHealth}
              disabled={fetchState === 'loading'}
              className="w-full"
            >
              {fetchState === 'loading' ? 'Checking...' : 'Re-check'}
            </Button>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-gray-400">
          Backend: <code className="font-mono">http://localhost:3000</code>
        </p>
      </div>
    </div>
  );
}

export default App;
