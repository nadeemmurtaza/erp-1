/**
 * Where a floating panel goes, as arithmetic (MNU-4).
 *
 * Every menu, picker and calendar in the product opens below its trigger unless
 * that would not fit, so the rule is one pure function rather than a position
 * guess written into each component: it takes rectangles and returns numbers,
 * has no DOM and no clock, and is tested at the boundaries (room below exactly
 * equal to the height needed, both sides too small, right-to-left).
 *
 * The rule, in order:
 *   1. Below the trigger, unless there is less room below than the panel needs
 *      AND more room above than below. Then it flips up. Equal room never flips:
 *      a panel that fits exactly belongs where the reader looks first.
 *   2. Its height is capped to the room on the side it took, minus `margin`, so
 *      when neither side fits it takes the larger and scrolls inside itself.
 *   3. Horizontally it lines up with the trigger's inline-start edge, then is
 *      clamped to stay `margin` inside the viewport. In a right-to-left page the
 *      alignment edge is the trigger's right edge, so the panel grows leftwards.
 */

/** A rectangle in viewport coordinates, the shape `getBoundingClientRect()` returns. */
export interface Rect {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface PlaceInput {
  trigger: Rect;
  /** The panel's natural size, measured before any cap is applied. */
  popover: { width: number; height: number };
  viewport: { width: number; height: number };
  /** Space between the trigger and the panel. */
  gap?: number;
  /** The least space left between the panel and the viewport edge. */
  margin?: number;
  rtl?: boolean;
}

export interface Placement {
  placement: 'bottom' | 'top';
  /** Where the panel's height stops: the room on its side, never more than it asked for. */
  maxHeight: number;
  /** The widest it may be: the viewport less a margin each side. */
  maxWidth: number;
  /** Physical offset from the viewport's left edge. */
  left: number;
  /** The same position as an offset from the viewport's inline-start edge (use with `inset-inline-start`). */
  inlineStart: number;
  /** For `placement: 'bottom'`: offset from the viewport top. Undefined when flipped. */
  top?: number;
  /** For `placement: 'top'`: offset from the viewport bottom, so a panel that shrinks stays attached. */
  bottom?: number;
  /** True when it opened above because below did not fit. */
  flipped: boolean;
}

/**
 * Parameter: gap between trigger and panel. Exact value: 4 px. A hairline of the
 * page between the two so the panel reads as attached but not touching; half the
 * 8 px spacing step, which is the smallest the scale has.
 */
export const POPOVER_GAP = 4;

/**
 * Parameter: least distance to the viewport edge. Exact value: 8 px. Enough that
 * a panel's shadow and rounded corner are never cut by the screen edge, and
 * small enough that on a 280 px screen the panel still gets 264 px.
 */
export const POPOVER_MARGIN = 8;

export function placePopover({
  trigger,
  popover,
  viewport,
  gap = POPOVER_GAP,
  margin = POPOVER_MARGIN,
  rtl = false,
}: PlaceInput): Placement {
  const roomBelow = Math.max(0, viewport.height - trigger.bottom - gap - margin);
  const roomAbove = Math.max(0, trigger.top - gap - margin);

  // Strictly less: a panel that fits to the pixel stays below.
  const flipped = roomBelow < popover.height && roomAbove > roomBelow;
  const room = flipped ? roomAbove : roomBelow;
  const maxHeight = Math.min(popover.height, room);

  const maxWidth = Math.max(0, viewport.width - margin * 2);
  const width = Math.min(popover.width, maxWidth);

  // Line up with the trigger's inline-start edge; in RTL that is its right edge.
  const ideal = rtl ? trigger.right - width : trigger.left;
  const hi = Math.max(margin, viewport.width - margin - width);
  const left = Math.min(Math.max(ideal, margin), hi);

  return {
    placement: flipped ? 'top' : 'bottom',
    maxHeight,
    maxWidth,
    left,
    inlineStart: rtl ? viewport.width - left - width : left,
    ...(flipped ? { bottom: viewport.height - trigger.top + gap } : { top: trigger.bottom + gap }),
    flipped,
  };
}
