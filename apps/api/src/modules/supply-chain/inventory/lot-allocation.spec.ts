import { allocateFefo, InsufficientLotStockError } from './lot-allocation';

describe('allocateFefo', () => {
  const lot = (id: string, quantity: number, expiresOn: Date | null) => ({ id, quantity, expiresOn });

  it('draws from a single lot when it fully covers the request', () => {
    const lots = [lot('l1', 50, new Date('2027-01-01')), lot('l2', 50, new Date('2027-06-01'))];
    expect(allocateFefo(lots, 10)).toEqual([{ lotId: 'l1', quantity: 10 }]);
  });

  it('splits across lots, earliest-expiring first, only when the earliest does not cover the full quantity', () => {
    const lots = [
      lot('later', 20, new Date('2027-06-01')),
      lot('earliest', 15, new Date('2027-01-01')),
      lot('middle', 20, new Date('2027-03-01')),
    ];
    expect(allocateFefo(lots, 25)).toEqual([
      { lotId: 'earliest', quantity: 15 },
      { lotId: 'middle', quantity: 10 },
    ]);
  });

  it('sorts a lot with no expiry last, never drawn from while an expiring lot still has stock', () => {
    const lots = [lot('never-expires', 100, null), lot('expiring', 10, new Date('2027-01-01'))];
    expect(allocateFefo(lots, 10)).toEqual([{ lotId: 'expiring', quantity: 10 }]);
  });

  it('honours a manual preferredLotId override before falling back to FEFO for the remainder', () => {
    const lots = [
      lot('earliest', 5, new Date('2027-01-01')),
      lot('preferred', 8, new Date('2027-06-01')),
    ];
    expect(allocateFefo(lots, 10, 'preferred')).toEqual([
      { lotId: 'preferred', quantity: 8 },
      { lotId: 'earliest', quantity: 2 },
    ]);
  });

  it('ignores a lot with zero quantity entirely', () => {
    const lots = [lot('empty', 0, new Date('2027-01-01')), lot('stocked', 10, new Date('2027-02-01'))];
    expect(allocateFefo(lots, 5)).toEqual([{ lotId: 'stocked', quantity: 5 }]);
  });

  it('throws InsufficientLotStockError, naming both figures, when total lot stock cannot cover the request', () => {
    const lots = [lot('l1', 3, new Date('2027-01-01'))];
    expect(() => allocateFefo(lots, 10)).toThrow(InsufficientLotStockError);
    try {
      allocateFefo(lots, 10);
      fail('expected a throw');
    } catch (error) {
      expect(error).toBeInstanceOf(InsufficientLotStockError);
      expect((error as InsufficientLotStockError).requested).toBe(10);
      expect((error as InsufficientLotStockError).available).toBe(3);
    }
  });

  it('rejects a zero or negative quantity', () => {
    expect(() => allocateFefo([lot('l1', 10, null)], 0)).toThrow();
    expect(() => allocateFefo([lot('l1', 10, null)], -5)).toThrow();
  });
});
