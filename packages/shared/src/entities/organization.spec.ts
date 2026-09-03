import {
  getOrganizationName,
  getOrganizationContactLabel,
  getOrganizationFormattedLocation,
  getOrganizationLeadTimeDays,
} from './organization';

describe('getOrganizationContactLabel', () => {
  it('prefers the named contact person', () => {
    expect(getOrganizationContactLabel({ name: 'Lawn Fabrics Co.', contactName: 'Bilal' })).toBe('Bilal');
  });

  it('falls back to the organization name with no contact person on file', () => {
    expect(getOrganizationContactLabel({ name: 'Lawn Fabrics Co.' })).toBe('Lawn Fabrics Co.');
  });
});

describe('getOrganizationFormattedLocation', () => {
  it('joins address and city', () => {
    expect(getOrganizationFormattedLocation({ name: 'X', address: '3 Lahore St', city: 'Lahore' })).toBe(
      '3 Lahore St, Lahore',
    );
  });

  it('returns null with neither', () => {
    expect(getOrganizationFormattedLocation({ name: 'X' })).toBeNull();
  });
});

describe('getOrganizationLeadTimeDays', () => {
  it('defaults to zero when unset', () => {
    expect(getOrganizationLeadTimeDays({ name: 'X' })).toBe(0);
  });

  it('reads the set value', () => {
    expect(getOrganizationLeadTimeDays({ name: 'X', leadTimeDays: 14 })).toBe(14);
  });
});

describe('getOrganizationName', () => {
  it('returns the name', () => {
    expect(getOrganizationName({ name: 'Lawn Fabrics Co.' })).toBe('Lawn Fabrics Co.');
  });
});
