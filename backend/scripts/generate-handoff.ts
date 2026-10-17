/* Generates the data-driven parts of docs/frontend-handoff/ from the code:
 *   errors.md     – every error code: HTTP status, i18n key, fr/ar text, suggested UX action
 *   statuses.md   – status dictionaries with localized labels (ar/fr) + explanations
 *   curl/*.md     – a cURL example for EVERY endpoint, grouped by interface
 * Requires docs/openapi.json (npm run docs:openapi). Usage: npm run docs:handoff
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ERROR_CODES } from '../src/common/errors/error-codes';
import * as ar from '../src/i18n/ar.json';
import * as fr from '../src/i18n/fr.json';

const OUT = resolve(process.cwd(), 'docs/frontend-handoff');
mkdirSync(resolve(OUT, 'curl'), { recursive: true });
const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\n/g, ' ');

// ------------------------------------------------------------------ errors

/** Suggested UX per code (prefix rules first, then status fallbacks). */
const UX: [RegExp, string][] = [
  [
    /^AUTH_TOKEN_EXPIRED$/,
    'Silently call POST /auth/refresh once, then retry the request.',
  ],
  [
    /^AUTH_(TOKEN_MISSING|TOKEN_INVALID|SESSION_REVOKED|REFRESH_INVALID|REFRESH_REUSED|DEVICE_MISMATCH)$/,
    'Clear tokens and go to the login screen (session ended).',
  ],
  [
    /^AUTH_ACCOUNT_LOCKED$/,
    'Show the lock message with the remaining minutes; offer “forgot password”.',
  ],
  [
    /^AUTH_INVALID_CREDENTIALS$/,
    'Show “identifier or password incorrect” under the form; do not say which one.',
  ],
  [
    /^AUTH_MFA|MFA_/,
    'Stay on the TOTP step; let the user re-enter the 6-digit code.',
  ],
  [
    /^AUTH_CONSENT_REQUIRED$/,
    'Show the terms / privacy checkboxes again (current versions).',
  ],
  [
    /^OTP_RESEND_COOLDOWN$/,
    'Disable “resend” and show a countdown (details.retry_after_seconds).',
  ],
  [/^OTP_/, 'Highlight the code field; offer “resend code” when allowed.'],
  [
    /^ACCOUNT_PENDING_VERIFICATION$/,
    'Route to the “verification in progress” screen.',
  ],
  [
    /^ACCOUNT_SUSPENDED|^ACCOUNT_DELETED$/,
    'Log out and show the account-status screen with support contact.',
  ],
  [
    /^ROLE_FORBIDDEN$|^PERMISSION_DENIED$|^PHARMACY_ACCESS_DENIED$|^ADMIN_MFA_REQUIRED$/,
    'Hide the action for this role; if reached, show “not allowed” and go back.',
  ],
  [
    /^SENSITIVE_ACCESS_GRANT_REQUIRED$/,
    'Open the “justify access” dialog (POST /admin/sensitive-access), then retry.',
  ],
  [
    /^IDEMPOTENCY_(KEY_INVALID)$/,
    'Bug: always send an Idempotency-Key (UUID) on this endpoint.',
  ],
  [
    /^IDEMPOTENCY_IN_PROGRESS$/,
    'Keep the spinner; retry with the SAME key after 1–2 s.',
  ],
  [
    /^IDEMPOTENCY_KEY_REUSED$/,
    'Bug: a key was reused with a different body; generate a new key per user action.',
  ],
  [
    /_VERSION_CONFLICT$|_ALREADY_TAKEN$/,
    'Refetch the resource and show its new state (someone else acted first).',
  ],
  [
    /_INVALID_TRANSITION$|_NOT_ALLOWED$|_CLOSED$|_INVALID_STATE$/,
    'Refetch and refresh the screen: the action is no longer available in this state.',
  ],
  [
    /_CODE_INVALID$/,
    'Highlight the code field and show details.attempts_remaining.',
  ],
  [
    /_CODE_LOCKED$/,
    'Explain the code is locked; offer to generate a new code.',
  ],
  [
    /^PAYMENT_PROVIDER_ERROR$/,
    'Show “payment service unavailable, try again”; keep the order (it is back to AWAITING_PAYMENT).',
  ],
  [
    /^PAYMENT_DEADLINE_PASSED$/,
    'Explain the payment window closed; the order will be cancelled.',
  ],
  [
    /^FILE_INFECTED$|^FILE_TYPE_NOT_ALLOWED$|^FILE_TOO_LARGE$|^FILE_/,
    'Show the file error next to the picker; let the user choose another file.',
  ],
  [
    /_RATE_LIMITED$|^RATE_LIMITED$|_THROTTLED$|_TOO_FREQUENT$|_LIMIT_REACHED$/,
    'Back off: disable the action and retry later (see details for the delay).',
  ],
  [
    /_NOT_FOUND$|^ROUTE_NOT_FOUND$/,
    'Show “not found / no longer available” and navigate back to the list.',
  ],
  [
    /^VALIDATION_FAILED$/,
    'Map details[].field → form field and show the localized message under it.',
  ],
];
const byStatus = (status: number) =>
  status >= 500
    ? 'Show a generic error with the request id (meta.request_id) and a retry button.'
    : status === 409
      ? 'Refetch and show the current state.'
      : status === 403
        ? 'Hide or disable the action for this user.'
        : status === 422
          ? 'Explain why the option is unavailable (e.g. delivery not possible) and offer alternatives.'
          : 'Show error.message inline.';

