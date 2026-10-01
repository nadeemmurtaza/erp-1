'use client';

import { createPortal } from 'react-dom';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { placePopover } from '@/lib/popover-position';

/**
 * Lifts a floating panel out of whatever contains it and keeps it next to its
 * trigger (MNU-4).
 *
 * Call it from the component that renders the panel, which is mounted only
 * while the panel is open: mounting is opening, unmounting is closing, so there
 * is no `open` flag to drift from what is on screen.
 *
 * Why the Popover API and not `position: absolute` and a z-index: `z-dropdown`
 * is 20 and `z-modal` is 40 (`brand.ts` layers), so a menu inside a Dialog,
 * lifted to the body at 20, would open BEHIND the dialog that owns it. A popover
 * is promoted to the browser's top layer, above every z-index and outside every
 * `overflow: hidden` or `transform`, so no card, table or dialog edge clips it.
 * `popover="manual"` rather than `auto` because we do our own dismissal: `auto`
 * light-dismisses on any outside click and Escape in ways that do not return
 * focus where we need it, and closes a menu when a nested one opens.
 *
 * Where `showPopover` does not exist (browsers before 2024) the panel is
 * rendered through a portal into the nearest `[role=dialog]`, else the body, as
 * `position: fixed` at `z-dropdown`. Inside a dialog it is then in the dialog's
 * own stacking context, which is the only place it can be above the dialog's
 * content. The placement arithmetic is the same either way.
 *
 * Placement is `placePopover`, applied imperatively to the element's style on
 * every scroll (capture, so a scrolling ancestor counts) and resize, coalesced
 * to one `requestAnimationFrame`. It is written to the DOM rather than held in
 * state because it changes at scroll rate and no React output depends on it.
 *
 * Failure mode: if the trigger has been unmounted by the time a frame fires,
 * placement is skipped and the panel keeps its last position; the owner's own
 * unmount removes it.
 */

export type PopoverCloseReason = 'escape' | 'pick' | 'done' | 'outside' | 'blur';

/** Reasons that mean "I am finished with this control": focus goes back to the trigger. */
const RESTORES_FOCUS: readonly PopoverCloseReason[] = ['escape', 'pick', 'done'];

function supportsTopLayer(): boolean {
  return typeof HTMLElement !== 'undefined' && typeof HTMLElement.prototype.showPopover === 'function';
}

export interface UsePopoverOptions {
  /** The control that opened the panel. It is never inside the panel, and focus returns to it. */
  trigger: RefObject<HTMLElement | null>;
  /** What the panel is placed against, when that is wider than the control that opened it (a field and its button). */
  anchor?: RefObject<HTMLElement | null>;
  /**
   * Make the panel at least as wide as its anchor (a select's list). A calendar is
   * the width of a calendar, not of the field it hangs from, so it turns this off.
   */
  matchWidth?: boolean;
  onClose: (reason: PopoverCloseReason) => void;
}

