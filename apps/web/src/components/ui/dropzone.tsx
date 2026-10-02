'use client';

import { useId, useRef, useState, type ClipboardEvent, type DragEvent, type ReactNode } from 'react';
import { Upload } from 'lucide-react';
import { formatBytes, formatNumber } from '@newax/shared';
import { cn } from '@/utils/cn';
import { TruncateReveal } from '@/components/ui/truncate-reveal';
import {
  acceptAttribute,
  describeLimits,
  partitionFiles,
  refusalMessage,
  type Refusal,
  type UploadRules,
} from '@/lib/upload';

/** The most refusals listed by name; the rest are counted, so dropping 200 wrong files is not a wall of red. */
const MAX_REFUSALS_SHOWN = 5;

/** A drag carries files, not text or a link: the only drag this zone answers. */
function carriesFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files');
}

/**
 * A place to put files: the whole card is the target (UPL-1).
 *
 * One target, three ways in. A file dropped anywhere on the card, the card
 * opened with a click or Enter or Space, and an image pasted while it has focus
 * all start the same checks. The card is a real `<label>` around a visually
 * hidden `<input type="file">`, so the picker, the keyboard and the screen reader
 * are the browser's own and nothing here re-implements a button. The focus ring
 * is drawn on the card (`has-[:focus-visible]`), because the input itself is
 * hidden and its ring would be clipped.
 *
 * It checks before it hands anything on (UPL-3): type, size, emptiness and count
 * against `rules`, the same numbers the server enforces. A file the rules refuse
 * is never passed to `onFiles`; its refusal is listed in a `role="alert"` block
 * under the card, naming the file and what to do (`FLO-7`), and clears on the
 * next drop. The limits are printed inside the card in its resting state
 * (UPL-4), so they are read before anyone has done anything wrong.
 *
 * What it communicates while a drag is over it: the border turns solid, the tint
 * fills, and the words change to "Drop to add". That is three signals, so the
 * state never rests on the colour alone (`COL-2`). Reduced motion loses nothing:
 * the change is a state, and the stylesheet's rule only removes the ease.
 *
 * - `disabled` takes the reason the zone is unavailable (`PRM-2`): the card is
 *   inert and says why, and a zone cannot be disabled without saying so.
 * - `multiple` false means one file: a drop of several takes the first that
 *   passes and refuses the rest ("Choose one file at a time.").
 * - `compact` is one line for a place a card would be too tall (a table row, a
 *   form beside other fields). It keeps the limits.
 * - `selected` is the file the form is holding (for a flow that chooses first
 *   and sends on a later button): it replaces the label, so the zone shows what
 *   it holds and that another drop replaces it.
 * - `queued` is how many files already hold a place, for the count limit.
 *
 * Logical properties throughout, so it mirrors in a right-to-left document, and
 * the card is never under 44px tall (`min-h-touch`).
 */
