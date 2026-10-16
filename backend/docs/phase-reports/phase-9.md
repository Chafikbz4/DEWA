# Phase 9 report – Administration, least privilege

## Built
- **Permission model**: 20 permissions and 4 admin sub-roles: VERIFICATION, SUPPORT, FINANCE, COMPLIANCE.
  - The default matrix is seeded into `admin_role_permissions` and SUPER_ADMIN can edit it. `admin_user_roles` holds each admin's sub-roles.
  - `PermissionsGuard` (global, runs after RolesGuard) checks the role, MFA and every required permission, with no caching so revocations apply at once.
  - `RequireSuperAdmin()` covers admin accounts, role changes and the matrix.
  - An ADMIN with no sub-role can do nothing.
  - Removing a sub-role revokes that admin's sessions.
- **Users**: list (audited), detail (account data only, never health data), suspend / reactivate with a reason (sessions revoked, user notified), and role changes (SUPER_ADMIN only).
- **Verification queues**: pharmacies, delivery companies, drivers and dependant proofs.
  - Each queue lists entities oldest first; the detail view shows documents, which open through signed URLs (`/files/:id/access-url`, audited) with `verification.read`.
  - Decisions are approve, reject (reason required) and request documents. Approval activates the PENDING account. Every decision is audited and notifies the holder (VERIFICATION_DECIDED, localised label).
- **Monitoring**:
  - Requests and orders show metadata only: no items, files, notes, Chifa data or item names.
  - Prescription / Chifa content and conversations need `POST /admin/sensitive-access` with a justification of at least 20 characters. This creates a personal grant tied to one resource, valid for 30 minutes (`sensitive_access_grant_minutes`).
  - The grant and every read or file URL are recorded in `sensitive_access_logs` and the audit log.
  - Without a grant the API returns 403 `SENSITIVE_ACCESS_GRANT_REQUIRED`, and the files return 404.
- **Payments**: the existing admin endpoints moved to permissions (payments.read / refunds.decide / settlements.manage), plus a reconciliation dashboard.
- **Delivery configuration**: zones and fee rules (create, update, deactivate, with a before/after audit), and timeouts / limits through the settings history. `delivery_enabled` stays SUPER_ADMIN only.
- **Complaints**: queue, assignment, status changes and internal notes (`is_internal`, hidden from patients and pharmacies). Resolution outcomes:
  - REFUND opens a refund request that finance approves separately (separation of duties);
  - WARNING notifies the party;
  - SUSPENSION also requires `users.manage`.
  - The reporter is notified when the complaint is closed.
- **Commission / subscription rules**: CRUD. `legal_review_note` is required, new rules are created disabled, and activating one deactivates the other active rule for the same target.
- **Eligibility policies**: changes take effect immediately and are audited before/after. Enabling a policy requires `legal_basis_reference` (flagged for CONTROLLED / PSYCHOTROPIC), and those categories can never drop pharmacist validation.
- **Medicine catalogue**: CRUD (soft delete) and CSV import that creates or updates by regulatory code, with a line report and dry-run mode.
- **Analytics overview**: requests and conversion, offers and conversion, average response time, orders by status, GMV / refunds, delivery success rate, by wilaya and by day.
- **Audit and security**:
  - audit trail with filters and a CSV export (formula-safe, max 10 000 rows, the export itself audited);
  - security events plus last-24 h signals (failed logins, lockouts, refresh-token reuse, suspicious IPs);
  - platform settings: typed PATCH, change history and allowed values;
  - notification template overrides per type and language, validated against the default template's placeholders so a template can never add a medicine name, and applied at render time.

## Migration
`0012_admin_least_privilege.sql` adds:
- the enum `admin_sub_role` and the value `sensitive_resource_type.CONVERSATION`;
- the tables `admin_role_permissions` (seeded with the 25 default pairs), `admin_user_roles`, `sensitive_access_grants`, `platform_setting_changes` and `notification_templates`;
- the columns `complaints.resolution_outcome` and `complaint_messages.is_internal`.

## Tests
- Unit tests for `PermissionsGuard`: non-admin endpoints, role, MFA, every permission required, SUPER_ADMIN-only actions.
- e2e `test/admin.e2e-spec.ts` (9 tests):
  - **permission matrix**: 52 admin endpoints × 6 profiles (4 sub-roles, a bare ADMIN, SUPER_ADMIN), checked against the default matrix;
  - non-admin roles are refused, and missing permissions are reported;
  - sub-role assignment, and session revocation when a sub-role is removed;
  - **sensitive access grants**: metadata without content, then 403 without a grant, justification validation, content plus file access with a grant, logs written, the grant bound to one admin and one resource, then expiry and revocation;
  - verification queues: signed-URL access by permission, request documents, approval activating the owner, notifications, driver approval;
  - suspend / reactivate (reason, sessions revoked, notification, admins protected);
  - eligibility legal-basis guard, commission rules created disabled, typed settings with history;
  - template placeholder validation with the override applied, audit CSV export, security events, analytics;
  - admin login always requires TOTP.
- Existing suites were updated to give their test admins the needed sub-role (rbac → SUPPORT_ADMIN, payments → FINANCE_ADMIN), as least privilege now requires.

## Assumptions
1. Default sub-role permissions follow job functions. Settings and notification templates are SUPER_ADMIN only until a SUPER_ADMIN delegates them.
2. Grants last 30 minutes, are personal, and cover one request (prescription files, items, Chifa data) or one conversation. Chifa numbers stay masked even with a grant; the card image can be opened.
3. A rejected driver stays PENDING_VERIFICATION, because the driver status has no REJECTED value; the documents carry the rejection.
4. Notification template overrides are refreshed on every instance within a minute.

## Open legal / compliance questions
- Who may hold `sensitive.access` (support or compliance only?), how long grants should last, and whether a second approver is needed (four-eyes principle).
- How long audit logs and sensitive-access logs must be kept (Phase 10 retention).
- Whether the CNAS / Chifa number may be shown unmasked to compliance staff.
