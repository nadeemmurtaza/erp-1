import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/utils/cn';

/**
 * The button, in the two shapes this app actually has.
 *
 * `surface` is not decoration — admin and storefront genuinely differ in
 * shape language (admin: rectangular, `rounded-md`; storefront: pill,
 * `rounded-full`), and that difference is deliberate. What was NOT deliberate
 * was every call site re-deciding padding and disabled styling, so this maps
 * onto the existing `.btn-*` / `.sf-btn-*` classes in globals.css rather than
 * introducing a third set of styles that would drift from both.
 *
 * A plain `<button className="btn-primary">` still works and is not wrong.
 * Reach for this when you want `loading`, or when a component must render the
 * same button on both surfaces.
 */
type Variant = 'primary' | 'secondary' | 'ghost';
type Surface = 'admin' | 'storefront';

const CLASSES: Record<Surface, Record<Variant, string>> = {
  admin: {
    primary: 'btn-primary',
    secondary: 'btn-secondary',
    ghost: 'btn-ghost',
  },
  storefront: {
    primary: 'sf-btn-primary',
    secondary: 'sf-btn-secondary',
    // The storefront has no ghost in globals.css; this is the nearest thing
    // and stays here rather than becoming a fourth global class.
    ghost: 'sf-btn text-neutral-900 hover:bg-neutral-50',
  },
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  surface?: Surface;
  /** Disables the button and swaps the label, so a double-submit is impossible. */
  loading?: boolean;
  loadingLabel?: string;
  children: ReactNode;
}

export function Button({
  variant = 'primary',
  surface = 'admin',
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
      className={cn(CLASSES[surface][variant], className)}
      {...rest}
    >
      {loading ? (loadingLabel ?? 'Working…') : children}
    </button>
  );
}
