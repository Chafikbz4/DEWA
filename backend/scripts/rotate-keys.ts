/* Re-encrypts every encrypted column with the CURRENT key (ENCRYPTION_KEY /
 * ENCRYPTION_KEY_ID). Run after adding a new key and moving the old one to
 * ENCRYPTION_KEYS_PREVIOUS; once it reports 0 remaining, the old key can be
 * retired – unless files still use it (reported at the end: file objects keep
 * their key id and stay readable while that key is in ENCRYPTION_KEYS_PREVIOUS).
 *
 * Usage: ENV_FILE=.env.local npm run crypto:rotate [-- --dry-run]
 */
import { config } from 'dotenv';
import { ConfigService } from '@nestjs/config';
import { Client } from 'pg';
import {
  CryptoService,
  EnvKeyProvider,
} from '../src/common/crypto/crypto.service';

config({ path: [process.env.ENV_FILE ?? '.env.local', '.env'], quiet: true });

/** table, primary key, encrypted text column */
const COLUMNS: [string, string, string][] = [
  ['patient_profiles', 'user_id', 'national_id_encrypted'],
  ['chifa_submissions', 'id', 'insurance_number_encrypted'],
  ['pharmacy_payout_accounts', 'id', 'account_number_encrypted'],
  ['users', 'id', 'mfa_secret_encrypted'],
  ['drivers', 'id', 'license_number_encrypted'],
  ['ocr_results', 'id', 'raw_text_encrypted'],
  ['payments', 'id', 'raw_provider_response_encrypted'],
];

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const env = new ConfigService(process.env);
  const crypto = new CryptoService(env, new EnvKeyProvider(env));
  const current = crypto.currentKeyId;
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url)
    throw new Error('DATABASE_URL_UNPOOLED (or DATABASE_URL) is required');
  const db = new Client({ connectionString: url });
  await db.connect();
  let total = 0;
  try {
    for (const [table, pk, col] of COLUMNS) {
      const { rows } = await db.query<{ id: string; v: string }>(
        `SELECT ${pk}::text AS id, ${col} AS v FROM ${table} WHERE ${col} IS NOT NULL AND split_part(${col}, ':', 1) <> $1`,
        [current],
      );
      for (const r of rows) {
        if (!dryRun)
          await db.query(
            `UPDATE ${table} SET ${col} = $1 WHERE ${pk}::text = $2`,
            [crypto.rotate(r.v), r.id],
          );
      }
      total += rows.length;
      console.log(
        `${table}.${col}: ${rows.length} ${dryRun ? 'to rotate' : 'rotated'}`,
      );
    }
    // One-time codes stored in notification payloads ({ secret: "<encrypted>" }).
    const { rows: notes } = await db.query<{ id: string; s: string }>(
      `SELECT id::text, payload->>'secret' AS s FROM notifications WHERE payload ? 'secret' AND split_part(payload->>'secret', ':', 1) <> $1`,
      [current],
    );
    for (const n of notes) {
      if (!dryRun)
        await db.query(
          `UPDATE notifications SET payload = jsonb_set(payload, '{secret}', to_jsonb($1::text)) WHERE id::text = $2`,
          [crypto.rotate(n.s), n.id],
        );
    }
    total += notes.length;
    console.log(
      `notifications.payload.secret: ${notes.length} ${dryRun ? 'to rotate' : 'rotated'}`,
    );

    const {
      rows: [f],
    } = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM files WHERE deleted_at IS NULL AND is_encrypted AND encryption_key_ref <> $1`,
      [current],
    );
    console.log(
      `files still encrypted with an older key: ${f.n} (keep that key in ENCRYPTION_KEYS_PREVIOUS until they expire or are re-uploaded)`,
    );
    console.log(
      `done – ${total} value(s) ${dryRun ? 'would be' : ''} re-encrypted with key "${current}"`,
    );
  } finally {
    await db.end();
  }
}

main().catch((err) => {
  console.error((err as Error).message);
  process.exit(1);
});
