/** Backend compatibility locale; the web interface itself is English-only. */
export type Language = "fr";

export type ApiEnvelope<T> = {
  success: boolean;
  data: T | null;
  error: { code: string; message: string; details?: unknown } | null;
  meta?: { request_id?: string; [key: string]: unknown };
};

export type Notification = {
  id: string;
  type: string;
  title: string;
  body: string;
  title_key?: string;
  body_key?: string;
  data?: Record<string, string>;
  params?: Record<string, string | number>;
  read_at: string | null;
  created_at: string;
};
export type PatientProfile = {
  user_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  gender: string | null;
  preferred_language: string;
  updated_at: string;
};

export type NotificationPreferences = {
  push_enabled: boolean;
  sms_enabled: boolean;
  email_enabled: boolean;
  muted_types: string[];
  available_types: string[];
};

export type Paginated<T> = T[] | { items?: T[]; data?: T[] };
export type SessionUser = { role: string };
export type Session = { access_token: string; refresh_token?: string; user?: SessionUser };
export type LoginResult = Session & { mfa_required?: false } | { mfa_required: true; mfa_setup_required?: boolean; mfa_token: string };

function withQuery(path: string, params: Record<string, string | number | undefined>) {
  const query = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== "")
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join("&");
  return query ? `${path}?${query}` : path;
}
export type DeliveryCompany = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  status?: string;
};
export type OrderCheckout = {
  order_id: string;
  reference: string;
  status: string;
  currency: string;
  items_subtotal_centimes: number;
  delivery_fee_centimes: number;
  service_fee_centimes: number;
  total_centimes: number;
  payable: boolean;
  payment_provider?: string;
  payment_collection_model?: string;
};

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000").replace(/\/+$/, "");
let accessToken: string | null = null;
let refreshToken: string | null = null;
let refreshPromise: Promise<void> | null = null;
const SESSION_STORAGE_KEY = "dewa.session";

function restoreSession() {
  if (accessToken || typeof window === "undefined") return;
  const stored = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
  if (!stored) return;
  try {
    const tokens = JSON.parse(stored) as { access_token?: string; refresh_token?: string };
    if (tokens.access_token) {
      accessToken = tokens.access_token;
      refreshToken = tokens.refresh_token ?? null;
    }
  } catch {
    window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
  }
}

export function setSession(tokens: Session) {
  const previous = typeof window !== "undefined" ? getSession() : null;
  const session = { ...tokens, user: tokens.user ?? previous?.user };
  accessToken = session.access_token;
  refreshToken = session.refresh_token ?? null;
  if (typeof window !== "undefined") {
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  }
}

export function getSession(): Session | null {
  restoreSession();
  if (!accessToken) return null;
  if (typeof window === "undefined") return { access_token: accessToken, refresh_token: refreshToken ?? undefined };
  try {
    return JSON.parse(window.sessionStorage.getItem(SESSION_STORAGE_KEY) ?? "null") as Session | null;
  } catch {
    return null;
  }
}

export function clearSession() {
  accessToken = null;
  refreshToken = null;
  if (typeof window !== "undefined") window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
}

async function refreshSession(language: Language) {
  if (!refreshToken) throw new Error("SESSION_EXPIRED");
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept-Language": language },
      body: JSON.stringify({ refresh_token: refreshToken }),
    }).then(async (response) => {
      const body = (await response.json()) as ApiEnvelope<{ access_token: string; refresh_token: string }>;
      if (!response.ok || !body.data) {
        clearSession();
        throw new Error(body.error?.code ?? "SESSION_EXPIRED");
      }
      setSession(body.data);
    }).finally(() => {
      refreshPromise = null;
    });
  }
  await refreshPromise;
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit & { language?: Language } = {},
): Promise<T> {
  restoreSession();
  const { language = "fr", ...request } = options;
  const headers = new Headers(request.headers);
  headers.set("Accept-Language", language);
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  if (request.body && !(request.body instanceof FormData)) headers.set("Content-Type", "application/json");

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { ...request, headers });
  } catch {
    throw new Error(`Unable to reach the DEWA API at ${API_BASE_URL}. Check that the backend is running.`);
  }
  if (response.status === 401 && refreshToken) {
    const firstBody = (await response.clone().json().catch(() => null)) as ApiEnvelope<unknown> | null;
    if (firstBody?.error?.code === "AUTH_TOKEN_EXPIRED") {
      await refreshSession(language);
      headers.set("Authorization", `Bearer ${accessToken}`);
      try {
        response = await fetch(`${API_BASE_URL}${path}`, { ...request, headers });
      } catch {
        throw new Error(`Unable to reach the DEWA API at ${API_BASE_URL}. Check that the backend is running.`);
      }
    }
  }

  const body = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (response.status === 401 && !accessToken) {
    throw new Error("Please sign in to access this page.");
  }
  if (!response.ok || !body?.success) {
    throw new Error(body?.error?.message ?? body?.error?.code ?? `API_${response.status}`);
  }
  return body.data as T;
}

