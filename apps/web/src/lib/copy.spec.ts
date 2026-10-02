import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  COPIED_HOLD_MS,
  COPY_FAILED_HOLD_MS,
  COPY_IDLE,
  copyHoldMs,
  copyText,
  nextCopy,
  normalizeCopyValue,
  selectContents,
  type CopyState,
} from './copy';

/**
 * The clipboard rules, with no browser: `navigator` and `document` are replaced
 * by the few members `copyText` touches, and every call is recorded in order so
 * a spec can say what happened before what. What this cannot show is that a real
 * engine honours the command; that is the render check in the PR.
 */

describe('normalizeCopyValue (CPY-3)', () => {
  it('returns the value untouched when there is nothing invisible in it', () => {
    expect(normalizeCopyValue('sk_live_51Hx9')).toBe('sk_live_51Hx9');
  });

  it('keeps the spaces and line breaks inside, because it does not reformat', () => {
    expect(normalizeCopyValue('DE89 3704 0044 0532 0130 00')).toBe('DE89 3704 0044 0532 0130 00');
    expect(normalizeCopyValue('line one\nline two')).toBe('line one\nline two');
  });

  it('removes zero-width spaces, joiners, direction marks and the byte-order mark', () => {
    const dirty = '\uFEFFPK\u200B-12\u200C34\u200D-\u200E56\u200F78\u2060';
    expect(normalizeCopyValue(dirty)).toBe('PK-1234-5678');
  });

  it('removes bidirectional embeddings and isolates', () => {
    expect(normalizeCopyValue('\u202A1234\u202C \u2066AB\u2069')).toBe('1234 AB');
  });

  it('removes the Arabic letter mark that right-to-left number formatting adds, the soft hyphen and the deprecated format controls', () => {
    expect(normalizeCopyValue('\u061CPK36\u061C SCBL\u00AD0000\u206A1123\u206F')).toBe('PK36 SCBL00001123');
  });

  it('does not remove a visible character that only looks unusual', () => {
    expect(normalizeCopyValue('\u00B7 TRK\u2010042 \u00A0')).toBe('\u00B7 TRK\u2010042');
  });

  it('trims the ends and nothing else', () => {
    expect(normalizeCopyValue('  \n TRK 9 \t')).toBe('TRK 9');
  });

  it('turns a value that was only invisible into an empty one', () => {
    expect(normalizeCopyValue('\u200B \u200D\uFEFF')).toBe('');
  });
});

/* ── a clipboard with no browser ───────────────────────────────────────── */

interface Harness {
  calls: string[];
  writeText: ReturnType<typeof vi.fn>;
  execCommand: ReturnType<typeof vi.fn>;
  field: { value: string; readOnly: boolean; style: { cssText: string }; remove: ReturnType<typeof vi.fn> };
  body: { appendChild: ReturnType<typeof vi.fn> };
  dialog: { appendChild: ReturnType<typeof vi.fn> };
  insideDialog: { closest: (selector: string) => unknown };
  outsideDialog: { closest: (selector: string) => unknown };
  previouslyFocused: { focus: ReturnType<typeof vi.fn> };
  range: object;
  selection: { removeAllRanges: ReturnType<typeof vi.fn>; addRange: ReturnType<typeof vi.fn> };
}

/** What the page offers: an async API that works, rejects or is absent, and a copy command that works, refuses or throws. */
function stubBrowser(options: {
  api: 'works' | 'rejects' | 'absent';
  command?: 'works' | 'refuses' | 'throws' | 'missing';
}): Harness {
  const calls: string[] = [];
  const command = options.command ?? 'works';

  class FakeHTMLElement {}
  vi.stubGlobal('HTMLElement', FakeHTMLElement);

  const writeText = vi.fn(async (text: string) => {
    calls.push(`writeText:${text}`);
    if (options.api === 'rejects') throw new Error('NotAllowedError');
  });
  vi.stubGlobal('navigator', options.api === 'absent' ? {} : { clipboard: { writeText } });

  const body = { appendChild: vi.fn(() => calls.push('append:body')) };
  const dialog = { appendChild: vi.fn(() => calls.push('append:dialog')) };
  const insideDialog = { closest: (selector: string) => (selector === 'dialog[open]' ? dialog : null) };
  const outsideDialog = { closest: () => null };

  const field = {
    value: '',
    readOnly: false,
    tabIndex: 0,
    style: { cssText: '' },
    setAttribute: vi.fn(),
    focus: vi.fn(() => calls.push('field.focus')),
    select: vi.fn(() => calls.push('field.select')),
    setSelectionRange: vi.fn(),
    remove: vi.fn(() => calls.push('field.remove')),
  };

  const previouslyFocused = Object.assign(new FakeHTMLElement(), {
    focus: vi.fn(() => calls.push('restore.focus')),
  });
  const range = {};
  const selection = {
    rangeCount: 1,
    getRangeAt: () => range,
    removeAllRanges: vi.fn(() => calls.push('selection.clear')),
    addRange: vi.fn(() => calls.push('selection.restore')),
  };

  const execCommand = vi.fn((name: string) => {
    calls.push(`exec:${name}:${field.value}`);
    if (command === 'throws') throw new Error('SecurityError');
    return command === 'works';
  });

  vi.stubGlobal('document', {
    body,
    activeElement: previouslyFocused,
    createElement: () => field,
    getSelection: () => selection,
    ...(command === 'missing' ? {} : { execCommand }),
  });

  return { calls, writeText, execCommand, field, body, dialog, insideDialog, outsideDialog, previouslyFocused, range, selection };
}

