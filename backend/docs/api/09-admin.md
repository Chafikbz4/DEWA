# 09 – Administration (least privilege)

Conventions: [00-conventions.md](./00-conventions.md) · errors: [errors.md](./errors.md).

## 1. Model

- Accounts with role `SUPER_ADMIN` hold **every** permission, including the SUPER_ADMIN-only actions.
- Accounts with role `ADMIN` hold **only** the permissions of their **sub-roles**:
  - sub-roles are assigned in `admin_user_roles`;
  - each sub-role's permissions live in `admin_role_permissions`, seeded with the defaults below and editable by a SUPER_ADMIN;
  - an ADMIN with no sub-role can do nothing except read its own permissions.
- Every admin endpoint requires an **MFA-enabled** session. An admin cannot log in without TOTP (enrolment is forced on first login), and the guard re-checks MFA (`403 ADMIN_MFA_REQUIRED`).
- When a permission is missing, the API returns `403 PERMISSION_DENIED` with `details.required = [permission]`. Non-admin roles get `403 ROLE_FORBIDDEN`.
- Every write is audited with its reason and, for configuration changes, the before/after values.
- Removing a sub-role from an admin, or changing a user's role, revokes that account's sessions.

`GET /admin/me/permissions` (any admin) returns `{ role, admin_roles, permissions, mfa_enabled }`, which the back-office can use to show or hide menus.

## 2. Default permission matrix

| Permission | VERIFICATION | SUPPORT | FINANCE | COMPLIANCE |
|---|:-:|:-:|:-:|:-:|
| `users.read` | ✓ | ✓ | | ✓ |
| `users.manage` | | ✓ | | |
| `verification.read` | ✓ | | | |
| `verification.decide` | ✓ | | | |
| `monitoring.read` | | ✓ | ✓ | ✓ |
| `sensitive.access` | | ✓ | | ✓ |
| `payments.read` | | | ✓ | |
| `refunds.decide` | | | ✓ | |
| `settlements.manage` | | | ✓ | |
| `commission.manage` | | | ✓ | |
| `delivery_config.manage` | | | ✓ | |
| `complaints.read` | | ✓ | | ✓ |
| `complaints.manage` | | ✓ | | |
| `eligibility.manage` | | | | ✓ |
| `catalog.manage` | | | | ✓ |
| `analytics.read` | | | ✓ | ✓ |
| `audit.read` | | | | ✓ |
| `security.read` | | | | ✓ |
| `settings.manage` | | | | |
| `templates.manage` | | | | |

Only SUPER_ADMIN can change `settings.manage`, `templates.manage` and anything marked "SUPER" below, unless a SUPER_ADMIN grants these permissions to a sub-role.

## 3. Endpoints and required permission

### Access (SUPER_ADMIN)
| Method | Path | Permission |
|---|---|---|
| GET | /admin/me/permissions | any admin |
| GET | /admin/permissions | SUPER |
| PUT | /admin/permissions/:role | SUPER. Body `{ permissions[], reason }` |
| PUT | /admin/users/:id/admin-roles | SUPER. Body `{ roles[], reason }`. The target must be an ADMIN |
| POST | /admin/users | SUPER (create an ADMIN) |
| PATCH | /admin/users/:id/role | SUPER |

### Users
| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | /admin/users | users.read | Filters: role, status, search, sort. Audited |
| GET | /admin/users/:id | users.read | Account data only, never health data. Audited |
| POST | /admin/users/:id/suspend | users.manage | `{ reason }`. Revokes sessions and notifies the user |
| POST | /admin/users/:id/reactivate | users.manage | `{ reason }`. Notifies the user |
| PATCH | /admin/users/:id/status | users.manage | Legacy form of suspend / reactivate |

Admins cannot modify themselves or SUPER_ADMIN accounts. Only a SUPER_ADMIN can modify ADMIN accounts.

### Verification queues (`:kind` = `pharmacies` | `delivery-companies` | `drivers` | `dependants`)
| Method | Path | Permission |
|---|---|---|
| GET | /admin/verification/:kind | verification.read. Oldest first, default status = pending |
| GET | /admin/verification/:kind/:id | verification.read. Includes documents; open them with `GET /files/:file_id/access-url` (signed, logged) |
| POST | /admin/verification/:kind/:id/approve | verification.decide. `{ note? }` |
| POST | /admin/verification/:kind/:id/reject | verification.decide. `{ reason }` |
| POST | /admin/verification/:kind/:id/request-documents | verification.decide. `{ reason, doc_types? }` (not for dependants) |

