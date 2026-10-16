/**
 * Admin permission catalogue (least privilege). SUPER_ADMIN holds every
 * permission implicitly; an ADMIN account holds only the permissions of the
 * admin sub-roles assigned to it (admin_user_roles → admin_role_permissions).
 * An ADMIN without any sub-role can do nothing.
 */
export const PERMISSIONS = {
  USERS_READ: 'users.read',
  USERS_MANAGE: 'users.manage',
  VERIFICATION_READ: 'verification.read',
  VERIFICATION_DECIDE: 'verification.decide',
  MONITORING_READ: 'monitoring.read',
  SENSITIVE_ACCESS: 'sensitive.access',
  PAYMENTS_READ: 'payments.read',
  REFUNDS_DECIDE: 'refunds.decide',
  SETTLEMENTS_MANAGE: 'settlements.manage',
  COMMISSION_MANAGE: 'commission.manage',
  DELIVERY_CONFIG_MANAGE: 'delivery_config.manage',
  COMPLAINTS_READ: 'complaints.read',
  COMPLAINTS_MANAGE: 'complaints.manage',
  ELIGIBILITY_MANAGE: 'eligibility.manage',
  CATALOG_MANAGE: 'catalog.manage',
  ANALYTICS_READ: 'analytics.read',
  AUDIT_READ: 'audit.read',
  SECURITY_READ: 'security.read',
  SETTINGS_MANAGE: 'settings.manage',
  TEMPLATES_MANAGE: 'templates.manage',
} as const;
export const ALL_PERMISSIONS = Object.values(PERMISSIONS);
/** Held by SUPER_ADMIN only; never assignable to a sub-role. */
export const SUPER_ADMIN_ONLY = 'super_admin.only' as const;
export type Permission =
  (typeof PERMISSIONS)[keyof typeof PERMISSIONS] | typeof SUPER_ADMIN_ONLY;

export const ADMIN_SUB_ROLES = [
  'VERIFICATION_ADMIN',
  'SUPPORT_ADMIN',
  'FINANCE_ADMIN',
  'COMPLIANCE_ADMIN',
] as const;
export type AdminSubRole = (typeof ADMIN_SUB_ROLES)[number];

const P = PERMISSIONS;

/**
 * Default matrix, seeded into admin_role_permissions by migration 0012 and
 * editable by a SUPER_ADMIN. Settings and notification templates are
 * SUPER_ADMIN only by default.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<AdminSubRole, Permission[]> = {
  VERIFICATION_ADMIN: [
    P.USERS_READ,
    P.VERIFICATION_READ,
    P.VERIFICATION_DECIDE,
  ],
  SUPPORT_ADMIN: [
    P.USERS_READ,
    P.USERS_MANAGE,
    P.MONITORING_READ,
    P.SENSITIVE_ACCESS,
    P.COMPLAINTS_READ,
    P.COMPLAINTS_MANAGE,
  ],
  FINANCE_ADMIN: [
    P.MONITORING_READ,
    P.PAYMENTS_READ,
    P.REFUNDS_DECIDE,
    P.SETTLEMENTS_MANAGE,
    P.COMMISSION_MANAGE,
    P.DELIVERY_CONFIG_MANAGE,
    P.ANALYTICS_READ,
  ],
  COMPLIANCE_ADMIN: [
    P.USERS_READ,
    P.MONITORING_READ,
    P.SENSITIVE_ACCESS,
    P.COMPLAINTS_READ,
    P.ELIGIBILITY_MANAGE,
    P.CATALOG_MANAGE,
    P.ANALYTICS_READ,
    P.AUDIT_READ,
    P.SECURITY_READ,
  ],
};
