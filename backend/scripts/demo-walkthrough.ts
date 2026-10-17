/* End-to-end happy path against a RUNNING dev/staging API seeded with
 * `npm run db:seed:demo` (mock payment provider, NODE_ENV != production):
 *   patient login → upload prescription → request → pharmacist offer → accept
 *   → pharmacist validation → pay (mock) → prepare → ready → pickup hand-over
 *   → receipt.
 * Usage: BASE_URL=http://localhost:3000 DEMO_PASSWORD=... npm run demo
 */
const BASE = (process.env.BASE_URL ?? 'http://localhost:3000').replace(
  /\/$/,
  '',
);
const PASSWORD = process.env.DEMO_PASSWORD;
// 1×1 PNG – stands in for a prescription photo.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

type Env = {
  success: boolean;
  data: any;
  error?: { code: string; message?: string };
};

async function call(
  method: string,
  path: string,
  opts: {
    token?: string;
    body?: unknown;
    form?: FormData;
    headers?: Record<string, string>;
  } = {},
) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Accept-Language': 'fr',
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.body !== undefined
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...opts.headers,
    },
    body:
      opts.form ??
      (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
  });
  const json = (await res.json()) as Env;
  if (!json.success)
    throw new Error(
      `${method} ${path} → ${res.status} ${json.error?.code}: ${json.error?.message ?? ''}`,
    );
  return json.data;
}

const step = (n: number, label: string, detail = '') =>
  console.log(
    `${String(n).padStart(2)}. ${label}${detail ? ` – ${detail}` : ''}`,
  );

async function main() {
  if (!PASSWORD)
    throw new Error('Set DEMO_PASSWORD (printed by npm run db:seed:demo)');
  const login = async (identifier: string) =>
    (
      await call('POST', '/auth/login', {
        body: { identifier, password: PASSWORD },
      })
    ).access_token as string;

  const patient = await login('patient@demo.dewa.dz');
  const pharmacist = await login('pharmacist1@demo.dewa.dz');
  step(1, 'Logged in', 'patient + pharmacist');

  const [address] = await call('GET', '/patients/me/addresses', {
    token: patient,
  });
  const form = new FormData();
  form.append('purpose', 'PRESCRIPTION');
  form.append(
    'files',
    new Blob([PNG], { type: 'image/png' }),
    'ordonnance.png',
  );
  const [file] = await call('POST', '/files/upload', { token: patient, form });
  step(2, 'Prescription uploaded (encrypted at rest)', file.id);

  const nearby = await call(
    'GET',
    `/pharmacies/nearby?lat=36.7552&lng=3.0601&radius=5`,
    { token: patient },
  ).catch(() => []);
  const pharmacyId = nearby[0]?.id;
  const request = await call('POST', '/requests', {
    token: patient,
    body: {
      request_type: 'PRESCRIPTION',
      file_ids: [file.id],
      address_id: address.id,
      delivery_wanted: false,
      consent_to_share: true,
      ...(pharmacyId ? { pharmacy_ids: [pharmacyId] } : {}),
      items: [{ raw_name: 'Augmentin 1 g', quantity: 1 }],
    },
  });
  step(3, 'Request sent', `${request.reference} (${request.status})`);

  const offer = await call('POST', `/pharmacy/requests/${request.id}/offers`, {
    token: pharmacist,
    body: {
      items: [
        {
          request_item_id: request.items[0].id,
          name: 'Augmentin 1 g',
          quantity_offered: 1,
          unit_price_centimes: 85000,
          availability: 'AVAILABLE',
        },
      ],
      delivery_available: false,
      preparation_minutes: 20,
    },
  });
  await call('POST', `/pharmacy/offers/${offer.id}/send`, {
    token: pharmacist,
  });
  step(4, 'Pharmacy offer sent', `${offer.total_centimes / 100} DZD`);

  const order = await call('POST', `/offers/${offer.id}/accept`, {
    token: patient,
    body: { fulfillment_type: 'PICKUP' },
    headers: { 'Idempotency-Key': crypto.randomUUID() },
  });
  step(5, 'Offer accepted → order', `${order.reference} (${order.status})`);

  await call('POST', `/pharmacy/orders/${order.id}/validate`, {
    token: pharmacist,
    body: { decision: 'APPROVE', confirm: true, note: 'Ordonnance conforme.' },
  });
  step(6, 'Pharmacist validated the prescription');

  const pay = await call('POST', `/orders/${order.id}/pay`, {
    token: patient,
    headers: { 'Idempotency-Key': crypto.randomUUID() },
  });
  const providerOrderId = String(pay.redirect_url).split('/').pop();
  await call('POST', `/payments/mock/${providerOrderId}/simulate`, {
    body: { result: 'PAID' },
  });
  const status = await call('GET', `/payments/${pay.payment_id}/status`, {
    token: patient,
  });
  step(7, 'Paid with the mock gateway, verified server-side', status.status);

  await call('POST', `/pharmacy/orders/${order.id}/start-preparing`, {
    token: pharmacist,
  });
  await call('POST', `/pharmacy/orders/${order.id}/ready`, {
    token: pharmacist,
  });
  step(8, 'Prepared and ready for pickup');

  const { collection_code } = await call(
    'POST',
    `/orders/${order.id}/collection-code`,
    { token: patient },
  );
  await call('POST', `/pharmacy/orders/${order.id}/handover`, {
    token: pharmacist,
    body: { collection_code },
  });
  step(9, 'Handed over with the collection code');

  const receipt = await call('GET', `/orders/${order.id}/receipt`, {
    token: patient,
  });
  const timeline = await call('GET', `/orders/${order.id}/timeline`, {
    token: patient,
  });
  step(
    10,
    'Receipt issued',
    `${receipt.receipt_number} – ${receipt.total_centimes / 100} DZD`,
  );
  console.log(
    `\nTimeline: ${timeline.events.map((e: { status: string }) => e.status).join(' → ')}`,
  );
}

main().catch((err) => {
  console.error(`✗ ${(err as Error).message}`);
  process.exit(1);
});
