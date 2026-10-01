'use client';

import { useLayoutEffect, useRef } from 'react';
import { cn } from '@/utils/cn';
import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion';
import { MOTION_MS, scrambleFrame, typedFrame } from '@/lib/motion';

/**
 * How often the noise in a decode changes, in ms. 40 is 25 frames a second: fast
 * enough to read as characters resolving, slow enough not to read as a strobe.
 * At the display's own 60 frames the glyphs would change faster than the eye
 * can take them in and the effect becomes flicker. Applies to `ScrambleText`
 * only; the typed reveal moves at its progress, not a tick.
 */
const NOISE_TICK_MS = 40;

/** Past this many characters a reveal is a wall of motion, not a flourish: it does not run. */
const MAX_ANIMATED_CHARS = 80;

/**
 * Text that resolves out of noise, once, when it arrives or changes.
 *
 * What it communicates: *the system just produced this*. A reference number
 * that has been assigned, a status that has just flipped, a code the server
 * returned — a value that did not exist a moment ago and should not be mistaken
 * for one that was always there. It is for a short value (a code, a name, a
 * status), never a sentence and never something the reader is trying to
 * read: it runs for `slow` (320ms) and then it is plain text.
 *
 * Noise keeps the kind of each character (digit for digit, capital for capital;
 * punctuation and spaces stay), so `INV-2041` never changes shape while it
 * decodes. The settled text is what the server renders and what a screen reader
 * hears (`sr-only`); the decoding copy is `aria-hidden`. Reduced motion never
 * starts it.
 */
export function ScrambleText({ text, className }: { text: string; className?: string }) {
  const reduced = usePrefersReducedMotion();
  const node = useRef<HTMLSpanElement>(null);

  // Runs on arrival and whenever `text` changes; an identical re-render is neither.
  useLayoutEffect(() => {
    const textNode = node.current?.firstChild;
    if (!textNode) return;
    textNode.nodeValue = text;
    // An empty or very long value, or reduced motion: it is just text.
    if (reduced || text.length === 0 || text.length > MAX_ANIMATED_CHARS) return;

    let frame = 0;
    let last = -Infinity;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = (now - start) / MOTION_MS.scramble;
      if (progress >= 1) {
        textNode.nodeValue = text;
        return;
      }
      if (now - last >= NOISE_TICK_MS) {
        last = now;
        textNode.nodeValue = scrambleFrame(text, progress, Math.random);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      textNode.nodeValue = text;
    };
  }, [text, reduced]);

  return (
    <span className={className}>
      <span ref={node} aria-hidden="true">
        {text}
      </span>
      <span className="sr-only">{text}</span>
    </span>
  );
}

/**
 * Text that is typed out, once, when it arrives.
 *
 * What it communicates: that something is *being said* — an answer from the
 * assistant, a one-line summary a screen has just written. It is for a short
 * line (up to 80 characters); anything longer simply appears. It runs for
 * `slow` in total, however long the line, so it is a quick wipe left to right in
 * the direction of reading, not a slow crawl the reader has to wait through.
 *
 * The whole line is always laid out — the part not yet typed is transparent, not
 * absent — so nothing reflows while it types and a wrapping line wraps where it
 * will end up. Accessibility is as `ScrambleText`: one `sr-only` copy of the
 * settled line, and reduced motion never starts it.
 */
export function TypeText({ text, className }: { text: string; className?: string }) {
  const reduced = usePrefersReducedMotion();
  const typed = useRef<HTMLSpanElement>(null);
  const rest = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const a = typed.current?.firstChild;
    const b = rest.current;
    if (!a || !b) return;
    const settle = () => {
      a.nodeValue = text;
      b.textContent = '';
    };
    if (reduced || text.length === 0 || text.length > MAX_ANIMATED_CHARS) {
      settle();
      return;
    }
    const chars = Array.from(text);
    let frame = 0;
    const start = performance.now();
    const paint = (progress: number) => {
      const head = typedFrame(text, progress);
      a.nodeValue = head;
      b.textContent = chars.slice(Array.from(head).length).join('');
    };
    paint(0);
    const tick = (now: number) => {
      const progress = (now - start) / MOTION_MS.type;
      if (progress >= 1) {
        settle();
        return;
      }
      paint(progress);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      settle();
    };
  }, [text, reduced]);

  return (
    <span className={cn(className)}>
      <span aria-hidden="true">
        <span ref={typed}>{text}</span>
        <span ref={rest} className="opacity-0" />
      </span>
      <span className="sr-only">{text}</span>
    </span>
  );
}