export const api = {
  registerPatient: (payload: unknown, language: Language = "fr") =>
    apiRequest<{ target_masked?: string }>("/auth/register/patient", { method: "POST", body: JSON.stringify(payload), language }),
  registerPharmacy: (payload: unknown, language: Language = "fr") =>
    apiRequest<{ target_masked?: string }>("/auth/register/pharmacy", { method: "POST", body: JSON.stringify(payload), language }),
  registerDriver: (payload: unknown, language: Language = "fr") =>
    apiRequest<{ target_masked?: string }>("/auth/register/driver", { method: "POST", body: JSON.stringify(payload), language }),
  registerCompany: (payload: unknown, language: Language = "fr") =>
    apiRequest<{ target_masked?: string }>("/auth/register/delivery-company", { method: "POST", body: JSON.stringify(payload), language }),
  verifyOtp: (payload: unknown, language: Language = "fr") =>
    apiRequest<{ access_token: string; refresh_token: string; user: { role: string } }>("/auth/otp/verify", { method: "POST", body: JSON.stringify(payload), language }),
  login: (identifier: string, password: string, language: Language = "fr") =>
    apiRequest<LoginResult>("/auth/login", {
      method: "POST", body: JSON.stringify({ identifier, password }), language,
    }),
  loginMfa: (mfa_token: string, code: string) =>
    apiRequest<Session>("/auth/login/mfa", { method: "POST", body: JSON.stringify({ mfa_token, code }) }),
  setupMfa: (mfa_token: string) =>
    apiRequest<{ secret: string; otpauth_url: string }>("/auth/mfa/setup", { method: "POST", body: JSON.stringify({ mfa_token }) }),
  enableMfa: (mfa_token: string, code: string) =>
    apiRequest<Session>("/auth/mfa/enable", { method: "POST", body: JSON.stringify({ mfa_token, code }) }),
  me: () => apiRequest<PatientProfile>("/patients/me"),
  updatePatientProfile: (payload: unknown) => apiRequest<PatientProfile>("/patients/me", { method: "PATCH", body: JSON.stringify(payload) }),
  changePassword: (current_password: string, new_password: string) =>
    apiRequest("/auth/password/change", { method: "POST", body: JSON.stringify({ current_password, new_password }) }),
  addresses: () => apiRequest("/patients/me/addresses"),
  createAddress: (payload: unknown) => apiRequest("/patients/me/addresses", { method: "POST", body: JSON.stringify(payload) }),
  uploadFiles: (file: File) => {
    const form = new FormData();
    form.append("purpose", "PRESCRIPTION");
    form.append("files", file);
    return apiRequest<{ id: string }[]>("/files/upload", { method: "POST", body: form });
  },
  wilayas: () => apiRequest("/geo/wilayas"),
  communes: (wilayaId: number) => apiRequest(`/geo/wilayas/${wilayaId}/communes`),
  requests: (options?: { status?: string; limit?: number }) => apiRequest(withQuery("/requests", { status: options?.status, limit: options?.limit })),
  request: (id: string) => apiRequest(`/requests/${id}`),
  requestCheckout: (id: string, payload: { fulfillment_type: "PICKUP" | "DELIVERY"; delivery_company_id?: string | null; payment_method: "ON_DELIVERY" | "CCP" | "BARIDIMOB" }) =>
    apiRequest(`/requests/${id}/checkout`, { method: "POST", body: JSON.stringify(payload) }),
  createRequest: (payload: unknown) => apiRequest("/requests", { method: "POST", body: JSON.stringify(payload) }),
  offers: (requestId: string) => apiRequest(`/requests/${requestId}/offers/compare`),
  acceptOffer: (id: string, fulfillment_type: "PICKUP" | "DELIVERY") =>
    apiRequest(`/offers/${id}/accept`, { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ fulfillment_type }) }),
  orders: (options?: { status?: string; limit?: number }) => apiRequest(withQuery("/orders", { status: options?.status, limit: options?.limit })),
  order: (id: string) => apiRequest(`/orders/${id}`),
  orderCheckout: (id: string) => apiRequest<OrderCheckout>(`/orders/${id}/checkout`),
  deliveryCompanies: () => apiRequest<DeliveryCompany[]>("/delivery/companies"),
  pharmaciesNearby: () => apiRequest("/pharmacies/nearby"),
  notifications: (options?: { limit?: number; unread?: boolean; type?: string }) =>
    apiRequest(withQuery("/notifications", { page: 1, limit: options?.limit ?? 50, order: "desc", unread: options?.unread ? "true" : undefined, type: options?.type })),
  markNotificationRead: (id: string) => apiRequest(`/notifications/${id}/read`, { method: "POST" }),
  markAllNotificationsRead: () => apiRequest("/notifications/read-all", { method: "POST" }),
  notificationPreferences: () => apiRequest<NotificationPreferences>("/notifications/preferences"),
  updateNotificationPreferences: (payload: Partial<Pick<NotificationPreferences, "push_enabled" | "sms_enabled" | "email_enabled" | "muted_types">>) =>
    apiRequest<NotificationPreferences>("/notifications/preferences", { method: "PATCH", body: JSON.stringify(payload) }),
  pharmacySummary: () => apiRequest("/pharmacy/reports/summary"),
  pharmacyMe: () => apiRequest("/pharmacy/me"),
  updatePharmacyProfile: (payload: unknown) =>
    apiRequest("/pharmacy/me", { method: "PATCH", body: JSON.stringify(payload) }),
  pharmacyRequests: (options?: { recipient_status?: string; request_status?: string; limit?: number }) =>
    apiRequest(withQuery("/pharmacy/requests", { recipient_status: options?.recipient_status, request_status: options?.request_status, limit: options?.limit })),
  pharmacyRequest: (id: string) => apiRequest(`/pharmacy/requests/${id}`),
  pharmacyAcceptRequest: (id: string, amountCentimes: number) => apiRequest(`/pharmacy/requests/${id}/accept-interest`, { method: "POST", body: JSON.stringify({ amount_centimes: amountCentimes }) }),
  pharmacyRejectRequest: (id: string, reason: string) =>
    apiRequest(`/pharmacy/requests/${id}/decline`, { method: "POST", body: JSON.stringify({ reason }) }),
  pharmacyUpdateFulfillment: (id: string, status: "PREPARING" | "READY" | "HANDED_TO_DELIVERY" | "DELIVERED" | "PICKED_UP") =>
    apiRequest(`/pharmacy/requests/${id}/fulfillment`, { method: "POST", body: JSON.stringify({ status }) }),
  pharmacyOrders: (status?: string) => apiRequest(`/pharmacy/orders${status ? `?status=${encodeURIComponent(status)}` : ""}`),
  pharmacyStock: (query = "") => apiRequest(`/pharmacy/stock${query ? `?${query}` : ""}`),
  pharmacyPutStock: (
    medicineId: string,
    payload: {
      stock_status: "IN_STOCK" | "LOW" | "OUT_OF_STOCK";
      quantity?: number | null;
      unit_price_centimes?: number | null;
      image_url?: string | null;
      attributes?: Record<string, string>;
    },
  ) => apiRequest(`/pharmacy/stock/${medicineId}`, { method: "PUT", body: JSON.stringify(payload) }),
  pharmacyDeleteStock: (medicineId: string) =>
    apiRequest(`/pharmacy/stock/${medicineId}`, { method: "DELETE" }),
  medicinesSearch: (query: string, limit = 12) =>
    apiRequest(withQuery("/medicines/search", { q: query, limit })),
  fileAccessUrl: (id: string) => apiRequest<{ url: string }>(`/files/${id}/access-url`),
  pharmacyOffers: () => apiRequest("/pharmacy/offers"),
  deliveryJobs: () => apiRequest("/delivery/jobs/available?radius_km=20"),
  activeDeliveryJobs: () => apiRequest("/delivery/jobs/active"),
  deliveryHistory: () => apiRequest("/delivery/history"),
  deliveryEarnings: () => apiRequest("/delivery/earnings"),
  deliveryMe: () => apiRequest("/delivery/me"),
  deliveryCompany: () => apiRequest("/delivery/company"),
  deliveryDrivers: () => apiRequest("/delivery/company/drivers"),
  deliveryInvitations: () => apiRequest("/delivery/company/invitations"),
  deliveryReports: () => apiRequest("/delivery/company/reports"),
  adminAnalytics: () => apiRequest("/admin/analytics/overview"),
  adminUsers: () => apiRequest("/admin/users"),
  adminOrders: () => apiRequest("/admin/orders"),
  adminPermissions: () => apiRequest("/admin/me/permissions"),
  verificationQueue: (type: "pharmacies" | "drivers" | "delivery-companies" | "dependants") => apiRequest(`/admin/verification/${type}`),
};
