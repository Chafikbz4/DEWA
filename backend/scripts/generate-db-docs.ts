/* Generates docs/01-database.md from the Drizzle schema (single source of truth).
 * Usage: npm run docs:db
 */
import { is, SQL } from 'drizzle-orm';
import { getTableConfig, PgDialect, PgTable } from 'drizzle-orm/pg-core';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as catalog from '../src/database/schema/catalog';
import * as delivery from '../src/database/schema/delivery';
import * as enums from '../src/database/schema/enums';
import * as files from '../src/database/schema/files';
import * as governance from '../src/database/schema/governance';
import * as identity from '../src/database/schema/identity';
import * as messaging from '../src/database/schema/messaging';
import * as offers from '../src/database/schema/offers';
import * as orders from '../src/database/schema/orders';
import * as patient from '../src/database/schema/patient';
import * as payments from '../src/database/schema/payments';
import * as pharmacy from '../src/database/schema/pharmacy';
import * as requests from '../src/database/schema/requests';

const DOMAINS: [string, Record<string, unknown>][] = [
  ['1. Identity & security', identity],
  ['2. Files', files],
  ['3. Patient & geography', patient],
  ['4. Pharmacy', pharmacy],
  ['5. Catalog & stock', catalog],
  ['6. Requests', requests],
  ['7. Offers', offers],
  ['8. Messaging & notifications', messaging],
  ['9. Orders', orders],
  ['10. Payments', payments],
  ['11. Delivery', delivery],
  ['12. Support & governance', governance],
];

/** One-line purpose per table (the "why"; columns come from the schema). */
const PURPOSE: Record<string, string> = {
  users:
    'Every account (all roles). Login identifier = email and/or E.164 phone. Soft-deleted.',
  otp_codes:
    'One-time codes (HMAC-hashed). Newest code per target+purpose is the only valid one.',
  devices:
    'Client devices. `biometric_enabled` is a flag only; sessions can be bound to a device.',
  sessions:
    'Refresh-token sessions. Rotations share `family_id`; reuse of a rotated token revokes the family.',
  consent_records:
    'Versioned consent history (grant / revoke), never overwritten.',
  staff_profiles:
    'Names for non-patient accounts (pharmacy staff, delivery admins, platform admins).',
  files:
    'Metadata of stored objects (prescriptions, documents…). Content lives in object storage, encrypted.',
  wilayas: 'The 58 wilayas (id = official code). Seeded.',
  communes: 'The 1,541 communes. Seeded.',
  patient_profiles: 'Patient identity (1-1 with users).',
  addresses:
    'Patient delivery addresses with PostGIS point. One default per user.',
  dependants: 'People a patient orders for (children, parents…).',
  pharmacies: 'Pharmacy legal + location data, verification status.',
  pharmacy_staff:
    'Links users to a pharmacy with a staff role. A user is active in at most one pharmacy.',
  pharmacy_staff_invitations:
    'Expiring invitations sent by an owner (token stored as HMAC).',
  pharmacy_documents:
    'Documents submitted for verification and their admin review.',
  pharmacy_opening_hours: 'Weekly opening hours (one row per day).',
  pharmacy_on_duty_schedule: 'Garde / on-duty periods.',
  pharmacy_service_areas: 'Where a pharmacy accepts requests / delivers.',
  pharmacy_payout_accounts:
    'Bank / CCP accounts for settlements (number encrypted).',
  medicines: 'Medicine catalog. `reimbursable_flag` is informational only.',
  pharmacy_stock: 'Per-pharmacy availability and price (centimes).',
  eligibility_policies:
    'What the platform allows per medicine category. Disabled by default; enabling requires review + legal basis (DB CHECK).',
  requests:
    'A patient request (prescription / CHIFA / product) sent to pharmacies.',
  request_files: 'Pages of the uploaded prescription / documents.',
  request_items:
    'Requested items (typed by patient, OCR-suggested or confirmed by a pharmacist).',
  ocr_results: 'Advisory OCR output (raw text encrypted).',
  chifa_submissions:
    'CHIFA card data. VERIFIED is impossible without an official source (DB CHECK).',
  request_recipients:
    'Which pharmacies received a request and how they responded.',
  offers: 'A pharmacy quote for a request. total = subtotal + fees (DB CHECK).',
  offer_items:
    'Offer lines, alternatives and patient approval. line_total = unit × qty (DB CHECK).',
  conversations: 'One thread per (request, pharmacy).',
  messages: 'Messages inside a conversation (clarifications, attachments).',
  notifications: 'Notifications with i18n title/body keys, per channel.',
  orders:
    'An accepted offer becomes an order. Optimistic lock `version`; one active order per offer.',
  order_items: 'Frozen order lines.',
  order_status_history:
    'APPEND-ONLY status trail (UPDATE/DELETE blocked by trigger).',
  payments:
    'Payment attempts. CONFIRMED requires server-side verification (DB CHECK).',
  payment_events:
    'Provider webhooks / callbacks (idempotent on provider_event_id).',
  refunds: 'Refund requests and their processing.',
  receipts: 'Issued receipts (sequential number, data snapshot).',
  commission_rules:
    'Platform commission (PERCENT in basis points; FIXED/SUBSCRIPTION in centimes).',
  settlements: 'Periodic payouts to pharmacies.',
  settlement_lines: 'Orders included in a settlement.',
  delivery_companies: 'Delivery partners and their verification.',
  delivery_company_documents: 'Documents submitted by delivery companies.',
  drivers: 'Drivers (company or independent), availability and live position.',
  delivery_zones: 'Areas where delivery is offered.',
  delivery_fee_rules: 'Fee formula per zone.',
  deliveries:
    'Delivery of an order. Snapshots contain NO medical data; package label is opaque.',
  delivery_status_history: 'APPEND-ONLY delivery status trail.',
  complaints: 'Complaints / disputes and their resolution.',
  complaint_messages: 'Messages inside a complaint.',
  audit_logs:
    'APPEND-ONLY audit trail (logins, admin actions, sensitive access…).',
  sensitive_access_logs:
    'APPEND-ONLY log of every read of prescriptions / CHIFA / patient profiles.',
  platform_settings: 'Runtime settings (key → JSON value). Seeded.',
  data_retention_jobs: 'Runs of the data-retention purge job.',
};