const STATUS_NAME: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  413: 'Payload Too Large',
  422: 'Unprocessable',
  423: 'Locked',
  429: 'Too Many Requests',
  500: 'Internal Error',
  502: 'Bad Gateway',
  503: 'Unavailable',
};
const errFr = (fr as unknown as { errors: Record<string, string> }).errors;
const errAr = (ar as unknown as { errors: Record<string, string> }).errors;
const rows = Object.entries(ERROR_CODES)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([code, status]) => {
    const ux =
      UX.find(([re]) => re.test(code))?.[1] ?? byStatus(status as number);
    return `| \`${code}\` | ${status} ${STATUS_NAME[status as number] ?? ''} | \`errors.${code}\` | ${esc(errFr[code])} | ${esc(errAr[code])} | ${esc(ux)} |`;
  });
writeFileSync(
  resolve(OUT, 'errors.md'),
  `# Error catalogue (generated)\n\nGenerated by \`npm run docs:handoff\` from \`src/common/errors/error-codes.ts\` and \`src/i18n/*.json\` – do not edit by hand.\n\n` +
    `Every error response: \`{ success: false, data: null, error: { code, message_key, message, details }, meta: { request_id } }\`. ` +
    `Branch on **\`error.code\`** (stable); display **\`error.message\`** (already localized from \`Accept-Language\`) or your own translation of \`message_key\`. ` +
    `Always log / show \`meta.request_id\` for support.\n\n` +
    `| Code | HTTP | i18n key | Message (fr) | Message (ar) | Suggested UX |\n|---|---|---|---|---|---|\n${rows.join('\n')}\n`,
);

// ---------------------------------------------------------------- statuses

