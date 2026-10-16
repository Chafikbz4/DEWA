import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AppException } from '../errors/app.exception';
import { ERROR_CODES, ErrorCode, messageKeyFor } from '../errors/error-codes';
import { I18nService } from '../i18n/i18n.service';
import { ApiEnvelope } from './envelope';
import { ValidationIssue } from './validation';

const STATUS_FALLBACK: Partial<Record<number, ErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'ROUTE_NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'PAYLOAD_TOO_LARGE',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  constructor(private readonly i18n: I18nService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();
    const lang = this.i18n.resolveLang(req.headers['accept-language']);

    let code: ErrorCode;
    let details: unknown = null;
    let params: Record<string, string | number> | undefined;

    if (exception instanceof AppException) {
      code = exception.code;
      details = exception.details ?? null;
      params = exception.params;
    } else if (exception instanceof ThrottlerException) {
      code = 'RATE_LIMITED';
    } else if (exception instanceof HttpException) {
      code = STATUS_FALLBACK[exception.getStatus()] ?? 'INTERNAL_ERROR';
    } else {
      code = 'INTERNAL_ERROR';
    }

    const status = ERROR_CODES[code];
    if (status >= 500) {
      // Never log request bodies/headers (may contain health data or secrets).
      this.logger.error(
        `${req.method} ${req.route?.path ?? 'unknown-route'} -> ${code} [${req.requestId}]`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    if (code === 'VALIDATION_FAILED' && Array.isArray(details)) {
      details = (details as ValidationIssue[]).map((issue) => ({
        ...issue,
        errors: issue.errors.map((e) => ({
          ...e,
          message: this.i18n.t(e.message_key, lang),
        })),
      }));
    }

    const body: ApiEnvelope<null> = {
      success: false,
      data: null,
      error: {
        code,
        message_key: messageKeyFor(code),
        message: this.i18n.t(messageKeyFor(code), lang, params),
        details,
      },
      meta: { request_id: req.requestId },
    };
    res.status(status).json(body);
  }
}
