/* Generates docs/api/errors.md from ERROR_CODES + the ar/fr translations.
 * Usage: npm run docs:errors
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ERROR_CODES,
  ErrorCode,
  messageKeyFor,
} from '../src/common/errors/error-codes';
import { I18nService } from '../src/common/i18n/i18n.service';

const i18n = new I18nService();
const lines = [
  '# Error codes',
  '',
  '> **Generated** by `npm run docs:errors` from `src/common/errors/error-codes.ts` and `src/i18n/*.json`.',
  '',
  'Every error response has `error.code` (stable, switch on it), `error.message_key` (`errors.<CODE>`),',
  '`error.message` (translated from `Accept-Language`) and `error.details` (e.g. field errors for `VALIDATION_FAILED`).',
  '',
  '| Code | HTTP | Message (fr) | Message (ar) |',
  '|---|---|---|---|',
  ...(Object.keys(ERROR_CODES) as ErrorCode[]).map(
    (code) =>
      `| \`${code}\` | ${ERROR_CODES[code]} | ${i18n.t(messageKeyFor(code), 'fr')} | ${i18n.t(messageKeyFor(code), 'ar')} |`,
  ),
  '',
];
const target = resolve(__dirname, '..', 'docs', 'api', 'errors.md');
writeFileSync(target, lines.join('\n'));
console.log(`✓ wrote ${target}`);
