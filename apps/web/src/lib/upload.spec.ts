import {
  acceptAttribute,
  checkFile,
  checkFiles,
  describeLimits,
  formatEta,
  formatSpeed,
  partitionFiles,
  refusalMessage,
  type FileLike,
  type UploadRules,
} from './upload';

const MB = 1024 * 1024;

/** The limits the product-image routes really enforce (apps/api storage.service.ts:10-16). */
const IMAGES: UploadRules = {
  accept: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  maxBytes: 8 * MB,
};

const file = (name: string, size: number, type: string): FileLike => ({ name, size, type });

describe('describeLimits', () => {
  it('prints types, size and count in one line, the limits upfront (UPL-4)', () => {
    expect(describeLimits({ ...IMAGES, maxBytes: 5 * MB, maxFiles: 10 })).toBe(
      'JPG, PNG, WebP or AVIF · up to 5 MB each · 10 files',
    );
  });

  it('says "each" for many files and drops it for a single file', () => {
    expect(describeLimits(IMAGES)).toBe('JPG, PNG, WebP or AVIF · up to 8 MB each');
    expect(describeLimits({ ...IMAGES, maxFiles: 1 })).toBe('JPG, PNG, WebP or AVIF · up to 8 MB');
  });

  it('leaves out a size the server does not enforce, rather than inventing one', () => {
    expect(describeLimits({ accept: ['.csv', 'text/csv'], maxBytes: Number.POSITIVE_INFINITY, maxFiles: 1 })).toBe(
      'CSV',
    );
  });

  it('names a wildcard and an extension, each type once', () => {
    expect(describeLimits({ accept: ['image/*'], maxBytes: MB })).toBe('Images · up to 1 MB each');
    expect(describeLimits({ accept: ['.jpg', '.jpeg', 'image/jpeg'], maxBytes: MB, maxFiles: 1 })).toBe(
      'JPG · up to 1 MB',
    );
  });

  it('reads two types as "A or B" and prints nothing for an open type list', () => {
    expect(describeLimits({ accept: ['image/png', 'application/pdf'], maxBytes: MB, maxFiles: 1 })).toBe(
      'PNG or PDF · up to 1 MB',
    );
    expect(describeLimits({ accept: [], maxBytes: MB, maxFiles: 1 })).toBe('up to 1 MB');
  });

  it('is the same string as the accept attribute joins', () => {
    expect(acceptAttribute(IMAGES)).toBe('image/jpeg,image/png,image/webp,image/avif');
  });
});

describe('checkFile', () => {
  it('accepts a file inside every limit', () => {
    expect(checkFile(file('hero.png', 2 * MB, 'image/png'), IMAGES)).toEqual({ ok: true });
  });

  it('accepts a file exactly at the size limit and refuses one byte over (the boundary)', () => {
    expect(checkFile(file('a.png', IMAGES.maxBytes, 'image/png'), IMAGES)).toEqual({ ok: true });
    const over = checkFile(file('a.png', IMAGES.maxBytes + 1, 'image/png'), IMAGES);
    expect(over).toMatchObject({ ok: false, code: 'size' });
  });

  it('names the file and the limit in a size refusal, with what to do (FLO-7)', () => {
    const result = checkFile(file('banner.png', 40 * MB, 'image/png'), { ...IMAGES, maxBytes: 5 * MB });
    expect(result).toEqual({
      ok: false,
      code: 'size',
      reason: 'banner.png is 40 MB, over the 5 MB limit.',
      remedy: 'Choose a file up to 5 MB.',
    });
  });

  it('refuses a wrong type and says what it is and what to use instead', () => {
    const result = checkFile(file('hero.tiff', 1000, 'image/tiff'), IMAGES);
    expect(result).toMatchObject({ ok: false, code: 'type' });
    expect(refusalMessage(result as { reason: string; remedy: string })).toBe(
      'hero.tiff is a TIFF. Use JPG, PNG, WebP or AVIF.',
    );
  });

  it('uses "an" for a spelled-out or vowel-led label', () => {
    expect(checkFile(file('a.mp4', 10, 'video/mp4'), IMAGES)).toMatchObject({ reason: 'a.mp4 is an MP4.' });
    expect(checkFile(file('a.xml', 10, 'text/xml'), IMAGES)).toMatchObject({ reason: 'a.xml is an XML.' });
  });

  it('falls back to the extension when the browser reports no type, and says so plainly with neither', () => {
    expect(checkFile(file('scan.bmp', 10, ''), IMAGES)).toMatchObject({ code: 'type', reason: 'scan.bmp is a BMP.' });
    expect(checkFile(file('mystery', 10, ''), IMAGES)).toMatchObject({
      code: 'type',
      reason: 'mystery is not a type this upload accepts.',
    });
  });

  it('refuses a zero-byte file as empty, naming it', () => {
    expect(checkFile(file('blank.png', 0, 'image/png'), IMAGES)).toEqual({
      ok: false,
      code: 'empty',
      reason: 'blank.png is empty.',
      remedy: 'Choose a file that has something in it.',
    });
  });

  it('reports the wrong type before the size or emptiness of a wrong-type file', () => {
    expect(checkFile(file('x.exe', 0, 'application/x-msdownload'), IMAGES)).toMatchObject({ code: 'type' });
  });

  it('matches an extension in any case (.PNG)', () => {
    const rules: UploadRules = { accept: ['.png'], maxBytes: MB };
    expect(checkFile(file('SCAN.PNG', 10, ''), rules)).toEqual({ ok: true });
    expect(checkFile(file('scan.png', 10, ''), { accept: ['.PNG'], maxBytes: MB })).toEqual({ ok: true });
  });

  it('matches a MIME type in any case and ignores its parameters', () => {
    const rules: UploadRules = { accept: ['text/csv'], maxBytes: MB };
    expect(checkFile(file('a.csv', 10, 'TEXT/CSV;charset=utf-8'), rules)).toEqual({ ok: true });
  });

  it('matches a wildcard by its major type only', () => {
    const rules: UploadRules = { accept: ['image/*'], maxBytes: MB };
    expect(checkFile(file('a.svg', 10, 'image/svg+xml'), rules)).toEqual({ ok: true });
    expect(checkFile(file('a.pdf', 10, 'application/pdf'), rules)).toMatchObject({ code: 'type' });
  });

  it('accepts a CSV whichever way the system types it (Excel reports ms-excel)', () => {
    const rules: UploadRules = { accept: ['.csv', 'text/csv'], maxBytes: Number.POSITIVE_INFINITY, maxFiles: 1 };
    expect(checkFile(file('rows.csv', 10, 'application/vnd.ms-excel'), rules)).toEqual({ ok: true });
    expect(checkFile(file('rows.csv', 10, ''), rules)).toEqual({ ok: true });
    expect(checkFile(file('rows.xlsx', 10, 'application/vnd.ms-excel'), rules)).toMatchObject({ code: 'type' });
  });

  it('refuses nothing for size when the server sets no cap', () => {
    const rules: UploadRules = { accept: ['.csv'], maxBytes: Number.POSITIVE_INFINITY };
    expect(checkFile(file('huge.csv', 10 * 1024 * MB, 'text/csv'), rules)).toEqual({ ok: true });
  });
});

