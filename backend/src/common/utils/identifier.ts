import { parsePhoneNumberFromString } from 'libphonenumber-js';

export type IdentifierType = 'EMAIL' | 'PHONE';

export interface NormalizedIdentifier {
  type: IdentifierType;
  value: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Returns E.164 or null. Local Algerian numbers (05..., 06..., 07...) accepted. */
export function normalizePhone(phone: string): string | null {
  const parsed = parsePhoneNumberFromString(phone.trim(), 'DZ');
  return parsed?.isValid() ? parsed.number : null;
}

/** Email or phone → normalized value, or null if neither is valid. */
export function normalizeIdentifier(raw: string): NormalizedIdentifier | null {
  const value = raw.trim();
  if (value.includes('@')) {
    return EMAIL_RE.test(value)
      ? { type: 'EMAIL', value: normalizeEmail(value) }
      : null;
  }
  const phone = normalizePhone(value);
  return phone ? { type: 'PHONE', value: phone } : null;
}

/** "+213550123456" → "+213*****3456", "ali@x.dz" → "a***@x.dz" (for responses/logs). */
export function maskIdentifier(id: NormalizedIdentifier): string {
  if (id.type === 'PHONE') {
    return (
      id.value.slice(0, 4) +
      '*'.repeat(Math.max(0, id.value.length - 8)) +
      id.value.slice(-4)
    );
  }
  const [local, domain] = id.value.split('@');
  return `${local[0]}***@${domain}`;
}
