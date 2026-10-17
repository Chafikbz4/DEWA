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
  read_at: string | null;
  created_at: string;
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

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001").replace(/\/+$/, "");
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
  me: () => apiRequest("/patients/me"),
  requests: (status?: string) => apiRequest(`/requests${status ? `?status=${encodeURIComponent(status)}` : ""}`),
  request: (id: string) => apiRequest(`/requests/${id}`),
  createRequest: (payload: unknown) => apiRequest("/requests", { method: "POST", body: JSON.stringify(payload) }),
  offers: (requestId: string) => apiRequest(`/requests/${requestId}/offers/compare`),
  acceptOffer: (id: string, fulfillment_type: "PICKUP" | "DELIVERY") =>
    apiRequest(`/offers/${id}/accept`, { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ fulfillment_type }) }),
  orders: (status?: string) => apiRequest(`/orders${status ? `?status=${encodeURIComponent(status)}` : ""}`),
  order: (id: string) => apiRequest(`/orders/${id}`),
  pharmaciesNearby: () => apiRequest("/pharmacies/nearby"),
  notifications: () => apiRequest<Notification[]>("/notifications?page=1&limit=20&order=desc"),
  markNotificationRead: (id: string) => apiRequest(`/notifications/${id}/read`, { method: "POST" }),
  markAllNotificationsRead: () => apiRequest("/notifications/read-all", { method: "POST" }),
  notificationPreferences: () => apiRequest<NotificationPreferences>("/notifications/preferences"),
  updateNotificationPreferences: (payload: Partial<Pick<NotificationPreferences, "push_enabled" | "sms_enabled" | "email_enabled" | "muted_types">>) =>
    apiRequest<NotificationPreferences>("/notifications/preferences", { method: "PATCH", body: JSON.stringify(payload) }),
  pharmacySummary: () => apiRequest("/pharmacy/reports/summary"),
  pharmacyMe: () => apiRequest("/pharmacy/me"),
  pharmacyRequests: (status?: string) => apiRequest(`/pharmacy/requests${status ? `?status=${encodeURIComponent(status)}` : ""}`),
  pharmacyOrders: (status?: string) => apiRequest(`/pharmacy/orders${status ? `?status=${encodeURIComponent(status)}` : ""}`),
  pharmacyStock: (query = "") => apiRequest(`/pharmacy/stock${query ? `?${query}` : ""}`),
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
