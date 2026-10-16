import { ArgumentMetadata, Injectable, PipeTransform } from '@nestjs/common';

/** Keys whose values must reach the service byte-for-byte. */
const RAW_KEYS = /password|secret|token|code/i;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/**
 * Global input sanitisation for body & query: trims strings, strips control
 * characters and null bytes. SQL injection is prevented by parameterised
 * queries (Drizzle); HTML escaping is the client's responsibility on output.
 */
@Injectable()
export class SanitizePipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata) {
    if (metadata.type !== 'body' && metadata.type !== 'query') return value;
    return this.clean(value, undefined, 0);
  }

  private clean(
    value: unknown,
    key: string | undefined,
    depth: number,
  ): unknown {
    if (depth > 10) return value;
    if (typeof value === 'string') {
      if (key && RAW_KEYS.test(key)) return value;
      return value.replace(CONTROL_CHARS, '').trim();
    }
    if (Array.isArray(value)) {
      return value.map((v) => this.clean(v, key, depth + 1));
    }
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        if (k === '__proto__' || k === 'constructor' || k === 'prototype')
          continue;
        out[k] = this.clean(v, k, depth + 1);
      }
      return out;
    }
    return value;
  }
}