afterEach(() => vi.unstubAllGlobals());

describe('copyText (CPY-3, CPY-5)', () => {
  it('writes the raw value by the clipboard API, with the invisible characters gone', async () => {
    const page = stubBrowser({ api: 'works' });
    await expect(copyText('\u200BDE89 3704\u200B')).resolves.toBe('clipboard');
    expect(page.writeText).toHaveBeenCalledWith('DE89 3704');
    expect(page.execCommand).not.toHaveBeenCalled();
  });

  it('copies nothing and says so for an empty value', async () => {
    const page = stubBrowser({ api: 'works' });
    await expect(copyText('')).resolves.toBe('failed');
    await expect(copyText('\u200B  \uFEFF')).resolves.toBe('failed');
    expect(page.writeText).not.toHaveBeenCalled();
    expect(page.execCommand).not.toHaveBeenCalled();
  });

  it('falls back to the copy command when the API is missing, as on an insecure origin', async () => {
    const page = stubBrowser({ api: 'absent' });
    await expect(copyText('TRK-0042')).resolves.toBe('command');
    expect(page.execCommand).toHaveBeenCalledWith('copy');
    expect(page.field.value).toBe('TRK-0042');
    expect(page.field.readOnly).toBe(true);
  });

  it('runs the copy command inside the click when the API is missing, with nothing awaited before it', () => {
    const page = stubBrowser({ api: 'absent' });
    const pending = copyText('TRK-0042');
    // Synchronous: the command has already run by the time the promise is in hand.
    expect(page.execCommand).toHaveBeenCalledTimes(1);
    return pending;
  });

  it('falls back to the copy command when the API refuses', async () => {
    const page = stubBrowser({ api: 'rejects' });
    await expect(copyText('sk_live_51Hx9')).resolves.toBe('command');
    expect(page.writeText).toHaveBeenCalledTimes(1);
    expect(page.calls).toContain('exec:copy:sk_live_51Hx9');
  });

  it('fails, and says so, when the API is missing and the command refuses', async () => {
    stubBrowser({ api: 'absent', command: 'refuses' });
    await expect(copyText('x')).resolves.toBe('failed');
  });

  it('fails when the API refuses and the command refuses', async () => {
    stubBrowser({ api: 'rejects', command: 'refuses' });
    await expect(copyText('x')).resolves.toBe('failed');
  });

  it('fails, without throwing, when the command throws', async () => {
    stubBrowser({ api: 'absent', command: 'throws' });
    await expect(copyText('x')).resolves.toBe('failed');
  });

  it('fails when there is no copy command to fall back to', async () => {
    stubBrowser({ api: 'absent', command: 'missing' });
    await expect(copyText('x')).resolves.toBe('failed');
  });

  it('puts the scratch field inside the open dialog that holds the click, where a modal would leave the body inert', async () => {
    const page = stubBrowser({ api: 'absent' });
    await copyText('x', page.insideDialog as unknown as Element);
    expect(page.dialog.appendChild).toHaveBeenCalledTimes(1);
    expect(page.body.appendChild).not.toHaveBeenCalled();
  });

  it('puts the scratch field on the body when the click is not inside a dialog', async () => {
    const page = stubBrowser({ api: 'absent' });
    await copyText('x', page.outsideDialog as unknown as Element);
    expect(page.body.appendChild).toHaveBeenCalledTimes(1);
    expect(page.dialog.appendChild).not.toHaveBeenCalled();
  });

  it('removes the scratch field, and gives back focus and selection, after a copy', async () => {
    const page = stubBrowser({ api: 'absent' });
    await copyText('x');
    expect(page.field.remove).toHaveBeenCalledTimes(1);
    expect(page.selection.addRange).toHaveBeenCalledWith(page.range);
    expect(page.previouslyFocused.focus).toHaveBeenCalledTimes(1);
    // Cleaned up after the copy, never before it.
    expect(page.calls.indexOf('exec:copy:x')).toBeLessThan(page.calls.indexOf('field.remove'));
  });

  it('cleans up the same way when the command throws', async () => {
    const page = stubBrowser({ api: 'absent', command: 'throws' });
    await copyText('x');
    expect(page.field.remove).toHaveBeenCalledTimes(1);
    expect(page.previouslyFocused.focus).toHaveBeenCalledTimes(1);
  });
});

