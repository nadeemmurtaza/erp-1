import { computeTender } from './tender';

describe('computeTender', () => {
  it('is insufficient and owes the remainder when tender is less than the total', () => {
    expect(computeTender(1000, 600)).toEqual({ amountDueMinor: 400, changeMinor: 0, sufficient: false });
  });

  it('is exactly sufficient with no change when tender equals the total', () => {
    expect(computeTender(1000, 1000)).toEqual({ amountDueMinor: 0, changeMinor: 0, sufficient: true });
  });

  it('is sufficient and returns change when tender exceeds the total', () => {
    expect(computeTender(1000, 1500)).toEqual({ amountDueMinor: 0, changeMinor: 500, sufficient: true });
  });
});
