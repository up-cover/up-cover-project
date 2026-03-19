import { JobQueueService } from './job-queue.service';

describe('JobQueueService', () => {
  let service: JobQueueService;

  beforeEach(() => {
    service = new JobQueueService();
  });

  // ---------------------------------------------------------------------------
  describe('enqueue — basic sequencing', () => {
    it('immediately starts the first job for a new repository', async () => {
      const started: string[] = [];
      let resolve: () => void;
      const p = new Promise<void>((res) => { resolve = res; });

      service.enqueue('repo-1', 'job-1', async () => {
        started.push('job-1');
        await p;
      });

      // Give microtasks a tick to settle
      await Promise.resolve();
      expect(started).toEqual(['job-1']);
      resolve!();
    });

    it('does not start second job until first resolves', async () => {
      const started: string[] = [];
      let resolveFirst: () => void;
      const firstDone = new Promise<void>((res) => { resolveFirst = res; });

      service.enqueue('repo-1', 'job-1', async () => {
        started.push('job-1');
        await firstDone;
      });
      service.enqueue('repo-1', 'job-2', async () => {
        started.push('job-2');
      });

      await Promise.resolve();
      expect(started).toEqual(['job-1']);

      resolveFirst!();
      // Wait for the .finally chain to process
      await new Promise((res) => setTimeout(res, 0));
      expect(started).toEqual(['job-1', 'job-2']);
    });

    it('queues third job while second is running and runs it after', async () => {
      const order: number[] = [];
      const resolvers: Array<() => void> = [];

      for (let i = 1; i <= 3; i++) {
        const idx = i;
        service.enqueue('repo-1', `job-${i}`, async () => {
          order.push(idx);
          await new Promise<void>((res) => { resolvers[idx - 1] = res; });
        });
      }

      await Promise.resolve();
      resolvers[0]();
      await new Promise((res) => setTimeout(res, 0));
      resolvers[1]();
      await new Promise((res) => setTimeout(res, 0));
      resolvers[2]();
      await new Promise((res) => setTimeout(res, 0));

      expect(order).toEqual([1, 2, 3]);
    });

    it('starts next job after current job completes with internal error (caught by runner)', async () => {
      // Real runners (ImprovementOrchestrator) catch their own errors and update
      // job status before resolving — they do not let the promise propagate a rejection.
      // The queue relies on .finally() which fires regardless; we verify the queue
      // unblocks whether the runner succeeds or handles its own error.
      const started: string[] = [];

      service.enqueue('repo-1', 'job-1', async () => {
        started.push('job-1');
        try {
          throw new Error('runner internal error');
        } catch {
          // Runner catches its own error (as real runners do)
        }
      });
      service.enqueue('repo-1', 'job-2', async () => {
        started.push('job-2');
      });

      await new Promise((res) => setTimeout(res, 0));
      expect(started).toEqual(['job-1', 'job-2']);
    });

    it('creates independent queues per repository ID', async () => {
      const started: string[] = [];
      const resolvers: Record<string, () => void> = {};

      service.enqueue('repo-A', 'job-A1', async () => {
        started.push('A1');
        await new Promise<void>((res) => { resolvers['A1'] = res; });
      });
      service.enqueue('repo-B', 'job-B1', async () => {
        started.push('B1');
        await new Promise<void>((res) => { resolvers['B1'] = res; });
      });

      await Promise.resolve();
      // Both should start immediately since they're in different queues
      expect(started.sort()).toEqual(['A1', 'B1'].sort());

      resolvers['A1']();
      resolvers['B1']();
    });
  });

  // ---------------------------------------------------------------------------
  describe('dequeueIfWaiting', () => {
    it('returns false for unknown repositoryId', () => {
      expect(service.dequeueIfWaiting('nonexistent', 'job-1')).toBe(false);
    });

    it('returns false for jobId not in queue', () => {
      service.enqueue('repo-1', 'job-1', async () => {});
      expect(service.dequeueIfWaiting('repo-1', 'job-99')).toBe(false);
    });

    it('returns true and removes a waiting (not-yet-started) job', async () => {
      let resolveFirst: () => void;
      const firstDone = new Promise<void>((res) => { resolveFirst = res; });
      const secondRan: boolean[] = [];

      service.enqueue('repo-1', 'job-1', async () => { await firstDone; });
      service.enqueue('repo-1', 'job-2', async () => { secondRan.push(true); });

      await Promise.resolve();
      // job-2 is waiting; dequeue it
      expect(service.dequeueIfWaiting('repo-1', 'job-2')).toBe(true);

      resolveFirst!();
      await new Promise((res) => setTimeout(res, 0));
      // job-2 should never have run
      expect(secondRan).toHaveLength(0);
    });

    it('returns false for the currently-running job (already shifted from queue)', async () => {
      let resolveFirst: () => void;
      const firstDone = new Promise<void>((res) => { resolveFirst = res; });

      service.enqueue('repo-1', 'job-1', async () => { await firstDone; });

      await Promise.resolve();
      // job-1 is running (shifted from queue); dequeue should not find it
      expect(service.dequeueIfWaiting('repo-1', 'job-1')).toBe(false);

      resolveFirst!();
    });

    it('removes the correct job when multiple are waiting', async () => {
      let resolveFirst: () => void;
      const firstDone = new Promise<void>((res) => { resolveFirst = res; });
      const ran: string[] = [];

      service.enqueue('repo-1', 'job-1', async () => { await firstDone; });
      service.enqueue('repo-1', 'job-2', async () => { ran.push('job-2'); });
      service.enqueue('repo-1', 'job-3', async () => { ran.push('job-3'); });

      await Promise.resolve();
      expect(service.dequeueIfWaiting('repo-1', 'job-2')).toBe(true);

      resolveFirst!();
      await new Promise((res) => setTimeout(res, 0));
      // job-3 should still run, job-2 should not
      expect(ran).toEqual(['job-3']);
    });
  });

  // ---------------------------------------------------------------------------
  describe('cancellation integration', () => {
    it('job removed via dequeueIfWaiting never executes its runner', async () => {
      let resolveFirst: () => void;
      const firstDone = new Promise<void>((res) => { resolveFirst = res; });
      const cancelledRan = jest.fn();

      service.enqueue('repo-1', 'job-1', async () => { await firstDone; });
      service.enqueue('repo-1', 'cancelled', async () => { cancelledRan(); });

      await Promise.resolve();
      service.dequeueIfWaiting('repo-1', 'cancelled');

      resolveFirst!();
      await new Promise((res) => setTimeout(res, 0));

      expect(cancelledRan).not.toHaveBeenCalled();
    });

    it('runner for job after removed job still executes', async () => {
      let resolveFirst: () => void;
      const firstDone = new Promise<void>((res) => { resolveFirst = res; });
      const afterRan = jest.fn();

      service.enqueue('repo-1', 'job-1', async () => { await firstDone; });
      service.enqueue('repo-1', 'cancelled', async () => {});
      service.enqueue('repo-1', 'job-after', async () => { afterRan(); });

      await Promise.resolve();
      service.dequeueIfWaiting('repo-1', 'cancelled');

      resolveFirst!();
      await new Promise((res) => setTimeout(res, 0));

      expect(afterRan).toHaveBeenCalledTimes(1);
    });
  });
});
