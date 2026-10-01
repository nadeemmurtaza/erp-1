import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

/**
 * Loading placeholders shaped like what is about to arrive.
 *
 * `.skeleton` (globals.css) is the paint: a quiet tint with a highlight that
 * sweeps across it, still under reduced motion (the sweep stops, the shape
 * stays). These wrap it with the three things a bare `<div class="skeleton">`
 * forgets: the shape names (so a card's skeleton is recognisably that card),
 * the accessible name (`SkeletonRegion` announces "Loading", once, instead of
 * a screen reader walking forty empty boxes), and `aria-hidden` on the boxes.
 *
 * Rules, from the dataviz reference and `04-states.md`:
 * - Match the real layout's boxes, or the page jumps when the data lands.
 * - First load only. A refetch keeps the previous render at reduced opacity;
 *   it never swaps to a skeleton.
 */
const SHAPES = {
  line: "h-3 rounded",
  block: "h-24 rounded-md",
  circle: "h-10 w-10 rounded-full",
  pill: "h-8 w-24 rounded-full",
} as const;

export type SkeletonShape = keyof typeof SHAPES;

export function Skeleton({
  shape = "line",
  className,
}: {
  shape?: SkeletonShape;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn("skeleton", SHAPES[shape], className)}
    />
  );
}

/** `lines` rows of text; the last is shorter, the way a paragraph ends. */
export function SkeletonText({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-2", className)} aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          className={cn(
            "skeleton h-3 rounded",
            i === lines - 1 && lines > 1 ? "w-3/5" : "w-full",
          )}
        />
      ))}
    </div>
  );
}

/** Wraps a skeleton composition: one polite announcement, the boxes hidden from assistive tech. */
export function SkeletonRegion({
  label = "Loading…",
  className,
  children,
}: {
  label?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}
