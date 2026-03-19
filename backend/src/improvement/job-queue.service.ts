import { Injectable } from '@nestjs/common';

interface QueueItem {
  jobId: string;
  runner: () => Promise<void>;
}

/**
 * Per-repo in-memory job queue. Serializes improvement jobs so only one runs
 * per repository at a time. Queued jobs that have not started yet can be
 * dequeued (for cancellation) without affecting the running job.
 */
@Injectable()
export class JobQueueService {
  private readonly queues = new Map<string, QueueItem[]>();
  private readonly running = new Set<string>();

  enqueue(repositoryId: string, jobId: string, runner: () => Promise<void>): void {
    if (!this.queues.has(repositoryId)) {
      this.queues.set(repositoryId, []);
    }
    this.queues.get(repositoryId)!.push({ jobId, runner });
    this.processNext(repositoryId);
  }

  /** Remove a waiting (not-yet-started) job from the queue. Returns true if removed. */
  dequeueIfWaiting(repositoryId: string, jobId: string): boolean {
    const queue = this.queues.get(repositoryId);
    if (!queue) return false;
    const idx = queue.findIndex((item) => item.jobId === jobId);
    if (idx === -1) return false;
    queue.splice(idx, 1);
    return true;
  }

  private processNext(repositoryId: string): void {
    if (this.running.has(repositoryId)) return;
    const queue = this.queues.get(repositoryId);
    if (!queue || queue.length === 0) return;

    const item = queue.shift()!;
    this.running.add(repositoryId);

    item.runner().finally(() => {
      this.running.delete(repositoryId);
      this.processNext(repositoryId);
    });
  }
}
