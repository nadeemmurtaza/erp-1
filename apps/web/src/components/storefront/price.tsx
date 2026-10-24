import { formatMoney, type Locale } from '@newax/shared';
import { cn } from '@/utils/cn';

interface PriceProps {
  /** Amount in paisa. */
  amount: number;
  locale: Locale;
  /** Struck-through original price, in paisa. Ignored when not higher. */
  compareAt?: number | null;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  /**
   * `accent` spends the brand's one accent on the figure (CRD-3): a product card
   * uses it for the price and its button and nothing else. The struck-through
   * original stays neutral either way, since it is what the price is not.
   */
  tone?: 'default' | 'accent';
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
export function Price({ amount, locale, compareAt, className, size = 'md', tone = 'default' }: PriceProps) {
  const showCompare = typeof compareAt === 'number' && compareAt > amount;

  return (
    <span className={cn('inline-flex items-baseline gap-2', SIZES[size], className)}>
      <span className={cn('font-semibold', tone === 'accent' ? 'text-accent-hover' : 'text-neutral-900')}>
        {formatMoney(amount, locale)}
      </span>
      {showCompare ? (
        <span className="text-sm font-normal text-neutral-400 line-through">
          {formatMoney(compareAt, locale)}
        </span>
      ) : null}
    </span>
  );
}
