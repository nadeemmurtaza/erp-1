import { checkPhotoOrder, closeGap, MAX_LOT_PHOTOS, nextPhotoPosition } from './lot-photos';

describe('lot photos (WO-234.12)', () => {
  describe('nextPhotoPosition', () => {
    it('puts the first photo at 0 and each next one after the last', () => {
      expect(nextPhotoPosition(0)).toEqual({ ok: true, order: 0 });
      expect(nextPhotoPosition(4)).toEqual({ ok: true, order: 4 });
    });

    it('allows the tenth and refuses the eleventh, at the boundary', () => {
      expect(MAX_LOT_PHOTOS).toBe(10);
      expect(nextPhotoPosition(9)).toEqual({ ok: true, order: 9 });
      expect(nextPhotoPosition(10)).toEqual({ ok: false, code: 'LOT_PHOTOS_FULL' });
      expect(nextPhotoPosition(25)).toEqual({ ok: false, code: 'LOT_PHOTOS_FULL' });
    });
  });

  describe('checkPhotoOrder', () => {
    const current = ['a', 'b', 'c'];

    it('accepts any reordering of exactly the photos the lot has', () => {
      expect(checkPhotoOrder(current, ['c', 'a', 'b'])).toEqual({ ok: true });
      expect(checkPhotoOrder(current, current)).toEqual({ ok: true });
    });

    it('refuses a list that leaves one out, so a stale screen cannot drop a photo', () => {
      expect(checkPhotoOrder(current, ['a', 'b'])).toEqual({ ok: false, problem: 'MISSING' });
      expect(checkPhotoOrder(current, [])).toEqual({ ok: false, problem: 'MISSING' });
    });

    it('refuses a photo that is not the lot’s, and one named twice', () => {
      expect(checkPhotoOrder(current, ['a', 'b', 'z'])).toEqual({ ok: false, problem: 'UNKNOWN' });
      expect(checkPhotoOrder(current, ['a', 'a', 'b'])).toEqual({ ok: false, problem: 'DUPLICATE' });
    });

    it('accepts an empty order for a lot with none', () => {
      expect(checkPhotoOrder([], [])).toEqual({ ok: true });
    });
  });

  describe('closeGap', () => {
    it('numbers what is left from 0 in the order given', () => {
      expect(closeGap(['b', 'c'])).toEqual([
        { id: 'b', order: 0 },
        { id: 'c', order: 1 },
      ]);
      expect(closeGap([])).toEqual([]);
    });
  });
});
