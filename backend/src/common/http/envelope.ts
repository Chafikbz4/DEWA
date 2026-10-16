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
  meta: { request_id?: string; pagination?: PaginationMeta } | null;
}

/** Return this from a controller to get `meta.pagination` filled. */
export class Paginated<T> {
  constructor(
    public readonly items: T[],
    public readonly pagination: PaginationMeta,
  ) {}

  static of<T>(items: T[], total: number, page: number, limit: number) {
    return new Paginated(items, {
      page,
      limit,
      total,
      total_pages: Math.max(1, Math.ceil(total / limit)),
    });
  }
}
