import { ConsoleLogger, LoggerService, LogLevel } from '@nestjs/common';
import { redact, redactObject } from './redact';

const LEVELS: LogLevel[] = [
  'fatal',
  'error',
  'warn',
  'log',
  'debug',
  'verbose',
];

/**
 * Structured JSON logs (one object per line, UTC timestamps) with redaction
 * of personal data and secrets. Used when LOG_FORMAT=json (production);
 * otherwise Nest's console logger is wrapped with the same redaction.
 */
export class JsonLogger implements LoggerService {
  private readonly enabled: Set<LogLevel>;

  constructor(level: LogLevel = 'log') {
    this.enabled = new Set(LEVELS.slice(0, LEVELS.indexOf(level) + 1));
  }

  private write(level: LogLevel, message: unknown, rest: unknown[]) {
    if (!this.enabled.has(level)) return;
    const context =
      typeof rest[rest.length - 1] === 'string'
        ? (rest.pop() as string)
        : undefined;
    const stack =
      level === 'error' && typeof rest[0] === 'string'
        ? redact(rest[0] as string)
        : undefined;
    const line = {
      time: new Date().toISOString(),
      level,
      context,
      msg:
        typeof message === 'string' ? redact(message) : redactObject(message),
      ...(stack ? { stack } : {}),
    };
    (level === 'error' || level === 'fatal'
      ? process.stderr
      : process.stdout
    ).write(`${JSON.stringify(line)}\n`);
  }

  log(message: unknown, ...rest: unknown[]) {
    this.write('log', message, rest);
  }
  error(message: unknown, ...rest: unknown[]) {
    this.write('error', message, rest);
  }
  warn(message: unknown, ...rest: unknown[]) {
    this.write('warn', message, rest);
  }
  debug(message: unknown, ...rest: unknown[]) {
    this.write('debug', message, rest);
  }
  verbose(message: unknown, ...rest: unknown[]) {
    this.write('verbose', message, rest);
  }
  fatal(message: unknown, ...rest: unknown[]) {
    this.write('fatal', message, rest);
  }
}

/** Human-readable console logs (development) with the same redaction. */
export class RedactingConsoleLogger extends ConsoleLogger {
  protected formatMessage(...args: Parameters<ConsoleLogger['formatMessage']>) {
    const [logLevel, message, ...rest] = args;
    const safe =
      typeof message === 'string' ? redact(message) : redactObject(message);
    return super.formatMessage(logLevel, safe, ...rest);
  }
}
