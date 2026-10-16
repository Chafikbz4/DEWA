/**
 * Every platform setting with its default value and description.
 * Single source of truth: seeded into platform_settings and used as fallback.
 * Values marked PLACEHOLDER must be confirmed (legal / business).
 */
export const SETTING_DEFAULTS = {
  payment_before_validation: {
    value: false,
    description:
      'true: patient pays first, pharmacist validates after. false (default, conservative): pharmacist validates BEFORE payment. Legal decision pending.',
  },
  request_expiry_hours: {
    value: 24,
    description: 'Hours before an unanswered request expires.',
  },
  offer_validity_hours: {
    value: 12,
    description: 'Default validity of a pharmacy offer, in hours.',
  },
  payment_deadline_minutes: {
    value: 30,
    description: 'Minutes the patient has to pay once payment is possible.',
  },
  max_pharmacies_per_request: {
    value: 5,
    description: 'Maximum pharmacies a single request is sent to.',
  },
  delivery_enabled: {
    value: false,
    description:
      'Global switch for home delivery (off until delivery partners and legal review are in place).',
  },
  sensitive_data_retention_days: {
    value: 365,
    description:
      'Days prescriptions / CHIFA images are kept after upload. PLACEHOLDER – must be confirmed by legal counsel (Law 18-07).',
  },
  ocr_text_retention_days: {
    value: 90,
    description: 'Days encrypted OCR raw text is kept. PLACEHOLDER.',
  },
  matching_only_open_pharmacies: {
    value: true,
    description:
      'Automatic matching only selects pharmacies open now or on duty (garde).',
  },
  dependant_allowed_relationships: {
    value: ['CHILD', 'PARENT', 'SPOUSE'],
    description:
      'Relationships for which a patient may submit a request on behalf of a dependant.',
  },
  dependant_requires_verification: {
    value: false,
    description:
      'If true, requests for a dependant require authorization_status = VERIFIED.',
  },
  service_fee_centimes: {
    value: 0,
    description:
      'Platform service fee per order (centimes). 0 until the commercial/legal model allows a fee.',
  },
  ocr_enabled: {
    value: true,
    description: 'Run advisory OCR on uploaded prescriptions.',
  },
  pharmacist_validation_timeout_minutes: {
    value: 120,
    description:
      'Minutes a pharmacy has to validate an order before it is escalated/cancelled.',
  },
  delivery_assignment_timeout_minutes: {
    value: 30,
    description:
      'Minutes after which an unassigned delivery is escalated to admins.',
  },
  delivery_max_releases_per_day: {
    value: 3,
    description: 'How many accepted jobs a driver may release per day.',
  },
  driver_location_min_interval_seconds: {
    value: 10,
    description: 'Minimum seconds between driver location updates.',
  },
  delivery_code_max_attempts: {
    value: 5,
    description: 'Wrong delivery-code attempts before the code is locked.',
  },
  message_max_length: {
    value: 2000,
    description: 'Maximum characters per chat message.',
  },
  message_rate_limit_per_minute: {
    value: 20,
    description: 'Messages a user may send per minute.',
  },
  message_block_phone_numbers: {
    value: true,
    description:
      'Reject chat messages containing phone numbers (keeps contact on-platform).',
  },
  message_blocked_words: {
    value: [] as string[],
    description: 'Words rejected in chat messages (case-insensitive).',
  },
  sensitive_access_grant_minutes: {
    value: 30,
    description:
      'Validity of an admin sensitive-access grant (prescription / Chifa / conversation content), in minutes.',
  },
  settlement_period_days: {
    value: 7,
    description: 'Length of a settlement period, in days.',
  },
  payment_collection_model: {
    value: 'MARKETPLACE',
    description:
      'MARKETPLACE: platform collects then settles to pharmacies. PER_PHARMACY_MERCHANT: each pharmacy collects on its own merchant account. Legal/commercial decision pending.',
  },
} as const;

export type SettingKey = keyof typeof SETTING_DEFAULTS;
export type SettingValue<K extends SettingKey> =
  (typeof SETTING_DEFAULTS)[K]['value'] extends boolean
    ? boolean
    : (typeof SETTING_DEFAULTS)[K]['value'] extends number
      ? number
      : (typeof SETTING_DEFAULTS)[K]['value'] extends string
        ? string
        : string[];
