import { getFormattedAddress, getAddressCityProvince } from './address';

describe('getFormattedAddress', () => {
  it('joins the address lines, city, province and postal code', () => {
    expect(
      getFormattedAddress({
        fullName: 'Ayesha Khan',
        phone: '03001234567',
        line1: 'House 12, Street 5',
        city: 'Karachi',
        province: 'Sindh',
      }),
    ).toBe('House 12, Street 5, Karachi, Sindh');
  });

  it('includes line2 and postalCode when present', () => {
    expect(
      getFormattedAddress({
        fullName: 'Ayesha Khan',
        phone: '03001234567',
        line1: 'House 12',
        line2: 'Street 5',
        city: 'Karachi',
        province: 'Sindh',
        postalCode: '74400',
      }),
    ).toBe('House 12, Street 5, Karachi, Sindh, 74400');
  });
});

describe('getAddressCityProvince', () => {
  it('joins city and province only', () => {
    expect(
      getAddressCityProvince({
        fullName: 'Ayesha Khan',
        phone: '03001234567',
        line1: 'House 12',
        city: 'Karachi',
        province: 'Sindh',
      }),
    ).toBe('Karachi, Sindh');
  });
});
