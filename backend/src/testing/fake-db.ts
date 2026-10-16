/**
 * Minimal stand-in for a Drizzle database in unit tests.
 * Every query-builder chain (select/insert/update/delete…) is awaitable and
 * resolves to the next queued result, in call order. `transaction(cb)` runs
 * cb with the same fake. All calls are recorded for assertions.
 */
export interface FakeDb {
  db: any;
  calls: { method: string; args: unknown[] }[];
  /** Queue the result of the next awaited query. */
  queue: (...results: unknown[]) => void;
}

export function createFakeDb(): FakeDb {
  const results: unknown[] = [];
  const calls: { method: string; args: unknown[] }[] = [];

  const chain: any = new Proxy(
    {},
    {
      get(_target, prop: string) {
        if (prop === 'then') {
          const value = results.length ? results.shift() : [];
          return (resolve: (v: unknown) => void) => resolve(value);
        }
        if (prop === 'transaction') {
          return async (cb: (tx: unknown) => unknown) => cb(db);
        }
        return (...args: unknown[]) => {
          calls.push({ method: prop, args });
          return chain;
        };
      },
    },
  );
  const db = chain;
  return { db, calls, queue: (...r) => results.push(...r) };
}

/** Values passed to `.set()` / `.values()` calls, in order. */
export const writes = (fake: FakeDb, method: 'set' | 'values') =>
  fake.calls
    .filter((c) => c.method === method)
    .map((c) => c.args[0] as Record<string, any>);
