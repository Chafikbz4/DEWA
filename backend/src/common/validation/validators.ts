import { registerDecorator, ValidationOptions } from 'class-validator';
import { normalizePhone } from '../utils/identifier';

/** ≥10 chars, at least one lower-case, one upper-case and one digit, ≤128. */
export const PASSWORD_RULE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{10,128}$/;

export function IsStrongPassword(options?: ValidationOptions) {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name: 'isStrongPassword',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' && PASSWORD_RULE.test(value),
      },
    });
}

/** Valid phone number (E.164 or Algerian local format, normalised later). */
export function IsPhone(options?: ValidationOptions) {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name: 'isPhone',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' && normalizePhone(value) !== null,
      },
    });
}

/** A valid email address or phone number. */
export function IsEmailOrPhone(options?: ValidationOptions) {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name: 'emailOrPhone',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate: (value: unknown) => {
          if (typeof value !== 'string' || value.length > 254) return false;
          if (value.includes('@'))
            return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
          return normalizePhone(value) !== null;
        },
      },
    });
}
