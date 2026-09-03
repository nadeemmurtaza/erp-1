import {
  getPersonFullName,
  getPersonInitials,
  getPersonDisplayLabel,
  getPersonEmail,
  getPersonFormattedPhone,
  getPersonE164Phone,
  getPersonGenderLabel,
  getPersonAge,
  getPersonAvatarUrl,
} from './person';

describe('getPersonFullName', () => {
  it('joins firstName and lastName', () => {
    expect(getPersonFullName({ firstName: 'Ayesha', lastName: 'Khan' })).toBe('Ayesha Khan');
  });

  it('falls back to name (Contact shape) when firstName/lastName are absent', () => {
    expect(getPersonFullName({ name: 'Ayesha Khan' })).toBe('Ayesha Khan');
  });

  it('handles a missing last name without a trailing space', () => {
    expect(getPersonFullName({ firstName: 'Ayesha' })).toBe('Ayesha');
  });

  it('returns null when there is no name anywhere', () => {
    expect(getPersonFullName({})).toBeNull();
  });
});

describe('getPersonInitials', () => {
  it('takes the first letter of up to two words', () => {
    expect(getPersonInitials({ firstName: 'Ayesha', lastName: 'Khan' })).toBe('AK');
  });

  it('handles a single-word name', () => {
    expect(getPersonInitials({ name: 'Ayesha' })).toBe('A');
  });

  it('returns null with no name', () => {
    expect(getPersonInitials({})).toBeNull();
  });
});

describe('getPersonDisplayLabel', () => {
  it('prefers the name', () => {
    expect(getPersonDisplayLabel({ name: 'Ayesha Khan', phone: '+923001234567' })).toBe('Ayesha Khan');
  });

  it('falls back to a formatted phone when there is no name', () => {
    expect(getPersonDisplayLabel({ phone: '+923001234567' })).toBe('0300 1234567');
  });

  it('falls back to email when there is no name or phone', () => {
    expect(getPersonDisplayLabel({ email: 'ayesha@example.com' })).toBe('ayesha@example.com');
  });

  it('falls back to "Unnamed" with nothing at all', () => {
    expect(getPersonDisplayLabel({})).toBe('Unnamed');
  });
});

describe('getPersonEmail', () => {
  it('normalises casing and whitespace', () => {
    expect(getPersonEmail({ email: '  Ayesha@Example.com  ' })).toBe('ayesha@example.com');
  });

  it('returns null when absent', () => {
    expect(getPersonEmail({})).toBeNull();
  });
});

describe('getPersonFormattedPhone / getPersonE164Phone', () => {
  it('reads User.phone', () => {
    expect(getPersonFormattedPhone({ phone: '03001234567' })).toBe('0300 1234567');
    expect(getPersonE164Phone({ phone: '03001234567' })).toBe('+923001234567');
  });

  it('reads Contact.phoneE164 when phone is absent', () => {
    expect(getPersonFormattedPhone({ phoneE164: '+923001234567' })).toBe('0300 1234567');
  });

  it('returns null for an invalid number', () => {
    expect(getPersonFormattedPhone({ phone: '123' })).toBeNull();
  });
});

describe('getPersonGenderLabel', () => {
  it('title-cases free text without validating it against a fixed set', () => {
    expect(getPersonGenderLabel({ gender: 'male' })).toBe('Male');
    expect(getPersonGenderLabel({ gender: 'NON-BINARY' })).toBe('Non-binary');
  });

  it('returns null when absent', () => {
    expect(getPersonGenderLabel({})).toBeNull();
  });
});

describe('getPersonAge', () => {
  it('computes whole years as of a given date', () => {
    expect(getPersonAge({ dateOfBirth: '2000-06-15' }, new Date('2026-06-15'))).toBe(26);
  });

  it('has not had this year\'s birthday yet', () => {
    expect(getPersonAge({ dateOfBirth: '2000-06-15' }, new Date('2026-06-14'))).toBe(25);
  });

  it('returns null with no date of birth', () => {
    expect(getPersonAge({})).toBeNull();
  });
});

describe('getPersonAvatarUrl', () => {
  it('returns the uploaded avatar', () => {
    expect(getPersonAvatarUrl({ avatarUrl: 'https://cdn.example.com/a.jpg' })).toBe(
      'https://cdn.example.com/a.jpg',
    );
  });

  it('returns null rather than fabricating a placeholder image', () => {
    expect(getPersonAvatarUrl({})).toBeNull();
  });
});
