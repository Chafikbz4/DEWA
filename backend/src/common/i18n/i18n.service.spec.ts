import { ERROR_CODES, messageKeyFor } from '../errors/error-codes';
import { I18nService } from './i18n.service';

describe('I18nService', () => {
  const i18n = new I18nService();

  it.each([
    [undefined, 'fr'],
    ['ar', 'ar'],
    ['ar-DZ,fr;q=0.8', 'ar'],
    ['en-US,fr;q=0.5,ar;q=0.9', 'ar'],
    ['en', 'fr'],
    ['fr-FR', 'fr'],
  ])('resolveLang(%p) → %s', (header, expected) => {
    expect(i18n.resolveLang(header)).toBe(expected);
  });

  it('interpolates params', () => {
    expect(
      i18n.t('errors.OTP_RESEND_COOLDOWN', 'fr', { seconds: 42 }),
    ).toContain('42');
    expect(
      i18n.t('errors.AUTH_ACCOUNT_LOCKED', 'ar', { minutes: 15 }),
    ).toContain('15');
  });

  it('returns the key when missing', () => {
    expect(i18n.t('errors.DOES_NOT_EXIST', 'ar')).toBe('errors.DOES_NOT_EXIST');
  });

  it('has an ar AND fr translation for every error code', () => {
    const missing = Object.keys(ERROR_CODES).flatMap((code) =>
      (['ar', 'fr'] as const)
        .filter(
          (lang) =>
            !i18n.has(messageKeyFor(code as keyof typeof ERROR_CODES), lang),
        )
        .map((lang) => `${lang}:${code}`),
    );
    expect(missing).toEqual([]);
  });
});
