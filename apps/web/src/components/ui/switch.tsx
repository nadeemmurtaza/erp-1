"use client";

import { useId, type ReactNode } from "react";
import { cn } from "@/utils/cn";

/**
 * An on/off setting that takes effect now.
 *
 * Use it for a setting ("show this column", "email me"), never for a choice
 * that needs a Save: that is a checkbox, because a checkbox says "pending until
 * you submit" and a switch says "already so". It is a button with
 * `role="switch"`, so Space and Enter work, the state is announced, and the
 * label is the whole row's hit target (44 px tall, `touch`).
 *
 * The state is carried three ways, none of them colour alone: the thumb's
 * position, the track fill, and `aria-checked`. The off track is `neutral-400`
 * (3.3:1 against the surface in light, 5.3:1 in dark) and the on track is the
 * accent fill (4.5:1 / 4.0:1), both over the 3:1 floor for a control's state.
 */
export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  className,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  const labelId = useId();
  const descriptionId = useId();

  return (
    <div
      className={cn(
        "flex min-h-touch items-center justify-between gap-4",
        className,
      )}
    >
      <div className="min-w-0">
        <p id={labelId} className="text-sm font-medium text-neutral-900">
          {label}
        </p>
        {description ? (
          <p id={descriptionId} className="text-sm text-neutral-900/70">
            {description}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        aria-describedby={description ? descriptionId : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-fast ease-standard",
          "disabled:cursor-not-allowed disabled:opacity-50",
          checked ? "bg-accent" : "bg-neutral-400",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "inline-block h-5 w-5 rounded-full bg-white shadow-raised transition-transform duration-fast ease-standard",
            checked
              ? "translate-x-[1.375rem] rtl:-translate-x-[1.375rem]"
              : "translate-x-0.5 rtl:-translate-x-0.5",
          )}
        />
      </button>
    </div>
  );
}
