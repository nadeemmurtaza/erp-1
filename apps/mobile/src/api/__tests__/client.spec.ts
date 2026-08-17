import { toQuery } from '../client';

describe('toQuery', () => {
  it('is empty when there is nothing to ask for', () => {
    expect(toQuery(undefined)).toBe('');
    expect(toQuery({})).toBe('');
  });

  it('drops undefined and empty values rather than sending them', () => {
    // An empty search box must not become `?q=`, which the API reads as a
    // search for the empty string rather than as no search at all.
    expect(toQuery({ q: '', page: 1, kind: undefined })).toBe('?page=1');
  });

  it('encodes values', () => {
    expect(toQuery({ q: 'lawn suit & shawl' })).toBe('?q=lawn+suit+%26+shawl');
  });

  it('keeps false, which is a real answer', () => {
    expect(toQuery({ inStock: false })).toBe('?inStock=false');
  });
});
