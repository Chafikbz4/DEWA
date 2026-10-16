import { HttpException } from '@nestjs/common';
import { ERROR_CODES, ErrorCode } from './error-codes';

/** Throw this everywhere instead of raw HttpExceptions. */
export class AppException extends HttpException {
  constructor(
    public readonly code: ErrorCode,
    public readonly details?: unknown,
    /** Extra values interpolated into the translated message, e.g. {seconds}. */
    public readonly params?: Record<string, string | number>,
  ) {
    super(code, ERROR_CODES[code]);
  }
}
