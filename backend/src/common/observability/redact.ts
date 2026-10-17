/**
 * Log redaction: removes personal data and secrets from free-text log
 * messages before they are written. Applied by JsonLogger to every message.
 */
const RULES: [RegExp, string][] = [
  // JWTs and bearer tokens
  [/\beyJ[\w-]{4,}\.[\w-]{4,}\.[\w-]{4,}/g, '[jwt]'],
  [/\b(Bearer|Basic)\s+[\w.~+/=-]{8,}/gi, '$1 [redacted]'],
  // emails
  [/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, '[email]'],
  // Algerian / international phone numbers
  [/(?:\+|00)\d{1,3}[\s.-]?\d(?:[\s.-]?\d){7,11}\b/g, '[phone]'],
  // national format: 05/06/07 mobiles and 0XX landlines (10 digits, any grouping)
  [/\b0[1-9](?:[\s.-]?\d){8}\b/g, '[phone]'],
  // card-like numbers (13–19 digits) and long national / insurance ids
  [/\b\d(?:[ -]?\d){12,18}\b/g, '[number]'],
  [/\b\d{10,}\b/g, '[number]'],
  // key=value secrets
  [
    /\b(password|passwd|secret|token|otp|code|api[_-]?key|authorization)\b(["']?\s*[:=]\s*["']?)[^\s"',}]+/gi,
    '$1$2[redacted]',
  ],
];

export function redact(input: string): string {
  let out = input;
  for (const [re, repl] of RULES) out = out.replace(re, repl);
  return out;
}

/** Keys whose values are always replaced in structured log objects. */
const SECRET_KEYS =
  /^(password|passwordHash|password_hash|token|refreshToken|refresh_token|accessToken|access_token|otp|code|secret|authorization|cookie|national_id|nationalId|insurance_number|insuranceNumber|pan|cvv|pin)$/i;

export function redactObject(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || value === undefined) return value;
  if (typeof value === 'string') return redact(value);
  if (Array.isArray(value)) return value.map((v) => redactObject(v, depth + 1));
  if (typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        SECRET_KEYS.test(k) ? '[redacted]' : redactObject(v, depth + 1),
      ]),
    );
  }
  return value;
}
