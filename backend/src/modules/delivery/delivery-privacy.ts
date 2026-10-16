import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { map, Observable } from 'rxjs';
import { AppException } from '../../common/errors/app.exception';
import { CursorPage, Paginated } from '../../common/http/envelope';

/**
 * Keys that must NEVER appear in a response served to drivers or delivery
 * companies: prescriptions, medicines / request items, Chifa data, national ID.
 */
export const DRIVER_FORBIDDEN_KEYS = [
  'file_ids',
  'files',
  'prescription',
  'prescription_files',
  'prescription_submitted',
  'items',
  'request_items',
  'lines',
  'medicine',
  'medicines',
  'medicine_id',
  'medicine_name',
  'raw_name',
  'chifa',
  'chifa_number',
  'chifa_info_submitted',
  'coverage_verified',
  'national_id',
  'national_id_number',
  'nin',
  'date_of_birth',
  'pharmacist_note',
  'validation_note',
] as const;

const FORBIDDEN = new Set<string>(DRIVER_FORBIDDEN_KEYS);

/** Paths (a.b[0].c) of forbidden keys found anywhere in a value. */
export function findForbiddenKeys(value: unknown, path = ''): string[] {
  if (Array.isArray(value))
    return value.flatMap((v, i) => findForbiddenKeys(v, `${path}[${i}]`));
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.entries(value as Record<string, unknown>).flatMap(
      ([k, v]) => {
        const p = path ? `${path}.${k}` : k;
        return FORBIDDEN.has(k.toLowerCase()) ? [p] : findForbiddenKeys(v, p);
      },
    );
  }
  return [];
}

/**
 * Defense in depth on driver / company controllers: if a forbidden field
 * ever reaches a response (a future bug), the request fails closed instead
 * of leaking medical data. Field names only are logged – never values.
 */
@Injectable()
export class DriverPrivacyInterceptor implements NestInterceptor {
  private readonly logger = new Logger('DriverPrivacy');

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((body: unknown) => {
        // Pages are unwrapped by the envelope later: scan their rows, not the wrapper.
        const payload =
          body instanceof Paginated || body instanceof CursorPage
            ? body.items
            : body;
        const leaks = findForbiddenKeys(payload);
        if (leaks.length) {
          const req = ctx
            .switchToHttp()
            .getRequest<{ route?: { path?: string } }>();
          this.logger.error(
            `blocked driver-facing response with forbidden fields ${leaks.join(', ')} on ${req.route?.path ?? '?'}`,
          );
          throw new AppException('INTERNAL_ERROR');
        }
        return body;
      }),
    );
  }
}
