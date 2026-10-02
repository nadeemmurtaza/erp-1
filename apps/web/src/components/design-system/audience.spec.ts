import {
  AUDIENCE_POOL,
  INDUSTRIES,
  MAX_RADIUS_KM,
  MIN_RADIUS_KM,
  estimateAudience,
  publishBlocker,
  publishFriction,
  visibilityUsesAudience,
  type AudienceFilters,
} from './audience';

const open: AudienceFilters = { radiusKm: MAX_RADIUS_KM, industries: [], verifications: [] };

describe('estimateAudience', () => {
  it('reaches the whole pool for "all", whatever the filters say', () => {
    expect(estimateAudience('all', { radiusKm: 10, industries: ['retail'], verifications: ['tax'] })).toBe(
      AUDIENCE_POOL,
    );
  });

  it('reaches the region share, and ignores the custom filters', () => {
    expect(estimateAudience('region', open)).toBe(Math.round(AUDIENCE_POOL * 0.42));
    expect(estimateAudience('region', { ...open, radiusKm: 10 })).toBe(estimateAudience('region', open));
  });

  it('treats an empty filter as everyone, so a fresh custom audience equals the pool', () => {
    expect(estimateAudience('custom', open)).toBe(AUDIENCE_POOL);
  });

  it('never raises the count when a filter is added', () => {
    const base = estimateAudience('custom', open);
    const withIndustry = estimateAudience('custom', { ...open, industries: ['retail'] });
    const withBoth = estimateAudience('custom', { ...open, industries: ['retail'], verifications: ['tax'] });
    expect(withIndustry).toBeLessThanOrEqual(base);
    expect(withBoth).toBeLessThanOrEqual(withIndustry);
  });

  it('shrinks as the radius shrinks', () => {
    expect(estimateAudience('custom', { ...open, radiusKm: 100 })).toBeLessThan(
      estimateAudience('custom', { ...open, radiusKm: 300 }),
    );
  });

  it('clamps a radius outside the slider so a bad value cannot go negative or past the pool', () => {
    expect(estimateAudience('custom', { ...open, radiusKm: -50 })).toBe(
      estimateAudience('custom', { ...open, radiusKm: MIN_RADIUS_KM }),
    );
    expect(estimateAudience('custom', { ...open, radiusKm: 9_999 })).toBe(AUDIENCE_POOL);
  });

  it('caps the industry share at the whole pool even if the shares ever sum past one', () => {
    const all = INDUSTRIES.map((i) => i.key);
    expect(estimateAudience('custom', { ...open, industries: all })).toBeLessThanOrEqual(AUDIENCE_POOL);
  });

  it('can reach nobody, so the empty audience is a state the screen must design', () => {
    const none = {
      radiusKm: MIN_RADIUS_KM,
      industries: ['hospitality'],
      verifications: ['identity', 'tax', 'active', 'audited'],
    };
    expect(estimateAudience('custom', none)).toBe(0);
  });

  it('is deterministic: the same inputs give the same count', () => {
    const filters = { radiusKm: 120, industries: ['retail', 'wholesale'], verifications: ['identity'] };
    expect(estimateAudience('custom', filters)).toBe(estimateAudience('custom', { ...filters }));
  });
});

describe('publishFriction', () => {
  it('asks for a confirmation only where the audience is public and cannot be fully recalled', () => {
    expect(publishFriction('directory')).toBe('confirm');
    expect(publishFriction('unlisted')).toBe('none');
    expect(publishFriction('private')).toBe('none');
  });
});

describe('publishBlocker', () => {
  it('names what to change when a custom audience matches nobody', () => {
    expect(publishBlocker('directory', 'custom', 0)).toMatch(
      /widen the radius, or clear an industry or a verification/i,
    );
  });

  it('does not block while a count is still being worked out', () => {
    expect(publishBlocker('directory', 'custom', null)).toBeNull();
  });

  it('does not block a profile that has no audience question, even with a stale empty one', () => {
    expect(publishBlocker('private', 'custom', 0)).toBeNull();
    expect(publishBlocker('unlisted', 'custom', 0)).toBeNull();
  });

  it('does not block "all" or a region', () => {
    expect(publishBlocker('directory', 'all', AUDIENCE_POOL)).toBeNull();
    expect(publishBlocker('unlisted', 'region', 2016)).toBeNull();
  });
});

describe('visibilityUsesAudience', () => {
  it('asks "which partners?" only for the public directory', () => {
    expect(visibilityUsesAudience('directory')).toBe(true);
    expect(visibilityUsesAudience('unlisted')).toBe(false);
    expect(visibilityUsesAudience('private')).toBe(false);
  });
});
