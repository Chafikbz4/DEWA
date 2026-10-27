type RecordValue = Record<string, unknown>;

const PAID_ORDER_STATUSES = [
  "PAYMENT_CONFIRMED",
  "PREPARING",
  "READY_FOR_PICKUP",
  "DELIVERY_ASSIGNED",
  "PICKED_UP",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "COMPLETED",
];

const ONLINE_METHODS = ["CCP", "BARIDIMOB"];
const SETTLED_FULFILLMENTS = ["PICKED_UP", "DELIVERED", "COMPLETED"];

export type PaymentSummary = {
  paid_count: number;
  total_paid_centimes: number;
  online_pending_count: number;
  online_pending_centimes: number;
  last_paid_at: unknown;
};

function amountOf(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Single source of truth for patient payments.
 * Cash on delivery / pickup is settled once the pharmacy collects or delivers
 * the order. Online methods stay "not charged" until the backend records PAID.
 */
export function summarizePatientPayments(
  requests: RecordValue[],
  orders: RecordValue[],
): PaymentSummary {
  const requestById = new Map(
    requests.map((request) => [String(request.id ?? ""), request]),
  );
  const seen = new Set<string>();
  let paid_count = 0;
  let total_paid_centimes = 0;
  let online_pending_count = 0;
  let online_pending_centimes = 0;
  let last_paid_at: unknown = null;
  let last_paid_value = -Infinity;

  function record(
    method: string,
    amount: number,
    paid: boolean,
    paidAt: unknown,
  ) {
    if (paid) {
      paid_count += 1;
      total_paid_centimes += amount;
      const value = paidAt ? new Date(String(paidAt)).valueOf() : NaN;
      if (Number.isFinite(value) && value > last_paid_value) {
        last_paid_value = value;
        last_paid_at = paidAt;
      }
    } else if (ONLINE_METHODS.includes(method)) {
      online_pending_count += 1;
      online_pending_centimes += amount;
    }
  }

  orders.forEach((order) => {
    const requestId = String(order.request_id ?? "");
    const request = requestById.get(requestId) ?? {};
    if (requestId) seen.add(requestId);
    const method = String(request.payment_method ?? "").toUpperCase();
    const online = ONLINE_METHODS.includes(method);
    const paymentStatus = String(request.payment_status ?? "").toUpperCase();
    const orderStatus = String(order.status ?? "").toUpperCase();
    const fulfillmentStatus = String(
      request.fulfillment_status ?? order.fulfillment_status ?? "",
    ).toUpperCase();
    const paid =
      paymentStatus === "PAID" ||
      (!online &&
        (PAID_ORDER_STATUSES.includes(orderStatus) ||
          SETTLED_FULFILLMENTS.includes(fulfillmentStatus)));
    const amount = amountOf(
      order.total_centimes ?? request.accepted_amount_centimes,
    );
    record(
      method,
      amount,
      paid,
      request.paid_at ?? (paid ? order.updated_at : null),
    );
  });

  requests.forEach((request) => {
    const requestId = String(request.id ?? "");
    if (!requestId || seen.has(requestId)) return;
    const method = String(request.payment_method ?? "").toUpperCase();
    if (!method) return;
    const online = ONLINE_METHODS.includes(method);
    const paymentStatus = String(request.payment_status ?? "").toUpperCase();
    const fulfillment = String(request.fulfillment_type ?? "").toUpperCase();
    const fulfillmentStatus = String(
      request.fulfillment_status ?? "",
    ).toUpperCase();
    const collected =
      (fulfillment === "PICKUP" && fulfillmentStatus === "PICKED_UP") ||
      (fulfillment === "DELIVERY" && fulfillmentStatus === "DELIVERED");
    const paid = paymentStatus === "PAID" || (!online && collected);
    const amount = amountOf(request.accepted_amount_centimes);
    record(
      method,
      amount,
      paid,
      request.paid_at ?? (paid ? request.fulfillment_updated_at : null),
    );
  });

  return {
    paid_count,
    total_paid_centimes,
    online_pending_count,
    online_pending_centimes,
    last_paid_at,
  };
}

/** Requests the patient actually received (delivery completed). */
export function deliveredRequestCount(
  requests: RecordValue[],
  orders: RecordValue[],
) {
  const delivered = new Set<string>();
  orders.forEach((order) => {
    const status = String(order.status ?? "").toUpperCase();
    const fulfillment = String(order.fulfillment_type ?? "").toUpperCase();
    if ((status === "DELIVERED" || status === "COMPLETED") && fulfillment !== "PICKUP") {
      const key = String(order.request_id ?? order.id ?? "");
      if (key) delivered.add(key);
    }
  });
  requests.forEach((request) => {
    const fulfillment = String(request.fulfillment_type ?? "").toUpperCase();
    if (String(request.fulfillment_status ?? "").toUpperCase() === "DELIVERED" && fulfillment !== "PICKUP") {
      const key = String(request.id ?? request.reference ?? "");
      if (key) delivered.add(key);
    }
  });
  return delivered.size;
}
