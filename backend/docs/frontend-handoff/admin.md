# Admin back-office – screens and endpoints

Roles `ADMIN` (with sub-roles) and `SUPER_ADMIN`. Every screen depends on the admin's **permissions**: load `GET /admin/me/permissions` after login and build the menu from `permissions[]`. The permission matrix per endpoint is in [../api/09-admin.md](../api/09-admin.md). cURL examples: [curl/admin.md](./curl/admin.md).

**Login:**
1. `POST /auth/login` returns an `mfa_token`.
2. On first login only, enrol TOTP: `POST /auth/mfa/setup` (show the QR code) → `POST /auth/mfa/enable { code }`.
3. On later logins: `POST /auth/login/mfa { mfa_token, code }`.

There is no admin session without TOTP.

| Menu (permission) | Screens and calls |
|---|---|
| Dashboard (`analytics.read`) | `GET /admin/analytics/overview?from&to&wilaya_id` → KPI tiles (requests, conversion, GMV, delivery success, response time), charts from `by_date[]` and `by_wilaya[]` |
| Users (`users.read` / `users.manage`) | `GET /admin/users?role&status&search`, `GET /admin/users/:id`, `POST /admin/users/:id/suspend { reason }`, `POST /admin/users/:id/reactivate { reason }` |
| Admin team (SUPER_ADMIN) | `POST /admin/users` (create an admin), `PUT /admin/users/:id/admin-roles { roles, reason }`, `GET /admin/permissions`, `PUT /admin/permissions/:role`, `PATCH /admin/users/:id/role` |
| Verification (`verification.*`) | Queues `GET /admin/verification/{pharmacies\|delivery-companies\|drivers\|dependants}` (oldest first); detail `GET …/:id`; open documents with `GET /files/:file_id/access-url`; actions `POST …/:id/approve { note? }`, `…/reject { reason }`, `…/request-documents { reason, doc_types? }` |
| Requests and orders (`monitoring.read`) | `GET /admin/requests`, `GET /admin/requests/:id`, `GET /admin/orders`, `GET /admin/orders/:id` (metadata only) |
| Sensitive access (`sensitive.access`) | 1. "Justify access" dialog: `POST /admin/sensitive-access { resource_type: REQUEST \| CONVERSATION, resource_id, justification ≥ 20 chars }`.<br>2. Then `GET /admin/requests/:id/content` or `GET /admin/conversations/:id/messages`.<br>3. Show a 30-minute countdown from `expires_at`; manage grants with `GET /admin/sensitive-access` and `DELETE /admin/sensitive-access/:id`.<br>Without a grant: `403 SENSITIVE_ACCESS_GRANT_REQUIRED` → open the dialog |
| Payments (`payments.read`, `refunds.decide`, `settlements.manage`) | Dashboard: `GET /admin/payments/dashboard`.<br>Reconciliation: `GET /admin/payments/reconciliation?status&kind`, `POST …/run`, `POST …/:id/resolve { note }`.<br>Refunds: `GET /admin/refunds?status=REQUESTED`, `POST /admin/refunds/:id/approve`, `POST /admin/refunds/:id/reject { reason }`.<br>Settlements: `GET /admin/settlements`, `POST /admin/settlements/generate`, `POST …/:id/approve`, `POST …/:id/mark-paid { payout_reference }` |
| Delivery settings (`delivery_config.manage`) | `GET/POST /admin/delivery/zones`, `PATCH …/:id`; `GET/POST /admin/delivery/fee-rules`, `PATCH …/:id`; `GET/PATCH /admin/delivery/settings` |
| Complaints (`complaints.*`) | `GET /admin/complaints?status&assigned=me`, `GET …/:id` (internal notes flagged `is_internal`), `POST …/:id/assign`, `PATCH …/:id/status`, `POST …/:id/notes`, `POST …/:id/resolve { outcome, note, refund_amount_centimes? }` |
| Commission (`commission.manage`) | `GET/POST /admin/commission-rules` (always created disabled), `PATCH …/:id { is_active, reason }` |
| Eligibility (`eligibility.manage`) | `GET /admin/eligibility-policies`, `PATCH …/:id` (enabling needs `legal_basis_reference`) |
| Catalogue (`catalog.manage`) | `GET/POST /admin/medicines`, `PATCH/DELETE …/:id`, `POST /admin/medicines/import` (CSV, `dry_run`) |
| Audit (`audit.read`) | `GET /admin/audit-logs?actor_user_id&action&resource_type&from&to`, CSV download from `GET /admin/audit-logs/export`, retention runs `GET /admin/retention/jobs` |
| Security (`security.read`) | `GET /admin/security-events` (`meta.last_24h.suspicious_ips`) |
| Settings (`settings.manage`) | `GET /admin/settings`, `PATCH /admin/settings/:key { value, reason }`, `GET …/:key/history` |
| Notification texts (`templates.manage`) | `GET /admin/notification-templates`, `PUT /admin/notification-templates/:type/:lang { title, body, reason }` (only the default placeholders are allowed), `DELETE …` to reset |

UX rules:
- Every destructive or sensitive action asks for a **reason** (the API rejects it otherwise). Show it in a confirmation dialog.
- On `403 PERMISSION_DENIED`, read `details.required` to see the missing permission and hide that action.
