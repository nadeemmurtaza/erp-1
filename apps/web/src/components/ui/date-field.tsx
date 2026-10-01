'use client';

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type InputHTMLAttributes,
  type KeyboardEvent,
} from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  DEFAULT_LOCALE,
  SHOP_TIME_ZONE,
  formatDate,
  formatMonthShort,
  formatNumber,
  formatWeekdayShort,
  intlTag,
  type Locale,
} from '@newax/shared';
import { usePopover, type PopoverCloseReason } from '@/hooks/use-popover';
import {
  YEAR_PAGE_SIZE,
  addDays,
  addMonths,
  clampIso,
  dateOrderFor,
  daysInMonth,
  inRange,
  isoInZone,
  monthGrid,
  navigate,
  parseIso,
  toIso,
  weekStartFor,
  weekdayOrder,
  yearPage,
  yearPageStart,
} from '@/lib/calendar';
import { parseDateInput } from '@/lib/date-parse';
import { cn } from '@/utils/cn';

type AriaProps = Pick<
  InputHTMLAttributes<HTMLInputElement>,
  'aria-label' | 'aria-labelledby' | 'aria-describedby' | 'aria-invalid'
>;

export interface DateFieldProps extends AriaProps {
  /** An ISO day, "YYYY-MM-DD", or '' for none: the same value a native date input holds. */
  value: string;
  /** Called with an ISO day, or '' when the field is cleared. Never with half-typed text. */
  onChange: (iso: string) => void;
  /** Earliest and latest day, ISO, both inclusive. */
  min?: string;
  max?: string;
  required?: boolean;
  disabled?: boolean;
  id?: string;
  /** Posts the ISO value with a form, as a native date input did. */
  name?: string;
  placeholder?: string;
  className?: string;
  /** Reads and writes dates in this locale. Defaults to the deployment's. */
  locale?: Locale;
}

/** A Sunday, to read weekday names from the shared formatter without a hand-written table. */
const SUNDAY_PROBE = '2006-01-01';

const asDate = (iso: string) => new Date(`${iso}T00:00:00Z`);

/**
 * A date is a text field first (MNU-2, `ACT-5`): it reads what a person types
 * (`2026-10-03`, `3/10/2026`, `3 Oct`, `today`, `+7d`), shows the date it
 * understood in the locale's own format BEFORE committing, and offers a calendar
 * with a month and year jump for people who point.
 *
 * The contract is the native date input's: `value` is an ISO day or '', `onChange`
 * receives an ISO day, so a page swaps `type="date"` for this and keeps its state.
 *
 *   - Typing is a draft. It commits on blur and on Enter, through `parseDateInput`;
 *     until then the live line under the field says what it would become, in
 *     words (`aria-live="polite"`). The page never sees half-typed text.
 *   - What cannot be read is kept, not wiped: the text stays, the field is
 *     `aria-invalid`, the reason (what to type instead) sits next to it, and
 *     `setCustomValidity` blocks a form submit with the same words, so a required
 *     form cannot send garbage.
 *   - Enter commits a changed draft and does NOT submit the form; pressing it again
 *     does. A first Enter that did both would submit before the page had the date.
 *   - Escape drops the draft and shows the saved date again.
 *   - The calendar is a popover (MNU-4: top layer, flips when short on room). Arrows
 *     move by day and week, PageUp/PageDown by month, Shift with them by year, Home
 *     and End to the week's edges. The month and the year in its header are buttons
 *     that open a month grid and a year grid.
 *
 * "Today" is read from the clock in the shop's time zone only when needed (a typed
 * word like `tomorrow`, or the calendar opening), never while rendering a stored
 * value, so server and client render the same markup.
 */