const dialect = new PgDialect();
const sqlText = (s: SQL) => dialect.sqlToQuery(s).sql;

const tablesOf = (mod: Record<string, unknown>) =>
  Object.values(mod).filter((v): v is PgTable => is(v, PgTable));

function columnType(c: {
  getSQLType(): string;
  enumValues?: readonly string[];
}) {
  return c.getSQLType();
}

function defaultOf(c: any): string {
  if (c.generated)
    return `generated: ${sqlText(c.generated.as as SQL).slice(0, 60)}…`;
  if (c.hasDefault && c.default !== undefined) {
    if (is(c.default, SQL)) return sqlText(c.default);
    return typeof c.default === 'string' ? `'${c.default}'` : String(c.default);
  }
  if (c.defaultFn) return '(app) generated';
  if (c.columnType === 'PgUUID' && c.primary) return 'gen_random_uuid()';
  return '';
}

const lines: string[] = [];
const out = (s = '') => lines.push(s);

out('# 01 – Database schema');
out();
out(
  '> **Generated** from `src/database/schema/*.ts` by `npm run docs:db` — do not edit by hand.',
);
out(
  '> Migrations live in `drizzle/` (`npm run db:migrate`). Seeds: `npm run db:seed`.',
);
out();
out('## Conventions');
out();
out(
  '- PostgreSQL 16+ (Neon), PostGIS enabled. Primary keys are UUID v4 (`gen_random_uuid()`), except `wilayas`/`communes` (official codes) and `platform_settings` (key).',
);
out(
  '- All timestamps are `timestamptz` and stored in UTC. `created_at` / `updated_at` everywhere; `deleted_at` (soft delete) on users, files, addresses, dependants.',
);
out(
  '- **Money is `bigint` centimes of DZD** (`*_centimes`), never floats. `CHECK >= 0` on every amount; totals are verified by CHECK constraints.',
);
out(
  '- Secrets and sensitive identifiers are stored **encrypted** (`*_encrypted`, AES-256-GCM) or **hashed** (`*_hash`, HMAC-SHA256 with a server pepper / argon2id for passwords).',
);
out(
  '- Append-only tables (`audit_logs`, `sensitive_access_logs`, `order_status_history`, `delivery_status_history`) reject UPDATE/DELETE via trigger (migration `0002`).',
);
out(
  '- Human references use sequences: `request_reference_seq`, `order_reference_seq`, `complaint_reference_seq`, `receipt_number_seq` (format e.g. `RX-2026-000123`).',
);
out(
  '- Geo: `latitude`/`longitude` (double) + generated `location geography` with a GiST index on addresses and pharmacies; expression GiST index on drivers.',
);
out();
out('## Seeds');
out();
out('| Seed | Content |');
out('|---|---|');
out(
  '| Geography | 58 wilayas + 1,541 communes (ar/fr) from `src/database/seeds/data/algeria-geo.json` |',
);
out(
  '| Platform settings | `payment_before_validation`, `request_expiry_hours`, `offer_validity_hours`, `payment_deadline_minutes`, `max_pharmacies_per_request`, `delivery_enabled`, `sensitive_data_retention_days` |',
);
out(
  '| Eligibility policies | One example policy per category, **all disabled** (`is_enabled=false`, no legal basis yet) |',
);
out(
  '| Super admin | Only if `SEED_SUPER_ADMIN_EMAIL` + `SEED_SUPER_ADMIN_PASSWORD` are set. MFA enrolment forced at first login. |',
);
out();

