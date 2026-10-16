import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';

export interface JobOptions {
  /** Total attempts including the first one. */
  attempts?: number;
  /** Base delay for exponential backoff (ms). */
  backoffMs?: number;
}

type Handler = (payload: any) => Promise<void>;
type DeadLetterHook = (
  name: string,
  payload: unknown,
  error: Error,
) => Promise<void> | void;

/**
 * Background jobs with retry + exponential backoff + dead-letter hook.
 * - REDIS_URL set → BullMQ (durable, multi-instance).
 * - otherwise     → in-process queue (dev/tests; jobs are lost on restart).
 */
@Injectable()
export class JobQueueService implements OnModuleDestroy {
  private readonly logger = new Logger('Jobs');
  private readonly handlers = new Map<
    string,
    { handler: Handler; opts: Required<JobOptions> }
  >();
  private readonly pending = new Set<Promise<void>>();
  private readonly redisUrl?: string;
  private readonly queues = new Map<string, Queue>();
  private readonly workers: Worker[] = [];
  private deadLetterHook?: DeadLetterHook;

  constructor(config: ConfigService) {
    this.redisUrl = config.get<string>('REDIS_URL') || undefined;
  }

  register(name: string, handler: Handler, opts: JobOptions = {}) {
    const full = {
      attempts: opts.attempts ?? 5,
      backoffMs: opts.backoffMs ?? 2_000,
    };
    this.handlers.set(name, { handler, opts: full });
    if (this.redisUrl) {
      const connection = { url: this.redisUrl };
      this.queues.set(name, new Queue(name, { connection }));
      const worker = new Worker(name, async (job) => handler(job.data), {
        connection,
      });
      worker.on('failed', (job, err) => {
        if (job && job.attemptsMade >= (job.opts.attempts ?? 1))
          void this.deadLetter(name, job.data, err);
      });
      this.workers.push(worker);
    }
  }

  onDeadLetter(hook: DeadLetterHook) {
    this.deadLetterHook = hook;
  }

  async enqueue(name: string, payload: unknown, delayMs = 0): Promise<void> {
    const entry = this.handlers.get(name);
    if (!entry) throw new Error(`No handler registered for job "${name}"`);
    const queue = this.queues.get(name);
    if (queue) {
      await queue.add(name, payload, {
        attempts: entry.opts.attempts,
        backoff: { type: 'exponential', delay: entry.opts.backoffMs },
        delay: delayMs,
        removeOnComplete: 1000,
        removeOnFail: 5000,
      });
      return;
    }
    this.track(this.runInProcess(name, entry, payload, 1, delayMs));
  }

  private track(p: Promise<void>) {
    this.pending.add(p);
    void p.finally(() => this.pending.delete(p));
  }

  private async runInProcess(
    name: string,
    entry: { handler: Handler; opts: Required<JobOptions> },
    payload: unknown,
    attempt: number,
    delayMs: number,
  ): Promise<void> {
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    try {
      await entry.handler(payload);
    } catch (err) {
      if (attempt >= entry.opts.attempts) {
        await this.deadLetter(name, payload, err as Error);
        return;
      }
      const backoff = entry.opts.backoffMs * 2 ** (attempt - 1);
      this.logger.warn(
        `Job ${name} failed (attempt ${attempt}/${entry.opts.attempts}), retrying in ${backoff} ms`,
      );
      await this.runInProcess(name, entry, payload, attempt + 1, backoff);
    }
  }

  private async deadLetter(name: string, payload: unknown, error: Error) {
    this.logger.error(`Job ${name} dead-lettered: ${error.message}`);
    try {
      await this.deadLetterHook?.(name, payload, error);
    } catch (e) {
      this.logger.error(`Dead-letter hook failed: ${(e as Error).message}`);
    }
  }

  /** Test helper: resolves when every in-process job (incl. retries) has finished. */
  async drain(): Promise<void> {
    while (this.pending.size) await Promise.allSettled([...this.pending]);
  }

  async onModuleDestroy() {
    await Promise.allSettled(this.workers.map((w) => w.close()));
    await Promise.allSettled([...this.queues.values()].map((q) => q.close()));
  }
}