export function DateField({
  value,
  onChange,
  min,
  max,
  required,
  disabled,
  id,
  name,
  placeholder = 'e.g. 3 Oct, +7d',
  className,
  locale = DEFAULT_LOCALE,
  ...aria
}: DateFieldProps) {
  const tag = intlTag(locale);
  const order = dateOrderFor(tag);
  const weekStart = weekStartFor(tag);
  const fmt = (iso: string) => (parseIso(iso) ? formatDate(asDate(iso), locale, 'UTC') : iso);
  const today = () => isoInZone(new Date(), SHOP_TIME_ZONE, tag);

  const hintId = useId();
  const input = useRef<HTMLInputElement>(null);
  const row = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  // The draft belongs to the value it was typed over: if the page changes `value` underneath it, the draft is stale and ignored.
  const [draft, setDraft] = useState<{ text: string; base: string; failed: boolean } | null>(null);
  const live = draft && draft.base === value ? draft : null;
  const text = live ? live.text : value ? fmt(value) : '';

  const typed = live ? live.text.trim() : '';
  const options = { order, min, max, format: fmt };
  const parsed = typed ? parseDateInput(typed, { ...options, today: today() }) : null;

  // Why a submit must be blocked, in the words the field would show: unreadable text, or a stored value outside the range.
  const stored =
    !live && value && !inRange(value, min, max) ? parseDateInput(value, { ...options, today: value }) : null;
  const problem = parsed && !parsed.ok ? parsed.reason : stored && !stored.ok ? stored.reason : '';
  useEffect(() => {
    input.current?.setCustomValidity(problem);
  }, [problem]);

  const commit = () => {
    if (!live) return;
    if (!typed) {
      setDraft(null);
      if (value !== '') onChange('');
      return;
    }
    if (parsed?.ok) {
      setDraft(null);
      if (parsed.iso !== value) onChange(parsed.iso);
    } else {
      setDraft({ ...live, failed: true });
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && live) {
      event.preventDefault();
      commit();
    } else if (event.key === 'Escape' && live) {
      event.preventDefault();
      event.stopPropagation();
      setDraft(null);
    } else if (event.key === 'ArrowDown' && !disabled) {
      event.preventDefault();
      setOpen(true);
    }
  };

  const hint =
    live?.failed && parsed && !parsed.ok ? (
      <span className="text-feedback-negative">{parsed.reason}</span>
    ) : parsed?.ok ? (
      <>Understood: {fmt(parsed.iso)}</>
    ) : null;
  const invalid =
    Boolean(live?.failed && parsed && !parsed.ok) || aria['aria-invalid'] === true || aria['aria-invalid'] === 'true';

  return (
    <div className={cn('relative min-w-0', className)}>
      <div ref={row} className="flex items-stretch gap-2">
        <input
          ref={input}
          id={id}
          type="text"
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          value={text}
          aria-label={aria['aria-label']}
          aria-labelledby={aria['aria-labelledby']}
          aria-describedby={[aria['aria-describedby'], hintId].filter(Boolean).join(' ')}
          aria-invalid={invalid || undefined}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => setDraft({ text: event.target.value, base: value, failed: false })}
          onBlur={commit}
          onKeyDown={onKeyDown}
          className="field-input min-w-0 flex-1"
        />
        <button
          ref={button}
          type="button"
          disabled={disabled}
          aria-label="Choose a date"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen((was) => !was)}
          className="inline-flex w-touch shrink-0 items-center justify-center rounded text-neutral-900/70 transition-colors hover:bg-neutral-50 hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <CalendarDays aria-hidden="true" className="h-icon-md w-icon-md" />
        </button>
      </div>
      {/* Always mounted so a screen reader has a live region to announce into; empty, it takes no height. */}
      <p id={hintId} aria-live="polite" className="mt-1 text-sm text-neutral-900/70 empty:mt-0">
        {hint}
      </p>
      {name ? <input type="hidden" name={name} value={value} disabled={disabled} /> : null}
      {open ? (
        <CalendarPopover
          trigger={button}
          anchor={row}
          value={value}
          min={min}
          max={max}
          today={today()}
          weekStart={weekStart}
          locale={locale}
          format={fmt}
          allowClear={!required}
          onPick={(iso) => {
            setDraft(null);
            if (iso !== value) onChange(iso);
          }}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}

/** "October 2026", for naming the grid. The shared formatters have month-short and a medium date, not this. */
function monthYearLabel(y: number, m: number, locale: Locale): string {
  return new Intl.DateTimeFormat(intlTag(locale), { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, 1)),
  );
}

/** A year, as the locale writes it, with no thousands separator ("2026", never "2,026"). */
function yearLabel(y: number, locale: Locale): string {
  return new Intl.DateTimeFormat(intlTag(locale), { year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, 0, 1)),
  );
}

type View = 'days' | 'months' | 'years';

const NAV_BUTTON =
  'inline-flex min-h-touch min-w-touch items-center justify-center rounded text-neutral-900/70 transition-colors hover:bg-neutral-50 hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-40 fold:min-h-9 fold:min-w-9';
const HEAD_BUTTON =
  'inline-flex min-h-touch items-center rounded px-2 text-sm font-semibold text-neutral-900 transition-colors hover:bg-neutral-50 fold:min-h-9';
const GRID_BUTTON =
  'inline-flex min-h-touch items-center justify-center rounded text-sm transition-colors fold:min-h-9 aria-disabled:cursor-not-allowed aria-disabled:text-neutral-900/40 aria-disabled:line-through';

