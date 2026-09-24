import { generateSku } from './sku';

const TEMPLATE = '{CAT}-{PRODUCT}-{OPT}-{SEQ}';

describe('generateSku', () => {
  it('renders every token and collapses the empty {SEQ} segment', () => {
    expect(
      generateSku({
        template: TEMPLATE,
        categoryCode: 'lwn',
        productCode: '3pc-emb',
        optionValueKeys: ['m', 'blu'],
      }),
    ).toBe('LWN-3PC-EMB-M-BLU');
  });

  it('omits a missing segment without leaving a double separator', () => {
    expect(
      generateSku({ template: TEMPLATE, categoryCode: null, productCode: 'shirt', optionValueKeys: [] }),
    ).toBe('SHIRT');
  });

  it('is case-insensitive and normalises to uppercase', () => {
    expect(generateSku({ template: TEMPLATE, categoryCode: 'lwn', productCode: 'blue' })).toBe('LWN-BLUE');
  });

  it('appends a zero-padded {SEQ} only when the base collides', () => {
    const base = generateSku({ template: TEMPLATE, categoryCode: 'LWN', productCode: 'M' });
    expect(base).toBe('LWN-M');

    const next = generateSku({ template: TEMPLATE, categoryCode: 'LWN', productCode: 'M' }, [base]);
    expect(next).toBe('LWN-M-02');
  });

  it('keeps incrementing {SEQ} past the first collision', () => {
    const taken = ['LWN-M', 'LWN-M-02', 'LWN-M-03'];
    expect(generateSku({ template: TEMPLATE, categoryCode: 'LWN', productCode: 'M' }, taken)).toBe('LWN-M-04');
  });

  it('falls back to a plain numeric suffix when the template has no {SEQ} token', () => {
    const noSeqTemplate = '{CAT}-{PRODUCT}';
    const base = generateSku({ template: noSeqTemplate, categoryCode: 'LWN', productCode: 'M' });
    expect(base).toBe('LWN-M');
    expect(generateSku({ template: noSeqTemplate, categoryCode: 'LWN', productCode: 'M' }, [base])).toBe('LWN-M-2');
  });

  it('never rewrites around a manually-set collision list case-insensitively', () => {
    const taken = ['lwn-m'];
    expect(generateSku({ template: TEMPLATE, categoryCode: 'LWN', productCode: 'M' }, taken)).toBe('LWN-M-02');
  });
});
