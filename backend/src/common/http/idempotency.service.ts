import { Inject, Injectable } from '@nestjs/common';
import { and, eq, lt } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { Database, DRIZZLE } from '../../database/database.module';
import { idempotencyKeys } from '../../database/schema';
import { AppException } from '../errors/app.exception';

const KEY_PATTERN = /^[A-Za-z0-9_.:-]{8,128}$/;
const TTL_MS = 24 * 3_600_000;

/**
 * `Idempotency-Key` support: the first response for (user, scope, key) is
 * stored for 24 h and replayed for identical retries. Same key + different
 * body → IDEMPOTENCY_KEY_REUSED; retry while the first call still runs →
 * IDEMPOTENCY_IN_PROGRESS. A failed call releases the key.
 */
@Injectable()
export class IdempotencyService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async run<T>(
    userId: string,
    scope: string,
    key: string | undefined,
    body: unknown,
    work: () => Promise<T>,
  ): Promise<T> {
    if (key === undefined || key === '') return work();
    if (!KEY_PATTERN.test(key))
      throw new AppException('IDEMPOTENCY_KEY_INVALID');
    const requestHash = createHash('sha256')
      .update(JSON.stringify(body ?? null))
      .digest('hex');
    const where = and(
      eq(idempotencyKeys.userId, userId),
      eq(idempotencyKeys.scope, scope),
      eq(idempotencyKeys.key, key),
    );

    // Expired keys can be reused.
    await this.db
      .delete(idempotencyKeys)
      .where(and(where, lt(idempotencyKeys.expiresAt, new Date())));

    const inserted = await this.db
      .insert(idempotencyKeys)
      .values({
        userId,
        scope,
        key,
        requestHash,
        status: 'IN_PROGRESS',
        expiresAt: new Date(Date.now() + TTL_MS),
      })
      .onConflictDoNothing()
      .returning({ id: idempotencyKeys.id });

    if (!inserted.length) {
      const [existing] = await this.db
        .select()
        .from(idempotencyKeys)
        .where(where)
        .limit(1);
      if (!existing) return this.run(userId, scope, key, body, work);
      if (existing.requestHash !== requestHash)
        throw new AppException('IDEMPOTENCY_KEY_REUSED');
      if (existing.status !== 'COMPLETED')
        throw new AppException('IDEMPOTENCY_IN_PROGRESS');
      return existing.response as T;
    }

    try {
      const result = await work();
      await this.db
        .update(idempotencyKeys)
        .set({ status: 'COMPLETED', response: result as object })
        .where(eq(idempotencyKeys.id, inserted[0].id));
      return result;
    } catch (err) {
      await this.db
        .delete(idempotencyKeys)
        .where(eq(idempotencyKeys.id, inserted[0].id));
      throw err;
    }
  }
}