describe('checkFiles', () => {
  const rules: UploadRules = { ...IMAGES, maxFiles: 3 };

  it('returns one result per file in the same order', () => {
    const results = checkFiles(
      [file('a.png', 10, 'image/png'), file('b.tiff', 10, 'image/tiff'), file('c.png', 10, 'image/png')],
      rules,
    );
    expect(results.map((r) => r.ok)).toEqual([true, false, true]);
  });

  it('accepts exactly maxFiles and refuses the one over, in order', () => {
    const four = ['a', 'b', 'c', 'd'].map((n) => file(`${n}.png`, 10, 'image/png'));
    const results = checkFiles(four, rules);
    expect(results.map((r) => r.ok)).toEqual([true, true, true, false]);
    expect(results[3]).toMatchObject({
      code: 'count',
      reason: 'd.png was not added.',
      remedy: 'Up to 3 files at a time. Remove one or wait for an upload to finish.',
    });
  });

  it('counts files already queued against the limit', () => {
    const two = [file('a.png', 10, 'image/png'), file('b.png', 10, 'image/png')];
    expect(checkFiles(two, rules, 2).map((r) => r.ok)).toEqual([true, false]);
    expect(checkFiles(two, rules, 3).map((r) => r.ok)).toEqual([false, false]);
  });

  it('lets a wrong file take no place, so it never costs a right one its slot', () => {
    const batch = [
      file('bad.tiff', 10, 'image/tiff'),
      file('a.png', 10, 'image/png'),
      file('b.png', 10, 'image/png'),
      file('c.png', 10, 'image/png'),
    ];
    expect(checkFiles(batch, rules).map((r) => r.ok)).toEqual([false, true, true, true]);
  });

  it('asks for one file at a time when the limit is a single file', () => {
    const results = checkFiles([file('a.png', 10, 'image/png'), file('b.png', 10, 'image/png')], {
      ...IMAGES,
      maxFiles: 1,
    });
    expect(results[0]).toEqual({ ok: true });
    expect(results[1]).toMatchObject({ code: 'count', remedy: 'Choose one file at a time.' });
  });

  it('has no count limit when maxFiles is absent', () => {
    const many = Array.from({ length: 200 }, (_, i) => file(`f${i}.png`, 10, 'image/png'));
    expect(checkFiles(many, IMAGES).every((r) => r.ok)).toBe(true);
  });

  it('handles an empty drop', () => {
    expect(checkFiles([], rules)).toEqual([]);
  });
});

describe('partitionFiles', () => {
  it('splits accepted files from refusals, keeping each file with its refusal', () => {
    const good = file('a.png', 10, 'image/png');
    const bad = file('b.tiff', 10, 'image/tiff');
    const { accepted, refusals } = partitionFiles([good, bad], IMAGES);
    expect(accepted).toEqual([good]);
    expect(refusals).toHaveLength(1);
    expect(refusals[0]).toMatchObject({ file: bad, code: 'type' });
  });
});

describe('formatSpeed', () => {
  it('is the byte format per second', () => {
    expect(formatSpeed(1.5 * MB)).toBe('1.5 MB/s');
    expect(formatSpeed(0)).toBe('0 B/s');
  });
});

describe('formatEta', () => {
  it('counts seconds under a minute, rounded up', () => {
    expect(formatEta(0.2)).toBe('1 s');
    expect(formatEta(4)).toBe('4 s');
    expect(formatEta(59.01)).toBe('1 min');
  });

  it('adds the seconds under ten minutes', () => {
    expect(formatEta(80)).toBe('1 min 20 s');
    expect(formatEta(120)).toBe('2 min');
  });

  it('rounds to minutes from ten minutes on, and to hours and minutes past an hour', () => {
    expect(formatEta(601)).toBe('11 min');
    expect(formatEta(3599)).toBe('1 h');
    expect(formatEta(3601)).toBe('1 h 1 min');
    expect(formatEta(7200)).toBe('2 h');
  });

  it('gives nothing for a number that is not a time', () => {
    expect(formatEta(Number.NaN)).toBe('');
    expect(formatEta(-1)).toBe('');
    expect(formatEta(Number.POSITIVE_INFINITY)).toBe('');
  });
});