// ---------- enums ----------
out('## Enums');
out();
out('| Enum | Values |');
out('|---|---|');
for (const v of Object.values(enums)) {
  const e = v as { enumName?: string; enumValues?: readonly string[] };
  if (e && typeof v === 'function' && e.enumName && e.enumValues) {
    out(
      `| \`${e.enumName}\` | ${e.enumValues.map((x) => `\`${x}\``).join(', ')} |`,
    );
  }
}
out();

// ---------- ER diagrams ----------
out('## ER diagrams (per domain)');
out();
out(
  'Relationships point from the referencing table to the referenced one. Tables from other domains appear without columns.',
);
out();
for (const [title, mod] of DOMAINS) {
  const tables = tablesOf(mod);
  if (!tables.length) continue;
  out(`### ${title}`);
  out();
  out('```mermaid');
  out('erDiagram');
  for (const t of tables) {
    const cfg = getTableConfig(t);
    out(`  ${cfg.name} {`);
    for (const c of cfg.columns) {
      const isFk = cfg.foreignKeys.some((fk) =>
        fk.reference().columns.some((col) => col.name === c.name),
      );
      const key = c.primary ? ' PK' : isFk ? ' FK' : '';
      const type = columnType(c).replace(/[^A-Za-z0-9_]/g, '_');
      out(`    ${type} ${c.name}${key}`);
    }
    out('  }');
  }
  const seen = new Set<string>();
  for (const t of tables) {
    const cfg = getTableConfig(t);
    for (const fk of cfg.foreignKeys) {
      const ref = fk.reference();
      const target = getTableConfig(ref.foreignTable).name;
      const col = ref.columns[0];
      const label = `${col.name}`;
      const edge = `${cfg.name}->${target}:${label}`;
      if (seen.has(edge)) continue;
      seen.add(edge);
      const optional = !col.notNull;
      out(
        `  ${target} ||--o{ ${cfg.name} : "${label}${optional ? ' (opt)' : ''}"`,
      );
    }
  }
  out('```');
  out();
}

// ---------- dictionary ----------
out('## Field dictionary');
out();
for (const [title, mod] of DOMAINS) {
  const tables = tablesOf(mod);
  if (!tables.length) continue;
  out(`### ${title}`);
  out();
  for (const t of tables) {
    const cfg = getTableConfig(t);
    out(`#### \`${cfg.name}\``);
    out();
    if (PURPOSE[cfg.name]) out(PURPOSE[cfg.name]);
    out();
    out('| Column | Type | Null | Default | References |');
    out('|---|---|---|---|---|');
    for (const c of cfg.columns) {
      const fk = cfg.foreignKeys.find((f) =>
        f.reference().columns.some((col) => col.name === c.name),
      );
      let ref = '';
      if (fk) {
        const r = fk.reference();
        ref = `${getTableConfig(r.foreignTable).name}.${r.foreignColumns[0].name} (on delete ${fk.onDelete ?? 'no action'})`;
      }
      const type = columnType(c) + (c.primary ? ' **PK**' : '');
      out(
        `| \`${c.name}\` | ${type} | ${c.notNull ? 'no' : 'yes'} | ${defaultOf(c).replace(/\|/g, '\\|')} | ${ref} |`,
      );
    }
    const idx = cfg.indexes.map((i) => {
      const c = i.config;
      const cols = c.columns
        .map((col: any) => (col.name ? col.name : 'expr'))
        .join(', ');
      const where = c.where ? ` WHERE ${sqlText(c.where)}` : '';
      return `\`${c.name}\`${c.unique ? ' (unique)' : ''}${c.method && c.method !== 'btree' ? ` using ${c.method}` : ''} on (${cols})${where}`;
    });
    const checks = cfg.checks.map(
      (ch) =>
        `\`${ch.name}\`: \`${sqlText(ch.value).replace(/"[a-z_]+"\./g, '')}\``,
    );
    if (idx.length || checks.length) {
      out();
      if (idx.length) out(`**Indexes:** ${idx.join('; ')}`);
      if (idx.length && checks.length) out();
      if (checks.length) out(`**Checks:** ${checks.join('; ')}`);
    }
    out();
  }
}

out('## Constraints added in raw SQL migrations');
out();
out(
  '- `0002_append_only_guards.sql`: triggers `*_append_only` on the four append-only tables; `addresses_lat_lng_chk`, `pharmacies_lat_lng_chk`, `drivers_lat_lng_chk` (lat ∈ [-90,90], lng ∈ [-180,180]).',
);
out('- `0000_extensions.sql`: `pgcrypto`, `postgis`.');
out();

const target = resolve(__dirname, '..', 'docs', '01-database.md');
writeFileSync(target, lines.join('\n') + '\n');
console.log(`✓ wrote ${target}`);