export function Dropzone({
  rules,
  onFiles,
  onRejected,
  multiple = false,
  label,
  hint,
  disabled,
  compact = false,
  queued = 0,
  selected = null,
  className,
}: {
  rules: UploadRules;
  /** Called with the files that passed the checks, never with one that did not. */
  onFiles: (accepted: File[]) => void;
  /** Called with the refusals of a drop, for a caller that wants to count or log them; the zone lists them itself. */
  onRejected?: (refusals: Refusal<File>[]) => void;
  multiple?: boolean;
  /** What the card says at rest. Defaults to the three ways in. */
  label?: string;
  /** One line of what only this place knows ("Up to 5,000 rows"), printed with the limits. */
  hint?: ReactNode;
  /** Why the zone is unavailable. Its presence disables the zone. */
  disabled?: string;
  compact?: boolean;
  queued?: number;
  selected?: { name: string; size: number } | null;
  className?: string;
}) {
  const ids = useId();
  const labelId = `${ids}-label`;
  const describedBy = `${ids}-limits${hint ? ` ${ids}-hint` : ''}${disabled ? ` ${ids}-disabled` : ''}`;
  const input = useRef<HTMLInputElement>(null);
  // A drag fires enter and leave for every child it crosses; counting them is what keeps the highlight from flickering.
  const depth = useRef(0);
  const [over, setOver] = useState(false);
  const [refusals, setRefusals] = useState<Refusal<File>[]>([]);

  // A single-file zone limits the count itself, so the printed limits and the checks cannot disagree.
  const effective: UploadRules = multiple ? rules : { ...rules, maxFiles: 1 };
  const restingLabel =
    label ?? (multiple ? 'Drop files here, click to choose, or paste' : 'Drop a file here, click to choose, or paste');

  function take(files: File[]) {
    if (disabled || files.length === 0) return;
    const { accepted, refusals: refused } = partitionFiles(files, effective, multiple ? queued : 0);
    // Replaced on every drop, so the last drop's refusals are the only ones on screen.
    setRefusals(refused);
    if (refused.length > 0) onRejected?.(refused);
    if (accepted.length > 0) onFiles(accepted);
  }

  function onDragEnter(event: DragEvent<HTMLLabelElement>) {
    if (!carriesFiles(event)) return;
    event.preventDefault();
    depth.current += 1;
    if (!disabled) setOver(true);
  }

  function onDragOver(event: DragEvent<HTMLLabelElement>) {
    if (!carriesFiles(event)) return;
    // Cancelling the dragover is what makes the card a drop target at all.
    event.preventDefault();
    event.dataTransfer.dropEffect = disabled ? 'none' : 'copy';
  }

  function onDragLeave(event: DragEvent<HTMLLabelElement>) {
    if (!carriesFiles(event)) return;
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setOver(false);
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    if (!carriesFiles(event)) return;
    // Without this the browser opens the file in the tab, taking the operator out of the admin.
    event.preventDefault();
    depth.current = 0;
    setOver(false);
    take(Array.from(event.dataTransfer.files));
  }

  function onPaste(event: ClipboardEvent<HTMLLabelElement>) {
    const files = Array.from(event.clipboardData?.files ?? []);
    // Pasted text is not ours: leave it for whatever else is on the page.
    if (files.length === 0) return;
    event.preventDefault();
    take(files);
  }

  const shown = refusals.slice(0, MAX_REFUSALS_SHOWN);
  const hidden = refusals.length - shown.length;

  return (
    <div className={cn('min-w-0', className)}>
      <label
        data-over={over ? '' : undefined}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onPaste={onPaste}
        className={cn(
          'relative flex min-h-touch min-w-0 cursor-pointer rounded-lg border text-neutral-900 transition-colors duration-normal ease-standard',
          compact
            ? 'items-center gap-3 px-3 py-2 text-start'
            : 'flex-col items-center justify-center gap-1.5 px-4 py-8 text-center',
          // Over: solid, tinted, and (below) different words. At rest: dashed and plain.
          over
            ? 'border-solid border-accent bg-accent/10'
            : 'border-dashed border-neutral-500 bg-surface hover:border-accent',
          // The input is hidden, so its own focus ring is clipped; the card shows the house ring (globals.css `:focus-visible`) for it.
          'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-neutral-50',
          disabled && 'cursor-not-allowed opacity-60 hover:border-neutral-500',
        )}
      >
        <input
          ref={input}
          type="file"
          className="sr-only"
          accept={acceptAttribute(effective) || undefined}
          multiple={multiple}
          disabled={Boolean(disabled)}
          aria-labelledby={labelId}
          aria-describedby={describedBy}
          // UPL-1 promises Enter as well as Space, so Enter is asked for by name. Chromium opens a file input on
          // Enter by itself (12 of 12 fresh pages with the file-chooser listener registered first); this is for the
          // engines that were not measured (Firefox, WebKit). The keydown is the user activation `click()` needs, and
          // `preventDefault` stops an engine that does open it natively from opening twice (0 of 12 doubled here).
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || disabled) return;
            event.preventDefault();
            input.current?.click();
          }}
          onChange={(event) => {
            take(Array.from(event.target.files ?? []));
            // So choosing the same file again still fires `change`.
            event.target.value = '';
          }}
        />
        <Upload aria-hidden="true" className={cn('h-6 w-6 shrink-0', over ? 'text-accent' : 'text-neutral-900/60')} />
        <span className={cn('flex min-w-0 flex-col gap-0.5', compact ? 'items-start' : 'items-center')}>
          {selected ? (
            <span id={labelId} className="flex min-w-0 max-w-full items-baseline gap-2 text-sm font-medium">
              <span className="min-w-0 flex-1">
                <TruncateReveal text={selected.name} />
              </span>
              <span className="shrink-0 text-xs font-normal text-neutral-900/60">{formatBytes(selected.size)}</span>
            </span>
          ) : (
            <span id={labelId} className="text-sm font-medium">
              {over ? 'Drop to add' : restingLabel}
            </span>
          )}
          {selected && !over ? (
            <span className="text-xs text-neutral-900/60">Drop or choose another file to replace it</span>
          ) : null}
          {hint ? (
            <span id={`${ids}-hint`} className="text-xs text-neutral-900/70">
              {hint}
            </span>
          ) : null}
          <span id={`${ids}-limits`} className="text-xs text-neutral-900/60">
            {describeLimits(effective)}
          </span>
          {disabled ? (
            <span id={`${ids}-disabled`} className="text-xs font-medium text-neutral-900/80">
              {disabled}
            </span>
          ) : null}
        </span>
      </label>

      {refusals.length > 0 ? (
        <div role="alert" className="notice notice-error mt-2">
          <ul className="space-y-1">
            {shown.map((refusal, index) => (
              <li key={`${refusal.file.name}-${index}`}>{refusalMessage(refusal)}</li>
            ))}
            {hidden > 0 ? (
              <li>{`${formatNumber(hidden)} more ${hidden === 1 ? 'file was' : 'files were'} refused for the same kinds of reason.`}</li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
