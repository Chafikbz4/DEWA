import { ErrorCode } from '../errors/error-codes';

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

export interface ApiErrorBody {
  code: ErrorCode;
  message_key: string;
  /** Human-readable message translated from message_key (ar/fr). */
  message: string;
  details: unknown;
}

export interface ApiEnvelope<T> {
  success: boolean;
  data: T | null;
  error: ApiErrorBody | null;
  meta: {
    request_id?: string;
    pagination?: PaginationMeta;
    cursor?: { next_cursor: string | null; limit: number };
    [extra: string]: unknown;
  } | null;
}

/** Return this from a controller to get `meta.pagination` filled. */
export class Paginated<T> {
  /** Additional meta fields, e.g. { unread_count }. */
  extraMeta: Record<string, unknown> = {};

  constructor(
    public readonly items: T[],
    public readonly pagination: PaginationMeta,
  ) {}

  withMeta(extra: Record<string, unknown>) {
    this.extraMeta = { ...this.extraMeta, ...extra };
    return this;
  }

  static of<T>(items: T[], total: number, page: number, limit: number) {
    return new Paginated(items, {
      page,
      limit,
      total,
      total_pages: Math.max(1, Math.ceil(total / limit)),
    });
  }
}

/** Cursor-paginated list: `meta.cursor = { next_cursor, limit }` (null cursor = no more items). */
export class CursorPage<T> {
  constructor(
    public readonly items: T[],
    public readonly nextCursor: string | null,
    public readonly limit: number,
  ) {}
}
