'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import type { ThemePreference } from '@newax/shared';
import { useTheme } from '@/hooks/use-theme';
import { cn } from '@/utils/cn';

/**
 * The control that switches theme.
 *
 * Two shapes, one job. `segmented` shows all three choices — light, system,
 * dark — and is for a settings-ish bar (the admin header), where "go back to
 * following my device" has to be reachable. `icon` is a single button that
 * flips between the two themes, for a header with no room (the storefront);
 * the first press makes an explicit choice, and the choice sticks.
 *
 * Every state is a real button with a name, a visible focus ring (inherited
 * from `:focus-visible` in globals.css) and a 44px target below `fold`. The
 * current choice is announced with `aria-pressed`, never by colour alone: the
 * selected segment also gains a filled surface.
 *
 * `labels` exists because the storefront is bilingual and this primitive must
 * not import an i18n layer; admin passes nothing and gets English.
 */
export interface ThemeToggleLabels {
  /** Names the group for a screen reader: "Theme". */
  group: string;
  light: string;
  dark: string;
  system: string;
  /** For the `icon` variant: "Switch to dark theme" / "Switch to light theme". */
  switchToDark: string;
  switchToLight: string;
}

const DEFAULT_LABELS: ThemeToggleLabels = {
  group: 'Theme',
  light: 'Light',
  dark: 'Dark',
  system: 'Match device',
  switchToDark: 'Switch to dark theme',
  switchToLight: 'Switch to light theme',
};

const OPTIONS: { value: ThemePreference; icon: typeof Sun }[] = [
  { value: 'light', icon: Sun },
  { value: 'system', icon: Monitor },
  { value: 'dark', icon: Moon },
];

export function ThemeToggle({
  variant = 'segmented',
  labels = DEFAULT_LABELS,
  className,
}: {
  variant?: 'segmented' | 'icon';
  labels?: ThemeToggleLabels;
  className?: string;
}) {
  const { preference, resolved, setPreference } = useTheme();

  if (variant === 'icon') {
    const toDark = resolved === 'light';
    const Icon = toDark ? Moon : Sun;
    return (
      <button
        type="button"
        onClick={() => setPreference(toDark ? 'dark' : 'light')}
        aria-label={toDark ? labels.switchToDark : labels.switchToLight}
        title={toDark ? labels.switchToDark : labels.switchToLight}
        className={cn(
          'inline-flex h-touch w-touch items-center justify-center rounded text-neutral-500 transition-colors duration-fast',
          'hover:bg-neutral-50 hover:text-neutral-900 fold:h-9 fold:w-9',
          className,
        )}
      >
        <Icon aria-hidden className="h-icon-md w-icon-md" strokeWidth={1.75} />
      </button>
    );
  }

  return (
    // A segmented toggle is a control, not a container, so its outline is
    // allowed by the borders rule — it groups three buttons into one thing.
    <div
      role="group"
      aria-label={labels.group}
      className={cn('inline-flex items-center gap-0.5 rounded border border-neutral-200 p-0.5', className)}
    >
      {OPTIONS.map(({ value, icon: Icon }) => {
        const selected = preference === value;
        const label = labels[value];
        return (
          <button
            key={value}
            type="button"
            onClick={() => setPreference(value)}
            aria-pressed={selected}
            aria-label={label}
            title={label}
            className={cn(
              'inline-flex h-touch w-touch items-center justify-center rounded-sm transition-colors duration-fast fold:h-7 fold:w-7',
              selected
                ? 'bg-neutral-100 text-neutral-900'
                : 'text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900',
            )}
          >
            <Icon aria-hidden className="h-icon-sm w-icon-sm" strokeWidth={1.75} />
          </button>
        );
      })}
    </div>
  );
}
