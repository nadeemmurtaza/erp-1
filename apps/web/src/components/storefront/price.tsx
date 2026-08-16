import { formatMoney, type Locale } from '@yaseen/shared';
import clsx from 'clsx';

interface PriceProps {
  /** Amount in paisa. */
  amount: number;
  locale: Locale;
  /** Struck-through original price, in paisa. Ignored when not higher. */
  compareAt?: number | null;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const SIZES = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-2xl',
} as const;

/**
 * Renders a price. Everything in the system is integer paisa; this is the only
 * place a customer-visible rupee figure is produced, so a formatting change is
 * one edit.
 */
export function Price({ amount, locale, compareAt, className, size = 'md' }: PriceProps) {
  const showCompare = typeof compareAt === 'number' && compareAt > amount;

  return (
    <span className={clsx('inline-flex items-baseline gap-2', SIZES[size], className)}>
      <span className="font-semibold text-ink">{formatMoney(amount, locale)}</span>
      {showCompare ? (
        <span className="text-sm font-normal text-ink/50 line-through">
          {formatMoney(compareAt, locale)}
        </span>
      ) : null}
    </span>
  );
}
