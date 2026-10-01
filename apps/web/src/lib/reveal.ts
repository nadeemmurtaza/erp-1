import { prefersReducedMotion } from '@/hooks/use-prefers-reduced-motion';
import { staggerDelayMs } from '@/lib/motion';

/**
 * Hides a group of elements and reveals each as it scrolls into view, staggered
 * within the batch that arrives together. DOM-only and imperative on purpose:
 * the elements belong to React, but whether they have been seen yet is not
 * state worth a render — it is one attribute and one custom property, written
 * to the node, read by `[data-reveal]` in globals.css.
 *
 * Progressive in the strict sense. The server renders every element visible, so
 * with no scripting, with an observer-less browser, or under reduced motion
 * nothing is ever hidden and nothing is missing. Arming runs in a layout effect,
 * before the first paint, so an element that is about to arrive is never seen
 * at full opacity first. Only the elements present when it is armed take part:
 * anything added later (a filter, a page of results) simply appears, since
 * hiding what the reader just asked for is motion that delays the task.
 *
 * Returns the disposer; it restores every element it touched, which is also
 * what keeps React's StrictMode double-run honest.
 */
export function armReveal(items: readonly HTMLElement[]): () => void {
  if (items.length === 0 || prefersReducedMotion() || typeof IntersectionObserver === 'undefined') {
    return () => {};
  }

  const observer = new IntersectionObserver(
    (entries) => {
      // Stagger within the batch that became visible together, in document
      // order, so item 20 entering alone does not wait behind its index.
      const arriving = entries
        .filter((entry) => entry.isIntersecting)
        .map((entry) => entry.target as HTMLElement)
        .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
      arriving.forEach((el, index) => {
        el.style.setProperty('--reveal-delay', `${staggerDelayMs(index)}ms`);
        el.dataset.reveal = 'shown';
        observer.unobserve(el);
      });
    },
    // A little inside the bottom edge, so an element is revealed when it has
    // actually come into view rather than the instant its top pixel does.
    { rootMargin: '0px 0px -8% 0px', threshold: 0.01 },
  );

  for (const el of items) {
    el.dataset.reveal = 'hidden';
    observer.observe(el);
  }

  return () => {
    observer.disconnect();
    for (const el of items) {
      delete el.dataset.reveal;
      el.style.removeProperty('--reveal-delay');
    }
  };
}