What each decision does:
- **Approve**: the entity becomes VERIFIED (a dependant becomes `VERIFIED`), its pending documents are APPROVED, the PENDING_VERIFICATION account becomes ACTIVE, and the holder is notified (VERIFICATION_DECIDED).
- **Reject**: the entity becomes REJECTED and its documents are rejected with the reason. A rejected driver stays PENDING_VERIFICATION and can upload new documents.
- **Request documents**: the listed document types are marked REJECTED. A pharmacy goes back to DRAFT so it can resubmit.

### Monitoring and sensitive access
| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | /admin/requests | monitoring.read | Metadata only (status, type, area, counts). No items, files, notes or Chifa data |
| GET | /admin/requests/:id | monitoring.read | Recipients, offer totals, counts |
| GET | /admin/requests/:id/content | sensitive.access **and an active REQUEST grant** | Items, patient note, file ids, Chifa holder and masked number |
| GET | /admin/orders | monitoring.read | Amounts, statuses and parties. No item names |
| GET | /admin/orders/:id | monitoring.read | History, payments, refunds, delivery |
| GET | /admin/conversations/:id/messages | sensitive.access **and an active CONVERSATION grant** | |
| POST | /admin/sensitive-access | sensitive.access | `{ resource_type: "REQUEST" \| "CONVERSATION", resource_id, justification (≥ 20 chars) }` |
| GET | /admin/sensitive-access | any admin | Your own grants; `all=true` requires audit.read; `active=true` |
| DELETE | /admin/sensitive-access/:id | any admin (own grant) | Closes the grant early |

How grants work:
- A grant is personal and tied to one resource. It lasts `sensitive_access_grant_minutes` (default **30**).
- Without a grant: `403 SENSITIVE_ACCESS_GRANT_REQUIRED`. Prescription, Chifa and chat-attachment files return `404` from `/files/:id/access-url`.
- Opening a grant, each content read and each file URL are written to `sensitive_access_logs` (with the justification) and to the audit log.

### Payments
| Method | Path | Permission |
|---|---|---|
| GET | /admin/payments/dashboard | payments.read |
| GET | /admin/payments/reconciliation | payments.read |
| POST | /admin/payments/reconciliation/run | payments.read |
| POST | /admin/payments/reconciliation/:id/resolve | refunds.decide |
| GET | /admin/refunds | payments.read |
| POST | /admin/refunds/:id/approve, /reject | refunds.decide |
| GET | /admin/settlements | payments.read |
| POST | /admin/settlements/generate, /:id/approve, /:id/mark-paid | settlements.manage |

### Delivery configuration (delivery_config.manage)
| Method | Path | Notes |
|---|---|---|
| GET / POST | /admin/delivery/zones | `{ wilaya_id, commune_id? }`; returns 409 if an active zone already exists for that area |
| PATCH | /admin/delivery/zones/:id | `{ is_active }` |
| GET / POST | /admin/delivery/fee-rules | `{ zone_id, base_fee_centimes, per_km_centimes?, min_fee_centimes?, max_fee_centimes?, effective_from? }` |
| PATCH | /admin/delivery/fee-rules/:id | Partial update, or `is_active: false` |
| GET / PATCH | /admin/delivery/settings | `delivery_assignment_timeout_minutes`, `delivery_max_releases_per_day`, `driver_location_min_interval_seconds`, `delivery_code_max_attempts` + `reason` |

`delivery_enabled` is a legal switch and can only be changed through `/admin/settings` (settings.manage).

### Complaints
| Method | Path | Permission |
|---|---|---|
| GET | /admin/complaints | complaints.read. Filters: status, against_type, assigned (`me` or id) |
| GET | /admin/complaints/:id | complaints.read. Includes internal notes (`is_internal`) |
| POST | /admin/complaints/:id/assign | complaints.manage. `{ admin_user_id? }`; OPEN → IN_REVIEW |
| PATCH | /admin/complaints/:id/status | complaints.manage. `{ status: IN_REVIEW \| ESCALATED \| REJECTED, reason }` |
| POST | /admin/complaints/:id/notes | complaints.manage. Internal note, never shown to the parties |
| POST | /admin/complaints/:id/resolve | complaints.manage. `{ outcome, note, refund_amount_centimes? }` |