const EXPLAIN: Record<string, Record<string, string>> = {
  request_status: {
    REQUEST_SUBMITTED: 'Just created; pharmacies are being notified.',
    AWAITING_PHARMACY_RESPONSE: 'Sent to pharmacies; waiting for offers.',
    CLARIFICATION_REQUIRED:
      'A pharmacist asked a question – answer in the conversation.',
    OFFER_AVAILABLE: 'At least one offer received – compare and accept one.',
    OFFER_ACCEPTED: 'An offer was accepted; follow the order.',
    EXPIRED: 'No offer accepted in time; create a new request if needed.',
    CANCELLED:
      'Cancelled by the patient or because the order ended without hand-over.',
  },
  offer_status: {
    DRAFT: 'Pharmacy is preparing the offer (patient never sees drafts).',
    SENT: 'Visible to the patient; can be accepted until valid_until.',
    ACCEPTED: 'Chosen by the patient – an order was created.',
    REJECTED: 'Another offer was accepted or the patient declined.',
    WITHDRAWN: 'Withdrawn by the pharmacy.',
    EXPIRED: 'Validity period ended.',
  },
  payment_status: {
    INITIATED: 'Payment attempt created; redirect pending.',
    PENDING:
      'Waiting for the bank – poll GET /payments/:id/status; never show success yet.',
    CONFIRMED:
      'Verified server-side with the provider – show success and refetch the order.',
    FAILED: 'Declined, cancelled or provider error – the patient may retry.',
    CANCELLED: 'Attempt abandoned.',
    REFUND_PENDING: 'A refund is being processed.',
    REFUNDED: 'Fully refunded.',
  },
  delivery_status: {
    AVAILABLE: 'Waiting for a driver to accept the job.',
    ASSIGNED: 'A driver accepted; going to the pharmacy.',
    PICKED_UP: 'Parcel collected from the pharmacy (pickup code).',
    OUT_FOR_DELIVERY:
      'On the way – live position available; give the delivery code at the door.',
    DELIVERED: 'Delivered with a valid proof.',
    FAILED: 'Delivery failed (reason shown); parcel returns to the pharmacy.',
    RETURNED: 'Back at the pharmacy; a refund request was opened.',
    CANCELLED: 'Order cancelled before pickup.',
  },
};
const labelsFr = (
  fr as unknown as { labels: Record<string, Record<string, string>> }
).labels;
const labelsAr = (
  ar as unknown as { labels: Record<string, Record<string, string>> }
).labels;
const section = (title: string, key: string, explain: (s: string) => string) =>
  `## ${title}\n\n| Value | fr | ar | Meaning for the user |\n|---|---|---|---|\n` +
  Object.keys(labelsFr[key])
    .map(
      (s) =>
        `| \`${s}\` | ${esc(labelsFr[key][s])} | ${esc(labelsAr[key]?.[s])} | ${esc(explain(s))} |`,
    )
    .join('\n') +
  '\n';
writeFileSync(
  resolve(OUT, 'statuses.md'),
  `# Status dictionaries (generated)\n\nLabels come from \`src/i18n/{fr,ar}.json\` (\`labels.*\`). The API already returns localized labels where useful ` +
    `(e.g. the order timeline); use these tables for badges, filters and empty states. Order transitions: [../06-order-state-machine.md](../06-order-state-machine.md).\n\n` +
    section(
      'Request (`requests.status`)',
      'request_status',
      (s) => EXPLAIN.request_status[s] ?? '',
    ) +
    '\n' +
    section(
      'Offer (`offers.status`)',
      'offer_status',
      (s) => EXPLAIN.offer_status[s] ?? '',
    ) +
    '\n' +
    section(
      'Order (`orders.status`)',
      'order_status',
      (s) => labelsFr.order_status_description?.[s] ?? '',
    ) +
    '\n' +
    section(
      'Payment (`payments.status`)',
      'payment_status',
      (s) => EXPLAIN.payment_status[s] ?? '',
    ) +
    '\n' +
    section(
      'Delivery (`deliveries.status`)',
      'delivery_status',
      (s) => EXPLAIN.delivery_status[s] ?? '',
    ),
);

// -------------------------------------------------------------------- curl

