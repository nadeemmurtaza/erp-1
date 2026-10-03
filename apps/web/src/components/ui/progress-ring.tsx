'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { cn } from '@/utils/cn';
import { ringStroke } from '@/lib/motion';

/**
 * A ring that fills to a fraction, with the figure (or an icon) at its centre.
 *
 * It is for one fraction of one thing the reader is waiting on or working
 * toward — a window running out, a quota used, a step count — where a
 * thin bar would be too wide to sit beside the label. It is not a decoration
 * and not a spinner: a spinner says "working" and carries no quantity; this
 * says how much, and it is a real `progressbar` for a screen reader.
 *
 * The arc draws on once, from empty, over `slow` on the `settle` curve, and
 * eases to each new value. A ring that counts something down (`drawOn={false}`)
 * starts at its value instead: winding up to full and then draining would say
 * two things where there is one. That is CSS (`transition` on `stroke-dashoffset`,
 * which is paint only and touches no layout), so reduced motion collapses it to
 * the finished arc with nothing lost. `value` is clamped to 0–1, so 1.2 draws a
 * full ring rather than wrapping past the start.
 */
export function ProgressRing({
  value,
  size = 40,
  stroke = 4,
  label,
  tone = 'accent',
  drawOn = true,
  className,
  children,
}: {
  /** 0 to 1. */
  value: number;
  /** Outer diameter in px. */
  size?: number;
  /** Ring thickness in px. */
  stroke?: number;
  /** What the ring measures — read by a screen reader with the percentage. */
  label: string;
  tone?: 'accent' | 'warning' | 'negative';
  /** Draw from empty on mount. Off for a countdown, which starts where it is. */
  drawOn?: boolean;
  className?: string;
  /** Centred in the ring. */
  children?: ReactNode;
}) {
  const radius = (size - stroke) / 2;
  const { circumference, offset } = ringStroke(radius, value);

  // Starts empty and draws to `value` one frame after mount; the transition does the rest.
  const [drawn, setDrawn] = useState(!drawOn);
  useEffect(() => {
    if (!drawOn) return;
    const frame = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(frame);
  }, [drawOn]);

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(Math.min(1, Math.max(0, value)) * 100)}
      className={cn('relative inline-flex shrink-0 items-center justify-center', className)}
    >
      {/* The svg is the ring's size: width and height are attributes, so no inline style. A clock starts at twelve and runs clockwise in every language. */}
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-neutral-100"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={drawn ? offset : circumference}
          className={cn(
            'transition-[stroke-dashoffset] duration-slow ease-settle',
            tone === 'accent' && 'stroke-accent',
            tone === 'warning' && 'stroke-amber-700',
            tone === 'negative' && 'stroke-feedback-negative',
          )}
        />
      </svg>
      {children ? (
        <span className="absolute inset-0 flex items-center justify-center text-xs font-medium tabular-nums">
          {children}
        </span>
      ) : null}
    </div>
  );
}