function CalendarPopover({
  trigger,
  anchor,
  value,
  min,
  max,
  today,
  weekStart,
  locale,
  format,
  allowClear,
  onPick,
  onClose,
}: {
  trigger: React.RefObject<HTMLElement | null>;
  anchor: React.RefObject<HTMLElement | null>;
  value: string;
  min?: string;
  max?: string;
  today: string;
  weekStart: number;
  locale: Locale;
  format: (iso: string) => string;
  allowClear: boolean;
  onPick: (iso: string) => void;
  onClose: (reason: PopoverCloseReason) => void;
}) {
  const { popoverProps, layer, close } = usePopover({ trigger, anchor, matchWidth: false, onClose });
  const grid = useRef<HTMLDivElement>(null);
  // Whether the next change of day should move keyboard focus with it. Paging with the header arrows must not.
  const wantFocus = useRef(true);
  const [cursor, setCursor] = useState(() => clampIso(parseIso(value) ? value : today, min, max));
  const [view, setView] = useState<View>('days');
  const [pageStart, setPageStart] = useState(() => yearPageStart(Number(cursor.slice(0, 4))));
  const rtl = typeof document !== 'undefined' && document.documentElement.dir === 'rtl';

  const { y, m, d } = parseIso(cursor)!;

  useLayoutEffect(() => {
    if (view !== 'days' || !wantFocus.current) return;
    grid.current?.querySelector<HTMLElement>(`[data-iso="${cursor}"]`)?.focus({ preventScroll: true });
  }, [cursor, view]);

  const go = (iso: string, focus: boolean) => {
    wantFocus.current = focus;
    setCursor(clampIso(iso, min, max));
  };

  const pick = (iso: string) => {
    if (!inRange(iso, min, max)) return;
    onPick(iso);
    close('pick');
  };

  const onGridKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const next = navigate(cursor, event.key, { weekStart, rtl, shift: event.shiftKey, min, max });
    if (next === null) return;
    event.preventDefault();
    go(next, true);
  };

  const monthDisabled = (month: number) => {
    const first = toIso(y, month, 1);
    const last = toIso(y, month, daysInMonth(y, month));
    return Boolean((min && last < min) || (max && first > max));
  };
  const yearDisabled = (year: number) => Boolean((min && `${year}-12-31` < min) || (max && `${year}-01-01` > max));

  const prevMonth = addMonths(toIso(y, m, 1), -1);
  const nextMonth = addMonths(toIso(y, m, 1), 1);
  const prevBlocked = Boolean(min && addDays(toIso(y, m, 1), -1) < min);
  const nextBlocked = Boolean(max && nextMonth > max);

  const weekdays = weekdayOrder(weekStart).map((w) =>
    formatWeekdayShort(asDate(addDays(SUNDAY_PROBE, w)), locale, 'UTC'),
  );
  const flip = 'rtl:rotate-180';

  return layer(
    // The dialog role is on the panel, so Escape is handled here as `Dialog` does (APG puts it on the container).
    <div
      {...popoverProps}
      role="dialog"
      aria-label="Choose a date"
      className="fixed z-dropdown m-0 w-[min(21rem,var(--popover-max-width,21rem))] max-h-[var(--popover-max-height,32rem)] overflow-y-auto overscroll-contain rounded bg-overlay p-2 text-neutral-900 shadow-overlay arrive-from"
    >
      <div className="flex items-center justify-between gap-1">
        {view === 'days' ? (
          <button
            type="button"
            aria-label="Previous month"
            disabled={prevBlocked}
            onClick={() => go(prevMonth, false)}
            className={NAV_BUTTON}
          >
            <ChevronLeft aria-hidden="true" className={cn('h-icon-md w-icon-md', flip)} />
          </button>
        ) : view === 'years' ? (
          <button
            type="button"
            aria-label="Earlier years"
            onClick={() => setPageStart(pageStart - YEAR_PAGE_SIZE)}
            className={NAV_BUTTON}
          >
            <ChevronLeft aria-hidden="true" className={cn('h-icon-md w-icon-md', flip)} />
          </button>
        ) : (
          <span className="min-w-touch" />
        )}
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-expanded={view === 'months'}
            aria-label={`Month, ${monthYearLabel(y, m, locale)}. Choose another month`}
            onClick={() => setView(view === 'months' ? 'days' : 'months')}
            className={HEAD_BUTTON}
          >
            {formatMonthShort(new Date(Date.UTC(y, m - 1, 1)), locale, 'UTC')}
          </button>
          <button
            type="button"
            aria-expanded={view === 'years'}
            aria-label={`Year, ${yearLabel(y, locale)}. Choose another year`}
            onClick={() => {
              setPageStart(yearPageStart(y));
              setView(view === 'years' ? 'days' : 'years');
            }}
            className={HEAD_BUTTON}
          >
            {yearLabel(y, locale)}
          </button>
        </div>
        {view === 'days' ? (
          <button
            type="button"
            aria-label="Next month"
            disabled={nextBlocked}
            onClick={() => go(nextMonth, false)}
            className={NAV_BUTTON}
          >
            <ChevronRight aria-hidden="true" className={cn('h-icon-md w-icon-md', flip)} />
          </button>
        ) : view === 'years' ? (
          <button
            type="button"
            aria-label="Later years"
            onClick={() => setPageStart(pageStart + YEAR_PAGE_SIZE)}
            className={NAV_BUTTON}
          >
            <ChevronRight aria-hidden="true" className={cn('h-icon-md w-icon-md', flip)} />
          </button>
        ) : (
          <span className="min-w-touch" />
        )}
      </div>

      {view === 'days' ? (
        // The grid takes the arrow keys; every key reaches it by bubbling from the focused day.
        <div
          ref={grid}
          role="grid"
          aria-label={monthYearLabel(y, m, locale)}
          tabIndex={-1}
          onKeyDown={onGridKeyDown}
          className="mt-1 outline-none"
        >
          <div role="row" className="grid grid-cols-7">
            {weekdays.map((name, i) => (
              <span key={i} role="columnheader" className="py-1 text-center text-xs font-medium text-neutral-900/70">
                {name}
              </span>
            ))}
          </div>
          {monthGrid(y, m, weekStart).map((week) => (
            <div key={week[0]!.iso} role="row" className="grid grid-cols-7">
              {week.map((cell) => {
                const selected = cell.iso === value;
                const blocked = !inRange(cell.iso, min, max);
                return (
                  <button
                    key={cell.iso}
                    type="button"
                    role="gridcell"
                    data-iso={cell.iso}
                    tabIndex={cell.iso === cursor ? 0 : -1}
                    aria-label={format(cell.iso)}
                    aria-selected={selected}
                    aria-current={cell.iso === today ? 'date' : undefined}
                    aria-disabled={blocked || undefined}
                    onClick={() => pick(cell.iso)}
                    className={cn(
                      GRID_BUTTON,
                      selected
                        ? 'bg-accent font-medium text-white'
                        : cell.inMonth
                          ? 'text-neutral-900 hover:bg-neutral-50'
                          : 'text-neutral-900/60 hover:bg-neutral-50',
                      cell.iso === today && !selected && 'ring-1 ring-inset ring-neutral-400',
                    )}
                  >
                    {formatNumber(cell.day, locale)}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      ) : view === 'months' ? (
        <div role="group" aria-label="Months" className="mt-1 grid grid-cols-3 gap-1">
          {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
            <button
              key={month}
              type="button"
              aria-pressed={month === m}
              aria-disabled={monthDisabled(month) || undefined}
              onClick={() => {
                if (monthDisabled(month)) return;
                wantFocus.current = true;
                setCursor(clampIso(toIso(y, month, Math.min(d, daysInMonth(y, month))), min, max));
                setView('days');
              }}
              className={cn(
                GRID_BUTTON,
                month === m ? 'bg-accent font-medium text-white' : 'text-neutral-900 hover:bg-neutral-50',
              )}
            >
              {formatMonthShort(new Date(Date.UTC(y, month - 1, 1)), locale, 'UTC')}
            </button>
          ))}
        </div>
      ) : (
        <div role="group" aria-label="Years" className="mt-1 grid grid-cols-3 gap-1">
          {yearPage(pageStart).map((year) => (
            <button
              key={year}
              type="button"
              aria-pressed={year === y}
              aria-disabled={yearDisabled(year) || undefined}
              onClick={() => {
                if (yearDisabled(year)) return;
                setCursor(clampIso(toIso(year, m, Math.min(d, daysInMonth(year, m))), min, max));
                // A year chosen, the month is the next question: the jump is year, month, then day.
                setView('months');
              }}
              className={cn(
                GRID_BUTTON,
                year === y ? 'bg-accent font-medium text-white' : 'text-neutral-900 hover:bg-neutral-50',
              )}
            >
              {yearLabel(year, locale)}
            </button>
          ))}
        </div>
      )}

      <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-neutral-100 pt-2">
        <button
          type="button"
          aria-disabled={!inRange(today, min, max) || undefined}
          title={inRange(today, min, max) ? undefined : `Today, ${format(today)}, is outside the dates you can choose`}
          onClick={() => pick(today)}
          className="btn btn-ghost"
        >
          Today
        </button>
        {allowClear && value ? (
          <button
            type="button"
            onClick={() => {
              onPick('');
              close('pick');
            }}
            className="btn btn-ghost"
          >
            Clear
          </button>
        ) : null}
      </div>
      {min || max ? (
        <p className="mt-1 text-sm text-neutral-900/70">
          {min && max
            ? `You can choose from ${format(min)} to ${format(max)}.`
            : min
              ? `You can choose ${format(min)} or later.`
              : `You can choose ${format(max!)} or earlier.`}
        </p>
      ) : null}
    </div>,
  );
}
