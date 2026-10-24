import { BRAND } from '@newax/shared';

/**
 * Putting a value on the clipboard, and the state a copy button moves through
 * (CPY-1 to CPY-5). Kept out of the component so the whole of it can be tested
 * without a DOM, and so it is the one place in the application that touches the
 * clipboard: `scripts/check-clipboard.mjs` fails a call anywhere else.
 */

/** How long the check stays (CPY-2), and how long a failure stays (CPY-5). */
export const COPIED_HOLD_MS = BRAND.feedback.copiedHoldMs;
export const COPY_FAILED_HOLD_MS = BRAND.feedback.copyFailedHoldMs;

/* ── the raw value (CPY-3) ─────────────────────────────────────────────── */

/**
 * Characters that take no room on screen, written as escapes because a literal
 * one is invisible in an editor and one that strips them would break this
 * silently:
 *
 *   U+00AD          soft hyphen, which a hyphenator adds so a long code can wrap
 *   U+061C          Arabic letter mark, which ICU puts around numbers in right-to-left text
 *   U+200B-U+200F   zero-width space, non-joiner, joiner, left-to-right and right-to-left marks
 *   U+202A-U+202E   bidirectional embeddings and overrides
 *   U+2060-U+206F   word joiner, invisible operators, isolates and the deprecated format controls
 *   U+FEFF          byte-order mark, also the zero-width no-break space
 *
 * A formatter slips them in so a number wraps or a mixed-script line reads in
 * the right order; pasted into a terminal, a form or a bank's website they are
 * a different value that looks identical. Variation selectors are not here:
 * they choose a glyph rather than vanish, and a code has no emoji.
 */
const INVISIBLE = /[\u00AD\u061C\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g;

/**
 * What goes on the clipboard: the string with what cannot be seen removed and
 * its ends trimmed, and nothing else. No regrouping, no case change.
 *
 * It is for identifiers and codes, which is what a copy button is for (a secret,
 * an account number, an IBAN, a tracking number). It is not for prose: in prose a
 * zero-width joiner is spelling, and removing it would change the word.
 */
export function normalizeCopyValue(value: string): string {
  return value.replace(INVISIBLE, '').trim();
}

/* ── the write (CPY-5) ─────────────────────────────────────────────────── */

/** How the value got there. `failed` means it did not, and nothing is on the clipboard. */
export type CopyVia = 'clipboard' | 'command' | 'failed';

/**
 * A sibling the caller can pass so the fallback lands in the right place: the
 * element that was clicked. Safari does not focus a button on click, so the
 * active element cannot be trusted to say where the person is.
 */
type Origin = Element | null | undefined;

/**
 * The fallback: select a scratch field and ask the document to copy it. It is
 * the only route on an origin that is not secure (HTTP, or a LAN address),
 * where `navigator.clipboard` does not exist, and the second route where the
 * async call is refused.
 *
 * The scratch field goes inside the open `dialog` that holds the click, if
 * there is one. A modal dialog makes everything outside it inert, and an inert
 * field cannot be focused or selected, so a field on the body would copy
 * nothing there. It is read-only and 16 px so a phone does not open its
 * keyboard or zoom the page to reach it, and it is removed again whatever
 * happens. Focus and the page's own selection go back where they were.
 */
function copyByCommand(text: string, origin: Origin): boolean {
  if (typeof document === 'undefined' || typeof document.execCommand !== 'function') return false;

  const host = origin?.closest('dialog[open]') ?? document.body;
  const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const selection = document.getSelection();
  const ranges: Range[] = [];
  for (let i = 0; selection && i < selection.rangeCount; i += 1) ranges.push(selection.getRangeAt(i));

  const field = document.createElement('textarea');
  field.value = text;
  field.readOnly = true;
  field.tabIndex = -1;
  field.setAttribute('aria-hidden', 'true');
  // A scratch element nobody sees, not a design value: it is in the viewport (iOS will not select what is not),
  // takes no room, and cannot be hit.
  field.style.cssText =
    'position:fixed;inset-block-start:0;inset-inline-start:0;inline-size:1px;block-size:1px;padding:0;border:0;opacity:0;pointer-events:none;font-size:1rem';

  let copied = false;
  host.appendChild(field);
  try {
    field.focus({ preventScroll: true });
    field.select();
    field.setSelectionRange(0, text.length);
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  } finally {
    field.remove();
    if (selection) {
      selection.removeAllRanges();
      for (const range of ranges) selection.addRange(range);
    }
    previouslyFocused?.focus({ preventScroll: true });
  }
  return copied;
}

/**
 * Copy `raw` (CPY-3) by the async clipboard API where it exists, and by the copy
 * command where it does not or where it is refused. Resolves with how it got
 * there, or `failed`; never rejects, because a caller that has to remember a
 * `catch` is a caller that will one day forget it.
 *
 * Nothing is awaited before the fallback when the API is missing, so the
 * command still runs inside the click that asked for it: browsers only let a
 * copy happen during a user gesture, and Safari's window for it is the shortest.
 * An empty value is a failure, not a copy of nothing: "Copied" must never be said
 * about an empty clipboard.
 */
export async function copyText(raw: string, origin?: Origin): Promise<CopyVia> {
  const text = normalizeCopyValue(raw);
  if (text === '') return 'failed';

  const api = typeof navigator === 'undefined' ? undefined : navigator.clipboard;
  if (api && typeof api.writeText === 'function') {
    try {
      await api.writeText(text);
      return 'clipboard';
    } catch {
      // Refused (a permissions policy, a document that is not focused): the command may still be allowed.
    }
  }
  return copyByCommand(text, origin) ? 'command' : 'failed';
}

/**
 * Select what is on screen so a person can copy it by hand when neither route
 * worked (CPY-5): the text of `element`, the way a triple-click would. Does
 * nothing for a missing element or a browser with no selection API.
 */
export function selectContents(element: Element | null | undefined): void {
  if (!element || typeof window === 'undefined') return;
  window.getSelection()?.selectAllChildren(element);
}

/* ── the button's state (CPY-1, CPY-2, CPY-5) ──────────────────────────── */

/**
 * `n` counts the copies in a row, starting at 1. It is what lets a second copy
 * inside the hold be seen: the same phase with a new `n` is a new element and a
 * restarted clock (CPY-2), where the same phase with the same state would be
 * nothing at all.
 */
export type CopyState = { phase: 'idle' } | { phase: 'copied' | 'failed'; n: number };

export type CopyEvent = { type: 'copied' } | { type: 'failed' } | { type: 'expire'; n: number } | { type: 'reset' };

export const COPY_IDLE: CopyState = { phase: 'idle' };

/**
 * The next state. A result always replaces the state it finds, from idle or
 * from the other result, and counts up when it repeats. `expire` carries the `n`
 * of the hold that set the timer, so a timer that was overtaken by a newer copy
 * cannot send the control back to idle early. `reset` is for a control whose value
 * changed: a check for the old value must not stand for the new one.
 */
export function nextCopy(state: CopyState, event: CopyEvent): CopyState {
  switch (event.type) {
    case 'copied':
    case 'failed': {
      const n = state.phase === 'idle' ? 1 : state.n + 1;
      return { phase: event.type, n };
    }
    case 'expire':
      return state.phase !== 'idle' && state.n === event.n ? COPY_IDLE : state;
    case 'reset':
      return COPY_IDLE;
  }
}

/** How long a state is held before it expires; idle holds for ever. */
export function copyHoldMs(state: CopyState): number | null {
  if (state.phase === 'copied') return COPIED_HOLD_MS;
  if (state.phase === 'failed') return COPY_FAILED_HOLD_MS;
  return null;
}
