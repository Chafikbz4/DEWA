import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import { map, Observable } from 'rxjs';
import { CursorPage, Paginated } from '../http/envelope';

/** Fields that must never leave the API, whatever the role. */
const SECRET_SNAKE =
  /^(password_hash|mfa_secret\w*|(?!is_)\w+_encrypted|token_hash|\w+_code_hash|\w+_token_hash|storage_key|encryption_key_ref|raw_provider_response\w*)$/;
/** Raw DB rows leaking through (camelCase columns). */
const SECRET_CAMEL =
  /^(passwordHash|mfaSecret\w*|\w+Encrypted|tokenHash|\w+CodeHash|\w+TokenHash|storageKey|encryptionKeyRef)$/;
const isSecret = (k: string) => SECRET_SNAKE.test(k) || SECRET_CAMEL.test(k);

function strip(
  value: unknown,
  path: string,
  found: string[],
  depth = 0,
): unknown {
  if (
    depth > 12 ||
    value === null ||
    typeof value !== 'object' ||
    value instanceof Date ||
    Buffer.isBuffer(value)
  )
    return value;
  if (Array.isArray(value))
    return value.map((v, i) => strip(v, `${path}[${i}]`, found, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (isSecret(k)) {
      found.push(path ? `${path}.${k}` : k);
      continue;
    }
    out[k] = strip(v, path ? `${path}.${k}` : k, found, depth + 1);
  }
  return out;
}

/**
 * Role-independent serialization safety net (data minimisation layer 0):
 * secrets, hashes, encrypted columns and storage internals are removed from
 * every response, and the leak is logged (field names only) so the presenter
 * can be fixed. Role-specific layers sit on top (presenters per role,
 * DriverPrivacyInterceptor for delivery actors).
 */
@Injectable()
export class SecretFieldsInterceptor implements NestInterceptor {
  private readonly logger = new Logger('Serialization');

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((body: unknown) => {
        if (
          body instanceof StreamableFile ||
          body === null ||
          typeof body !== 'object'
        )
          return body;
        const found: string[] = [];
        let result: unknown;
        if (body instanceof Paginated)
          result = new Paginated(
            strip(body.items, 'items', found) as unknown[],
            body.pagination,
          ).withMeta(body.extraMeta);
        else if (body instanceof CursorPage)
          result = new CursorPage(
            strip(body.items, 'items', found) as unknown[],
            body.nextCursor,
            body.limit,
          );
        else result = strip(body, '', found);
        if (found.length) {
          const req = ctx
            .switchToHttp()
            .getRequest<{ method?: string; route?: { path?: string } }>();
          this.logger.error(
            `stripped secret fields ${found.join(', ')} from ${req.method} ${req.route?.path ?? '?'}`,
          );
        }
        return result;
      }),
    );
  }
}
