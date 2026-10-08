import { CHAIN_START, canonicalize, chainHash, verifyChain, type ChainLink } from './hash-chain';

describe('hash chain', () => {
  const build = (rows: string[]): ChainLink[] => {
    const links: ChainLink[] = [];
    let prev: string | null = null;
    for (const canonical of rows) {
      const hash = chainHash(prev, canonical);
      links.push({ prevHash: prev, hash, canonical });
      prev = hash;
    }
    return links;
  };

  it('hashes a first record against the empty start, and the same input the same way every time', () => {
    expect(chainHash(null, 'x')).toBe(chainHash(CHAIN_START, 'x'));
    expect(chainHash(null, 'x')).toMatch(/^[0-9a-f]{64}$/);
    expect(chainHash(null, 'x')).toBe(chainHash(null, 'x'));
  });

  it('keeps a boundary shift apart: ("ab","c") is not ("a","bc")', () => {
    expect(chainHash('ab', 'c')).not.toBe(chainHash('a', 'bc'));
  });

  it('canonicalises values as an array, so key order cannot differ between two writers', () => {
    expect(canonicalize(['lot', 3, '1500', null, true])).toBe('["lot",3,"1500",null,true]');
  });

  it('verifies an intact chain, and an empty one', () => {
    expect(verifyChain(build(['a', 'b', 'c']))).toEqual({ valid: true });
    expect(verifyChain([])).toEqual({ valid: true });
  });

  it('names the edited record when its contents change', () => {
    const links = build(['a', 'b', 'c']);
    links[1] = { ...links[1]!, canonical: 'b-edited' };
    expect(verifyChain(links)).toEqual({ valid: false, brokenAt: 1, reason: 'hash-mismatch' });
  });

  it('names the first record after a removed one', () => {
    const links = build(['a', 'b', 'c']);
    links.splice(1, 1);
    expect(verifyChain(links)).toEqual({ valid: false, brokenAt: 1, reason: 'prev-mismatch' });
  });

  it('names a record inserted into the middle', () => {
    const links = build(['a', 'b', 'c']);
    const forged = { prevHash: links[0]!.hash, hash: chainHash(links[0]!.hash, 'forged'), canonical: 'forged' };
    links.splice(1, 0, forged);
    expect(verifyChain(links)).toEqual({ valid: false, brokenAt: 2, reason: 'prev-mismatch' });
  });

  it('refuses a first record that claims a predecessor', () => {
    const links = build(['a']);
    links[0] = { ...links[0]!, prevHash: 'deadbeef' };
    expect(verifyChain(links)).toMatchObject({ valid: false, brokenAt: 0, reason: 'prev-mismatch' });
  });
});