/* ── the button's state ────────────────────────────────────────────────── */

describe('nextCopy (CPY-1, CPY-2, CPY-5)', () => {
  it('goes from idle to copied on the first result, counting from 1', () => {
    expect(nextCopy(COPY_IDLE, { type: 'copied' })).toEqual({ phase: 'copied', n: 1 });
    expect(nextCopy(COPY_IDLE, { type: 'failed' })).toEqual({ phase: 'failed', n: 1 });
  });

  it('counts up when a second copy lands inside the hold, so it is a new state and gives a new signal', () => {
    const first = nextCopy(COPY_IDLE, { type: 'copied' });
    const second = nextCopy(first, { type: 'copied' });
    expect(second).toEqual({ phase: 'copied', n: 2 });
    expect(second).not.toBe(first);
  });

  it('lets a failure replace a success and the other way round', () => {
    const copied = nextCopy(COPY_IDLE, { type: 'copied' });
    expect(nextCopy(copied, { type: 'failed' })).toEqual({ phase: 'failed', n: 2 });
    expect(nextCopy({ phase: 'failed', n: 1 }, { type: 'copied' })).toEqual({ phase: 'copied', n: 2 });
  });

  it('returns to idle when the hold that set the timer expires, and the count starts again after', () => {
    const copied = nextCopy(COPY_IDLE, { type: 'copied' });
    const idle = nextCopy(copied, { type: 'expire', n: 1 });
    expect(idle).toEqual(COPY_IDLE);
    expect(nextCopy(idle, { type: 'copied' })).toEqual({ phase: 'copied', n: 1 });
  });

  it('ignores a timer that a newer copy has overtaken, so the check is never cut short', () => {
    const second: CopyState = { phase: 'copied', n: 2 };
    expect(nextCopy(second, { type: 'expire', n: 1 })).toBe(second);
  });

  it('ignores an expiry when idle', () => {
    expect(nextCopy(COPY_IDLE, { type: 'expire', n: 1 })).toBe(COPY_IDLE);
  });

  it('goes back to idle at once when the value changes, from either result', () => {
    expect(nextCopy({ phase: 'copied', n: 3 }, { type: 'reset' })).toBe(COPY_IDLE);
    expect(nextCopy({ phase: 'failed', n: 1 }, { type: 'reset' })).toBe(COPY_IDLE);
    expect(nextCopy(COPY_IDLE, { type: 'reset' })).toBe(COPY_IDLE);
  });
});

describe('selectContents (CPY-5)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('selects the children of the element it is given', () => {
    const selectAllChildren = vi.fn();
    vi.stubGlobal('window', { getSelection: () => ({ selectAllChildren }) });
    const element = {} as Element;
    selectContents(element);
    expect(selectAllChildren).toHaveBeenCalledWith(element);
  });

  it('does nothing for a missing element, a missing window or a browser with no selection', () => {
    expect(() => selectContents(null)).not.toThrow();
    expect(() => selectContents(undefined)).not.toThrow();
    vi.stubGlobal('window', { getSelection: () => null });
    expect(() => selectContents({} as Element)).not.toThrow();
  });
});

describe('copyHoldMs (CPY-2, CPY-5)', () => {
  it('holds the check for two seconds and a failure for four, and idle for ever', () => {
    expect(copyHoldMs({ phase: 'copied', n: 1 })).toBe(2000);
    expect(copyHoldMs({ phase: 'failed', n: 1 })).toBe(4000);
    expect(copyHoldMs(COPY_IDLE)).toBeNull();
  });

  it('reads the brand, not a number of its own', () => {
    expect(COPIED_HOLD_MS).toBe(2000);
    expect(COPY_FAILED_HOLD_MS).toBeGreaterThan(COPIED_HOLD_MS);
  });
});