Resolution outcomes:
- **NONE**: the complaint is closed with no further action.
- **REFUND**: a refund **request** is created and then approved by finance in the refund queue (separation of duties).
- **WARNING**: the party is notified (COMPLAINT_OUTCOME).
- **SUSPENSION**: suspends the pharmacy, driver or patient and revokes their sessions. It also requires `users.manage`.

The reporter is notified when the complaint is closed.

### Commission and eligibility
| Method | Path | Permission | Rules |
|---|---|---|---|
| GET / POST | /admin/commission-rules | commission.manage | `legal_review_note` is required. A new rule is always **disabled** |
| PATCH | /admin/commission-rules/:id | commission.manage | `{ value?, is_active?, legal_review_note?, reason }`. Activating a rule deactivates the other active rule for the same target |
| GET | /admin/eligibility-policies | eligibility.manage | |
| PATCH | /admin/eligibility-policies/:id | eligibility.manage | Takes effect immediately and is audited before/after. **Enabling requires `legal_basis_reference`** (`ELIGIBILITY_LEGAL_BASIS_REQUIRED`, `details.controlled` for CONTROLLED / PSYCHOTROPIC). These categories can never drop pharmacist validation |

### Medicine catalogue (catalog.manage)
| Method | Path | Notes |
|---|---|---|
| GET / POST | /admin/medicines | Search, category, active filters |
| PATCH / DELETE | /admin/medicines/:id | DELETE deactivates the medicine (soft delete) |
| POST | /admin/medicines/import | Multipart `file` (CSV ≤ 5 MB, ≤ 10 000 lines), `dry_run`. Creates or updates by `regulatory_code` and returns a line report |

### Analytics, audit and settings
| Method | Path | Permission |
|---|---|---|
| GET | /admin/analytics/overview?from&to&wilaya_id | analytics.read |
| GET | /admin/audit-logs | audit.read |
| GET | /admin/audit-logs/export | audit.read. CSV, max 10 000 rows, formula-safe; the export itself is audited |
| GET | /admin/security-events | security.read. Results go in `meta.last_24h`, including `suspicious_ips` (≥ 10 failed logins) |
| GET | /admin/settings | settings.manage |
| PATCH | /admin/settings/:key | settings.manage. `{ value, reason }`, type-checked; history kept |
| GET | /admin/settings/:key/history | settings.manage |
| GET | /admin/notification-templates | templates.manage |
| PUT / DELETE | /admin/notification-templates/:type/:lang | templates.manage. Only the default template's placeholders are accepted, so a template can never add a medicine name |

The analytics overview returns:
- `requests { total, with_order, conversion_rate }`;
- `offers { sent, accepted, conversion_rate, average_response_minutes }`;
- `orders_by_status`, `gmv_centimes` (paid orders), `refunds_centimes`, `paid_orders`;
- `delivery { delivered, failed, success_rate }`;
- `by_wilaya[]` and `by_date[]` (one entry per day; range at most 366 days, default the last 30 days).

## 4. Error codes

`PERMISSION_DENIED`, `ADMIN_MFA_REQUIRED`, `ADMIN_ROLE_TARGET_INVALID`, `SENSITIVE_ACCESS_GRANT_REQUIRED`, `VERIFICATION_INVALID_STATE`, `VERIFICATION_REASON_REQUIRED`, `COMPLAINT_ASSIGNEE_INVALID`, `COMPLAINT_OUTCOME_INVALID`, `DELIVERY_ZONE_EXISTS`, `LEGAL_REVIEW_NOTE_REQUIRED`, `ELIGIBILITY_LEGAL_BASIS_REQUIRED`, `ELIGIBILITY_RULE_FORBIDDEN`, `MEDICINE_CODE_TAKEN`, `CATALOG_IMPORT_INVALID_FILE`, `SETTING_NOT_FOUND`, `SETTING_VALUE_INVALID`, `NOTIFICATION_TEMPLATE_NOT_FOUND`, `NOTIFICATION_TEMPLATE_INVALID`.
