import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request } from 'express';
import { map, Observable } from 'rxjs';
import { ApiEnvelope, CursorPage, Paginated } from './envelope';

/** Wraps every successful response in the unified envelope. */
@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiEnvelope<unknown>> {
    const req = context.switchToHttp().getRequest<Request>();
    return next.handle().pipe(
      map((result: unknown) => {
        if (result instanceof Paginated) {
          return {
            success: true,
            data: result.items,
            error: null,
            meta: {
              request_id: req.requestId,
              pagination: result.pagination,
              ...result.extraMeta,
            },
          };
        }
        if (result instanceof CursorPage) {
          return {
            success: true,
            data: result.items,
            error: null,
            meta: {
              request_id: req.requestId,
              cursor: { next_cursor: result.nextCursor, limit: result.limit },
            },
          };
        }
        return {
          success: true,
          data: result ?? null,
          error: null,
          meta: { request_id: req.requestId },
        };
      }),
    );
  }
}
