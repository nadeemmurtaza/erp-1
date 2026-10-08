import { describe, expect, it } from 'vitest';
import { MAX_LOT_PHOTOS, clampPhotoIndex, moveFocusTarget, movePhoto, photoLimitReason, photoPosition, renumber, roomForPhotos } from './auction-lot-photos';

describe('auction lot photos', () => {
  it('uses the limit the API enforces', () => {
    expect(MAX_LOT_PHOTOS).toBe(10);
  });

  describe('photoLimitReason', () => {
    it('allows up to the limit and says why beyond it', () => {
      expect(photoLimitReason(0)).toBeNull();
      expect(photoLimitReason(9)).toBeNull();
      expect(photoLimitReason(10)).toBe('This lot has 10 photos, the most it can have. Remove one to add another.');
    });
  });

  describe('roomForPhotos', () => {
    it('counts what still fits and never goes below zero', () => {
      expect(roomForPhotos(0)).toBe(10);
      expect(roomForPhotos(7)).toBe(3);
      expect(roomForPhotos(10)).toBe(0);
      expect(roomForPhotos(14)).toBe(0);
    });
  });

  describe('movePhoto', () => {
    it('moves one place up or down', () => {
      expect(movePhoto(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
      expect(movePhoto(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b']);
    });

    it('leaves the list as it is at either end or outside it, and never changes its input', () => {
      const list = ['a', 'b', 'c'];
      expect(movePhoto(list, 0, -1)).toEqual(['a', 'b', 'c']);
      expect(movePhoto(list, 2, 1)).toEqual(['a', 'b', 'c']);
      expect(movePhoto(list, 7, -1)).toEqual(['a', 'b', 'c']);
      expect(movePhoto(list, -1, 1)).toEqual(['a', 'b', 'c']);
      expect(list).toEqual(['a', 'b', 'c']);
    });
  });

  describe('moveFocusTarget', () => {
    it('keeps the button just used while the photo can go on that way', () => {
      expect(moveFocusTarget(1, 4, 1)).toBe(1);
      expect(moveFocusTarget(2, 4, -1)).toBe(-1);
    });

    it('hands focus to the opposite button once the photo reaches an end', () => {
      expect(moveFocusTarget(3, 4, 1)).toBe(-1);
      expect(moveFocusTarget(0, 4, -1)).toBe(1);
      expect(moveFocusTarget(1, 2, 1)).toBe(-1);
    });
  });

  describe('renumber', () => {
    it('gives the list order as positions, so the first is the cover', () => {
      expect(renumber([{ id: 'b', url: 'u', order: 4 }, { id: 'a', url: 'v', order: 0 }])).toEqual([
        { id: 'b', url: 'u', order: 0 },
        { id: 'a', url: 'v', order: 1 },
      ]);
    });
  });

  it('says where a picture is in its set', () => {
    expect(photoPosition(0, 5)).toEqual({ n: 1, total: 5 });
    expect(photoPosition(4, 5)).toEqual({ n: 5, total: 5 });
  });

  describe('clampPhotoIndex', () => {
    it('keeps a step inside the set', () => {
      expect(clampPhotoIndex(-1, 4)).toBe(0);
      expect(clampPhotoIndex(2, 4)).toBe(2);
      expect(clampPhotoIndex(9, 4)).toBe(3);
      expect(clampPhotoIndex(3, 0)).toBe(0);
    });
  });
});