type Op = {
  tags?: string[];
  summary?: string;
  security?: unknown[];
  requestBody?: { content?: Record<string, { schema?: unknown }> };
  parameters?: { name: string; in: string; required?: boolean }[];
};
const openapi = JSON.parse(
  readFileSync(resolve(process.cwd(), 'docs/openapi.json'), 'utf8'),
) as {
  paths: Record<string, Record<string, Op>>;
  components: { schemas: Record<string, unknown> };
};
type S = {
  $ref?: string;
  type?: string;
  example?: unknown;
  enum?: unknown[];
  items?: S;
  properties?: Record<string, S>;
  required?: string[];
  format?: string;
};
const sample = (s: S | undefined, d = 0): unknown => {
  if (!s || d > 5) return undefined;
  if (s.$ref)
    return sample(
      openapi.components.schemas[s.$ref.split('/').pop()!] as S,
      d + 1,
    );
  if (s.example !== undefined) return s.example;
  if (s.enum) return s.enum[0];
  if (s.type === 'array')
    return [sample(s.items, d + 1)].filter((x) => x !== undefined);
  if (s.type === 'object' || s.properties)
    return Object.fromEntries(
      Object.entries(s.properties ?? {})
        .filter(([k]) => !s.required || s.required.includes(k) || d === 0)
        .map(([k, v]) => [k, sample(v, d + 1)]),
    );
  return s.type === 'integer' || s.type === 'number'
    ? 1
    : s.type === 'boolean'
      ? true
      : s.format === 'uuid'
        ? '<uuid>'
        : '<string>';
};
const group = (path: string) =>
  path.startsWith('/admin')
    ? 'admin'
    : path.startsWith('/pharmacy') ||
        (path.startsWith('/pharmacies/') && path.includes('/staff'))
      ? 'pharmacy'
      : path.startsWith('/delivery')
        ? 'delivery'
        : path.startsWith('/auth') ||
            path.startsWith('/me') ||
            path.startsWith('/health') ||
            path === '/ready' ||
            path.startsWith('/geo') ||
            path.startsWith('/files') ||
            path.startsWith('/notifications') ||
            path.startsWith('/conversations')
          ? 'common'
          : 'patient';
const groups = new Map<string, string[]>();
for (const [path, ops] of Object.entries(openapi.paths)) {
  for (const [method, op] of Object.entries(ops)) {
    const json = op.requestBody?.content?.['application/json']?.schema as
      S | undefined;
    const multipart = op.requestBody?.content?.['multipart/form-data'];
    const url = path.replace(/\{(\w+)\}/g, '<$1>');
    const query = (op.parameters ?? [])
      .filter((p) => p.in === 'query' && p.required)
      .map((p) => `${p.name}=<${p.name}>`)
      .join('&');
    const idem =
      method === 'post' &&
      (/\/pay$/.test(path) || /^\/offers\/\{id\}\/accept$/.test(path));
    const lines = [
      `curl -X ${method.toUpperCase()} "$BASE_URL${url}${query ? `?${query}` : ''}"`,
      ...(op.security?.length || path.startsWith('/admin')
        ? ['  -H "Authorization: Bearer $TOKEN"']
        : []),
      '  -H "Accept-Language: fr"',
      ...(idem ? ['  -H "Idempotency-Key: $(uuidgen)"'] : []),
      ...(json
        ? [
            '  -H "Content-Type: application/json"',
            `  -d '${JSON.stringify(sample(json) ?? {}).replace(/'/g, "'\\''")}'`,
          ]
        : []),
      ...(multipart
        ? ['  -F "purpose=PRESCRIPTION" -F "files=@./ordonnance.jpg"']
        : []),
    ];
    const g = group(path);
    groups.set(g, [
      ...(groups.get(g) ?? []),
      `### ${method.toUpperCase()} ${path}\n\n${op.summary ?? ''}\n\n\`\`\`bash\n${lines.join(' \\\n')}\n\`\`\`\n`,
    ]);
  }
}
const TITLES: Record<string, string> = {
  common: 'Auth, account, files, notifications, conversations, health',
  patient: 'Patient',
  pharmacy: 'Pharmacy',
  delivery: 'Delivery (drivers & companies)',
  admin: 'Administration',
};
let total = 0;
for (const [g, items] of groups) {
  total += items.length;
  writeFileSync(
    resolve(OUT, `curl/${g}.md`),
    `# cURL – ${TITLES[g]} (generated)\n\n\`export BASE_URL=http://localhost:3000 TOKEN=<access_token>\`. Bodies are minimal examples built from the OpenAPI schemas – replace \`<…>\` placeholders. ${items.length} endpoints.\n\n${items.join('\n')}`,
  );
}
console.log(
  `✓ errors.md (${rows.length} codes), statuses.md, curl/*.md (${total} endpoints)`,
);
