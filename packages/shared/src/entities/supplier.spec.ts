import {
  getSupplierName,
  getSupplierContactLabel,
  getSupplierFormattedLocation,
  getSupplierLeadTimeDays,
} from './supplier';

describe('getSupplierContactLabel', () => {
  it('prefers the named contact person', () => {
    expect(getSupplierContactLabel({ name: 'Lawn Fabrics Co.', contactName: 'Bilal' })).toBe('Bilal');
  });

  it('falls back to the supplier name with no contact person on file', () => {
    expect(getSupplierContactLabel({ name: 'Lawn Fabrics Co.' })).toBe('Lawn Fabrics Co.');
  });
});

describe('getSupplierFormattedLocation', () => {
  it('joins address and city', () => {
    expect(getSupplierFormattedLocation({ name: 'X', address: '3 Lahore St', city: 'Lahore' })).toBe(
      '3 Lahore St, Lahore',
    );
  });

  it('returns null with neither', () => {
    expect(getSupplierFormattedLocation({ name: 'X' })).toBeNull();
  });
});

describe('getSupplierLeadTimeDays', () => {
  it('defaults to zero when unset', () => {
    expect(getSupplierLeadTimeDays({ name: 'X' })).toBe(0);
  });

  it('reads the set value', () => {
    expect(getSupplierLeadTimeDays({ name: 'X', leadTimeDays: 14 })).toBe(14);
  });
});

describe('getSupplierName', () => {
  it('returns the name', () => {
    expect(getSupplierName({ name: 'Lawn Fabrics Co.' })).toBe('Lawn Fabrics Co.');
  });
});
