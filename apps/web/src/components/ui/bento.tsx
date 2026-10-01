import type { ElementType, ReactNode } from "react";
import { cn } from "@/utils/cn";

/**
 * A bento: one job, shown as a handful of tiles of deliberately different
 * sizes, so the eye finds the one that matters first.
 *
 * It is a grid and nothing more. One column below `md`, two at `md`, four from
 * `xl`; `grid-flow-dense` lets a small tile fill the hole a large one leaves, so
 * the grid never shows a gap. Tiles take their height from their content and
 * from a shared row unit, so a `tall` tile is exactly two rows and a `hero` is
 * two by two. Cap the width where the page is wide (`mx-auto max-w-6xl`):
 * Law 4 wants the width used for more detail, not stretched tiles.
 *
 * Law 3 and Law 7 are what it is for. A page that says "four things matter"
 * and draws them the same size has said nothing; a bento ranks them.
 */
export function Bento({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-flow-dense auto-rows-[minmax(theme(spacing.32),auto)] gap-4 md:grid-cols-2 xl:grid-cols-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

export type BentoSize = "sm" | "wide" | "tall" | "hero";
export type BentoTone = "surface" | "quiet" | "accent" | "inverse";

/** Spans apply from `md` up; below it every tile is one cell in one column. */
const SIZES: Record<BentoSize, string> = {
  sm: "",
  wide: "md:col-span-2",
  tall: "md:row-span-2",
  hero: "md:col-span-2 md:row-span-2",
};

/**
 * Depth is the boundary, never a border (`ui.md`): the default tile is a
 * raised surface, `quiet` is a tint with no shadow, and the two loud tones are
 * fills whose label is the paired token, so each holds its contrast in both
 * themes (`accent` is the fixed brand fill with a white label; `inverse` is the
 * strongest fill with its own label colour). Use a loud tone once per bento.
 */
const TONES: Record<BentoTone, string> = {
  surface: "bg-surface text-neutral-900 shadow-raised",
  quiet: "bg-neutral-100 text-neutral-900",
  accent: "bg-accent text-white",
  inverse: "bg-inverse text-on-inverse",
};

export function BentoTile({
  size = "sm",
  tone = "surface",
  title,
  as: Tag = "section",
  className,
  children,
}: {
  size?: BentoSize;
  tone?: BentoTone;
  /** The tile's one line of context. Optional: a hero can carry its own heading. */
  title?: ReactNode;
  as?: ElementType;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tag
      className={cn(
        "flex min-w-0 flex-col gap-3 rounded-lg p-5",
        TONES[tone],
        SIZES[size],
        className,
      )}
    >
      {title ? (
        <h3
          className={cn(
            "eyebrow",
            tone === "accent" && "text-white/80",
            tone === "inverse" && "text-on-inverse/70",
          )}
        >
          {title}
        </h3>
      ) : null}
      <div className="min-h-0 flex-1">{children}</div>
    </Tag>
  );
}
