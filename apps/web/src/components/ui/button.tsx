import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/utils/cn';

/**
 * The button.
 *
 * There used to be a `surface` prop here, because admin buttons were
 * rectangular and teal while storefront buttons were pills and grey. That
 * split is gone — globals.css has one `.btn-*` family now — so the prop went
 * with it. If you find yourself wanting it back, the answer is a new variant,
 * not a second shape language.
 *
 * A plain `<button className="btn-primary">` still works and is not wrong.
 * Reach for this when you want `loading`, which disables the button and swaps
 * the label so a double-submit is impossible.
 */
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const CLASSES: Record<Variant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  /** Disables the button and swaps the label, so a double-submit is impossible. */
  loading?: boolean;
  loadingLabel?: string;
  children: ReactNode;
}

export function Button({
  variant = 'primary',
  loading = false,
  loadingLabel,
  disabled,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(CLASSES[variant], className)}
      {...rest}
    >
      {loading ? (loadingLabel ?? 'Working…') : children}
    </button>
  );
}
