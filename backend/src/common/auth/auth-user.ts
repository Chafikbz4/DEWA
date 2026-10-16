import type {
  AccountStatus,
  Language,
  Role,
  StaffRole,
} from '../../database/schema';

/** The authenticated principal attached to `req.user` by JwtAuthGuard. */
export interface AuthUser {
  id: string;
  role: Role;
  status: AccountStatus;
  sessionId: string;
  preferredLanguage: Language;
  mfaEnabled: boolean;
}

/** Attached to `req.pharmacy` by PharmacyAccessGuard. */
export interface PharmacyContext {
  id: string;
  status: string;
  staffRole: StaffRole;
}

export const ADMIN_ROLES: readonly Role[] = ['ADMIN', 'SUPER_ADMIN'];
export const PHARMACY_ROLES: readonly Role[] = [
  'PHARMACY_OWNER',
  'PHARMACIST',
  'PHARMACY_ASSISTANT',
];
/** Roles for which TOTP MFA is mandatory before any token is issued. */
export const MFA_MANDATORY_ROLES: readonly Role[] = ADMIN_ROLES;
/** Roles that may opt in to TOTP MFA. */
export const MFA_OPTIONAL_ROLES: readonly Role[] = PHARMACY_ROLES;
