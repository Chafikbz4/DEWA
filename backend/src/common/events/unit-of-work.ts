import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Database, DbOrTx, DRIZZLE } from '../../database/database.module';

export interface TxContext {
  tx: DbOrTx;
  /** Queue a domain event; it is emitted only after the transaction commits. */
  emit: (event: string, payload: unknown) => void;
}

/**
 * Runs work in a DB transaction and emits the collected domain events only
 * after COMMIT – listeners never see changes that were rolled back.
 */
@Injectable()
export class UnitOfWork {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly events: EventEmitter2,
  ) {}

  async run<T>(work: (ctx: TxContext) => Promise<T>): Promise<T> {
    const pending: [string, unknown][] = [];
    const result = await this.db.transaction((tx) =>
      work({ tx, emit: (e, p) => pending.push([e, p]) }),
    );
    for (const [event, payload] of pending) this.events.emit(event, payload);
    return result;
  }

  /** Context bound to the plain connection (each statement auto-commits; events emitted immediately). */
  direct(): TxContext {
    return { tx: this.db, emit: (e, p) => this.events.emit(e, p) };
  }
}
