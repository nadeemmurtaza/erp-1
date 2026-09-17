'use client';

import { useTranslations } from 'next-intl';
import { ORDER_STATUSES } from '@newax/shared';

/**
 * An order status in the reader's language.
 *
 * The customer's order list and the order itself both need this, and both
 * wrote it out: check the status is one we know, translate it, fall back to
 * the raw enum if the API ever sends something newer than the front end. The
 * list skipped the check entirely and printed `READY_TO_SHIP` at a shopper.
 *
 * Admin has no use for this — it reads the enum names deliberately, via
 * `statusLabel` in components/common/status-badge.
 */
export function useOrderStatusLabel() {
  const t = useTranslations('order');

  return (status: string): string =>
    (ORDER_STATUSES as readonly string[]).includes(status) ? t(`status.${status}`) : status;
}
