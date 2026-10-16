import {
  maskIdentifier,
  normalizeIdentifier,
  normalizePhone,
} from './identifier';

describe('identifier normalisation', () => {
  it('converts Algerian local mobile numbers to E.164', () => {
    expect(normalizePhone('0661 23 45 67')).toBe('+213661234567');
    expect(normalizePhone('+213661234567')).toBe('+213661234567');
  });

  it('rejects invalid phone numbers', () => {
    expect(normalizePhone('12345')).toBeNull();
    expect(normalizePhone('+2135501234599')).toBeNull();
  });

  it('lower-cases emails and detects the type', () => {
    expect(normalizeIdentifier(' Amina@Example.DZ ')).toEqual({
      type: 'EMAIL',
      value: 'amina@example.dz',
    });
    expect(normalizeIdentifier('0661234567')).toEqual({
      type: 'PHONE',
      value: '+213661234567',
    });
    expect(normalizeIdentifier('not-an-id')).toBeNull();
  });

  it('masks identifiers', () => {
    expect(maskIdentifier({ type: 'PHONE', value: '+213661234567' })).toBe(
      '+213*****4567',
    );
    expect(maskIdentifier({ type: 'EMAIL', value: 'amina@example.dz' })).toBe(
      'a***@example.dz',
    );
  });
});
