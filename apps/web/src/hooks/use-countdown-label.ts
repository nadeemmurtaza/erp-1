'use client';

import { useTranslations } from 'next-intl';
import { countdownUnits } from '@/lib/auction-live';

/**
 * A span as words in the shopper's language: "12m 30s", "4h 12m", "2d 4h". The
 * two largest units that apply; the letters come from the `auction.time`
 * messages, so a right-to-left locale sets its own and nothing here is English.
 */
export function useCountdownLabel(): (ms: number) => string {
  const t = useTranslations('auction.time');
  return (ms) => countdownUnits(ms).map(({ unit, value }) => t(unit, { value })).join(' ');
}