export function usePopover({ trigger, anchor: anchorRef, matchWidth = true, onClose }: UsePopoverOptions) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  // The latest onClose, read by listeners that outlive a render. Updated after commit, not during render.
  const closeRef = useRef(onClose);
  useLayoutEffect(() => {
    closeRef.current = onClose;
  });

  // Decided once per mount: whether the panel is in the top layer or portalled.
  const [portalRoot] = useState<HTMLElement | null>(() => {
    if (supportsTopLayer() || typeof document === 'undefined') return null;
    return trigger.current?.closest<HTMLElement>('[role="dialog"]') ?? document.body;
  });

  const place = useCallback(() => {
    const anchor = (anchorRef ?? trigger).current;
    const panel = popoverRef.current;
    if (!anchor || !panel) return;

    // Measure the panel at its natural size: drop the previous cap first, otherwise
    // a panel that was squeezed once could never grow back when there is room again.
    panel.style.removeProperty('--popover-max-height');
    panel.style.removeProperty('--popover-max-width');
    const box = anchor.getBoundingClientRect();
    panel.style.minWidth = matchWidth ? `${box.width}px` : '';
    const rtl = getComputedStyle(panel).direction === 'rtl';
    const viewport = window.visualViewport;
    const result = placePopover({
      trigger: box,
      popover: { width: panel.offsetWidth, height: panel.offsetHeight },
      viewport: { width: viewport?.width ?? window.innerWidth, height: viewport?.height ?? window.innerHeight },
      rtl,
    });

    panel.style.setProperty('--popover-max-height', `${result.maxHeight}px`);
    panel.style.setProperty('--popover-max-width', `${result.maxWidth}px`);
    panel.style.insetInlineStart = `${result.inlineStart}px`;
    panel.style.insetInlineEnd = 'auto';
    panel.style.top = result.top === undefined ? 'auto' : `${result.top}px`;
    panel.style.bottom = result.bottom === undefined ? 'auto' : `${result.bottom}px`;
    // Readable from outside (a browser check can see which way it opened without measuring).
    panel.dataset.placement = result.placement;
    // It arrives out of the side the trigger is on: from above when it opens below.
    panel.style.setProperty(
      '--origin-dy',
      result.flipped ? 'var(--motion-distance-small)' : 'calc(var(--motion-distance-small) * -1)',
    );
  }, [trigger, anchorRef, matchWidth]);

  const schedule = useCallback(() => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      place();
    });
  }, [place]);

  // Show and place before the first paint, so the panel is never seen at the wrong spot.
  useLayoutEffect(() => {
    const panel = popoverRef.current;
    if (!panel) return;
    if (supportsTopLayer()) {
      try {
        panel.showPopover();
      } catch {
        // Already shown, or detached: placement below still runs and the panel renders in flow.
      }
    }
    place();
  }, [place]);

  useEffect(() => {
    const onScroll = (event: Event) => {
      // The panel's own list scrolling moves nothing relative to the trigger.
      if (event.target instanceof Node && popoverRef.current?.contains(event.target)) return;
      schedule();
    };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('scroll', schedule);

    // Light dismissal, by hand: a press anywhere outside both panel and trigger closes it.
    // Pointer events, in the capture phase, so something that stops propagation cannot hide the press.
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (popoverRef.current?.contains(target) || trigger.current?.contains(target)) return;
      // The anchor (a date field's text box) is part of the control: pressing it is not "outside".
      if (anchorRef?.current?.contains(target)) return;
      closeRef.current('outside');
    };
    document.addEventListener('pointerdown', onPointerDown, true);

    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('scroll', schedule);
      document.removeEventListener('pointerdown', onPointerDown, true);
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, [schedule, trigger, anchorRef]);

  /**
   * Closes, and hands focus back to the trigger when the person finished (pick,
   * Done, Escape). An outside press or Tab does not: focus is already going
   * where they pointed, and pulling it back would be a trap.
   */
  const close = useCallback(
    (reason: PopoverCloseReason) => {
      if (RESTORES_FOCUS.includes(reason)) trigger.current?.focus({ preventScroll: true });
      closeRef.current(reason);
    },
    [trigger],
  );

  /** Escape closes this panel and only this panel: a Dialog around it must not also close. */
  const onKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      close('escape');
    },
    [close],
  );

  /** Closes when focus leaves for something outside both the panel and its trigger (Tab away). */
  const onBlur = useCallback(
    (event: React.FocusEvent) => {
      const next = event.relatedTarget as Node | null;
      // No related target: the window lost focus, or a non-focusable area was pressed. The
      // pointer listener above covers a press; switching windows must not close the panel.
      if (!next) return;
      if (popoverRef.current?.contains(next) || trigger.current?.contains(next)) return;
      closeRef.current('blur');
    },
    [trigger],
  );

  /** Wrap the rendered panel: in place in the top layer, or portalled where there is none. */
  const layer = useCallback(
    (node: ReactNode): ReactNode => (portalRoot ? createPortal(node, portalRoot) : node),
    [portalRoot],
  );

  return {
    /** Spread onto the panel element. Its own `className` must include `fixed` (`[popover]` supplies it in the top layer). */
    popoverProps: { ref: popoverRef, popover: 'manual' as const, onKeyDown, onBlur },
    popoverRef,
    layer,
    close,
    /** Recompute now (the panel's content changed size). Coalesced with scroll and resize. */
    update: schedule,
  };
}
