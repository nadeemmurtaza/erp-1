import { Badge, type BadgeTone } from '@/components/ui';

/**
 * The pill that carries a record's state — an order's status, a product's,
 * a stitching job's stage.
 *
 * This existed four times before: `StatusBadge` written out separately in the
 * orders list, the order detail page and the products list, plus `StageBadge`
 * for stitching. All four were the same twelve lines with a different set of
 * status names, all four rebuilt the pill instead of using the Badge
 * primitive, and all four shared one bug — the quiet state (`PENDING`,
 * `DRAFT`, `RECEIVED`) was `bg-white` on a white table row, so the most
 * common status in the product rendered as bare text while every other
 * status got a pill. That is exactly the state a reader most needs to pick
 * out of a list.
 *
 * Tone carries meaning, never decoration: `danger` is a bad end state,
 * `success` a good one, `warning` something waiting on a human, `info` a
 * normal step along the way. The label is always present — colour alone is
 * never the signal.
 */
const TONES: Record<string, BadgeTone> = {
  // Ended badly, or money is going back
  CANCELLED: 'danger',
  RETURNED: 'danger',
  REFUNDED: 'danger',
  FAILED: 'danger',
  ARCHIVED: 'danger',
  LOST: 'danger',
  // Ended well
  DELIVERED: 'success',
  ACTIVE: 'success',
  PAID: 'success',
  READY: 'success',
  DISPATCHED: 'success',
  WON: 'success',
  // Waiting on someone
  PENDING: 'warning',
  AWAITING_APPROVAL: 'warning',
  QUOTED: 'warning',
  // Not live, but not wrong either
  DRAFT: 'neutral',
  RECEIVED: 'neutral',
  NEW: 'neutral',
};

/** `READY_TO_SHIP` -> `Ready to ship`. */
export function statusLabel(status: string): string {
  return status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, ' ');
}

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return <Badge tone={TONES[status] ?? 'info'}>{label ?? statusLabel(status)}</Badge>;
}
