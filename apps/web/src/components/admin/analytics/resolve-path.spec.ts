import { interpolateHref, resolvePath } from './resolve-path';

describe('resolvePath', () => {
  it('reads a nested dot-path', () => {
    expect(resolvePath({ totals: { revenue: 5000 } }, 'totals.revenue')).toBe(5000);
  });

  it('returns undefined for a missing path, never throws', () => {
    expect(resolvePath({ totals: { revenue: 5000 } }, 'totals.cogs')).toBeUndefined();
    expect(resolvePath({}, 'a.b.c')).toBeUndefined();
    expect(resolvePath(null, 'a.b')).toBeUndefined();
    expect(resolvePath(undefined, 'a')).toBeUndefined();
    expect(() => resolvePath({ a: 1 }, 'a.b.c')).not.toThrow();
  });

  it('indexes into an array with a numeric segment', () => {
    const data = { series: [{ t: '2026-08-01', v: 1 }, { t: '2026-08-02', v: 2 }] };
    expect(resolvePath(data, 'series.0.t')).toBe('2026-08-01');
    expect(resolvePath(data, 'series.1.v')).toBe(2);
  });

  it('returns undefined for an out-of-range array index rather than throwing', () => {
    expect(resolvePath({ series: [1, 2] }, 'series.9')).toBeUndefined();
  });

  it('returns undefined when a non-numeric segment is used to index an array', () => {
    expect(resolvePath({ series: [1, 2] }, 'series.revenue')).toBeUndefined();
  });

  it('returns the whole object when the path is empty', () => {
    const data = { a: 1 };
    expect(resolvePath(data, '')).toBe(data);
  });

  it('returns undefined when a path segment expects an object but finds a primitive', () => {
    expect(resolvePath({ totals: 5000 }, 'totals.revenue')).toBeUndefined();
  });
});

describe('interpolateHref', () => {
  it('fills a {key} placeholder from the row', () => {
    expect(interpolateHref('/admin/products/{productId}', { productId: 'p1' })).toBe('/admin/products/p1');
  });

  it('fills more than one placeholder', () => {
    expect(interpolateHref('/admin/o/{orgId}/b/{brandId}', { orgId: 'o1', brandId: 'b1' })).toBe('/admin/o/o1/b/b1');
  });

  it('encodeURIComponents every interpolated value', () => {
    expect(interpolateHref('/admin/search?q={name}', { name: 'Kurta & Co/1' })).toBe(
      '/admin/search?q=Kurta%20%26%20Co%2F1',
    );
  });

  it('interpolates a missing key as an empty string, never the literal placeholder', () => {
    expect(interpolateHref('/admin/products/{productId}', {})).toBe('/admin/products/');
  });

  it('interpolates a null value as an empty string', () => {
    expect(interpolateHref('/admin/products/{productId}', { productId: null })).toBe('/admin/products/');
  });

  it('leaves a template with no placeholders unchanged', () => {
    expect(interpolateHref('/admin/products', {})).toBe('/admin/products');
  });
});
