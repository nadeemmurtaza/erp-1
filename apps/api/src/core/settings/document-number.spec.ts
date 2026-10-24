import { documentNumber } from './document-number';

describe('documentNumber', () => {
  it('omits the node id for STANDALONE — the format every deployment has today', () => {
    expect(documentNumber({ nodeRole: 'STANDALONE', nodeId: 'main' }, 'YSN', 2026, 1)).toBe(
      'YSN-2026-0001',
    );
  });

  it('folds the node id in for BRANCH', () => {
    expect(documentNumber({ nodeRole: 'BRANCH', nodeId: 'lhr-01' }, 'YSN', 2026, 42)).toBe(
      'YSN-lhr-01-2026-0042',
    );
  });

  it('folds the node id in for BRAND and ORG too', () => {
    expect(documentNumber({ nodeRole: 'BRAND', nodeId: 'brand1' }, 'PO', 2026, 1)).toBe(
      'PO-brand1-2026-0001',
    );
    expect(documentNumber({ nodeRole: 'ORG', nodeId: 'org' }, 'PO', 2026, 1)).toBe(
      'PO-org-2026-0001',
    );
  });

  it('pads the sequence to four digits and lets a fifth digit through unpadded', () => {
    expect(documentNumber({ nodeRole: 'STANDALONE', nodeId: 'main' }, 'YSN', 2026, 12345)).toBe(
      'YSN-2026-12345',
    );
  });

  it('two nodes allocating the same local sequence in the same year never collide once node-prefixed', () => {
    const a = documentNumber({ nodeRole: 'BRANCH', nodeId: 'lhr-01' }, 'YSN', 2026, 1);
    const b = documentNumber({ nodeRole: 'BRANCH', nodeId: 'khi-02' }, 'YSN', 2026, 1);
    expect(a).not.toBe(b);
  });
});
