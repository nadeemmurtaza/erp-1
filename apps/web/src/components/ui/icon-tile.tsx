import type { ComponentType, SVGProps } from 'react';
import { cn } from '@/utils/cn';
import type { ToneName } from '@/lib/tone';

type Glyph = ComponentType<SVGProps<SVGSVGElement>>;

const SIZES = {
  sm: { tile: 'icon-tile-sm', glyph: 'h-icon-sm w-icon-sm' },
  md: { tile: '', glyph: 'h-icon-md w-icon-md' },
  lg: { tile: 'icon-tile-lg', glyph: 'h-icon-lg w-icon-lg' },
  xl: { tile: 'icon-tile-xl', glyph: 'h-icon-lg w-icon-lg' },
} as const;

/**
 * An icon on its own tinted tile, in one of the brand's seven tones (ADR-083, twelfth addendum).
 *
 * What it communicates: which kind of thing this is, before anyone reads the label. A sidebar of
 * thirteen groups, a launchpad of twelve apps and a page header each get the colour of the thing
 * they belong to, so the eye can find "the money one" or "the people one" by hue. The tone is
 * chosen by the caller from `lib/tone.ts`, never by the glyph: the same glyph in two places is the
 * same colour in both.
 *
 * It is decoration for sighted people and nothing for everyone else: it is `aria-hidden`, and it
 * never stands alone. The label is always beside it, in text. It is not a button and not a status:
 * a status is a `Badge`, and a tone never means good or bad (that is `feedback`). It lifts, leans and
 * glows when the card, link or row that holds it is hovered or focused (`.lift` or `.group`), and not
 * when it is hovered on its own, because it does nothing on its own.
 *
 * The glyph reaches 3:1 on its own wash in both themes (`theme-contrast.spec.ts`), so a person with
 * low vision still sees the shape; the colour is a cue and never the only one.
 */
export function IconTile({
  icon: Icon,
  tone = 'teal',
  size = 'md',
  className,
}: {
  icon: Glyph;
  tone?: ToneName;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const { tile, glyph } = SIZES[size];
  return (
    <span data-tone={tone} aria-hidden="true" className={cn('icon-tile', tile, className)}>
      <Icon className={glyph} aria-hidden="true" />
    </span>
  );
}
