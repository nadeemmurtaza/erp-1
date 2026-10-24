import { Fragment, type ReactNode } from 'react';
import { cn } from '@/utils/cn';

/**
 * The admin's one table.
 *
 * Twenty-six admin screens each built their own `<table>`, and twelve of them
 * declared a local `Th` helper — in three different styles (`px-3 py-3` plain
 * against `px-4 py-2` uppercase), so the column headers on Suppliers did not
 * match the ones on Categories. Empty states were written by hand at each
 * site too, in two paddings and with a different wording every time.
 *
 * A column says how to read a row, not how to style it:
 *
 *   <DataTable
 *     rows={suppliers}
 *     rowKey={(s) => s.id}
 *     columns={[
 *       { header: 'Name', cell: (s) => <Link …>{s.name}</Link> },
 *       { header: 'City', cell: (s) => s.city ?? '—', muted: true },
 *       { header: 'Owed', cell: (s) => formatMoney(s.owed), align: 'end', numeric: true },
 *     ]}
 *   />
 *
 * Deliberately NOT a sorting/pagination engine. These screens fetch a page
 * from the API and render it; putting a client-side sort in here would
 * quietly disagree with the server's ordering on every list that is paged.
 */
export interface DataTableColumn<Row> {
  header: ReactNode;
  cell: (row: Row, index: number) => ReactNode;
  /** Right-align — use for money and counts. */
  align?: 'start' | 'end';
  /** Tabular figures, so digits line up column-wise. */
  numeric?: boolean;
  /** Secondary information: same size, lower contrast. */
  muted?: boolean;
  /** Applied to this column's cells, for width or per-column tweaks. */
  className?: string;
}

interface DataTableProps<Row> {
  rows: Row[] | null | undefined;
  columns: DataTableColumn<Row>[];
  rowKey: (row: Row, index: number) => string;
  /**
   * Whether the first fetch is still in flight. Authoritative: a null `rows`
   * with `loading` false renders the empty state, not a stuck spinner.
   */
  loading?: boolean;
  loadingLabel?: string;
  emptyLabel?: string;
  /** Highlights the row on hover — only set it where the row is clickable. */
  onRowClick?: (row: Row) => void;
  className?: string;
  /**
   * Renders a full-width row beneath a row, when `isRowExpanded` says so —
   * inventory's movement ledger, opened per variant without leaving the list.
   * The expanded state itself stays the caller's (usually "which row's id
   * matches"), same as `onRowClick` — this component renders, it does not
   * own what "expanded" means.
   */
  expandedContent?: (row: Row) => ReactNode;
  isRowExpanded?: (row: Row) => boolean;
  /** Persistent highlight — a master/detail list's currently-open row. */
  isRowSelected?: (row: Row) => boolean;
  /**
   * Rows are naturally grouped (e.g. a permission matrix grouped by
   * category) — a spanning header row renders whenever this key changes
   * between consecutive rows. Rows must already be sorted by group; this
   * does not sort or bucket them itself.
   */
  groupBy?: (row: Row) => string;
  renderGroupHeader?: (groupKey: string) => ReactNode;
  /**
   * Below `md`, each row becomes a card: the first column is its title and
   * every other column a label/value line, so a record list reads on a phone
   * without a sideways scroll. Off by default — `02-layout.md` keeps a
   * scrolling table as the answer where rows are compared against each other,
   * and cards only where a row is read one at a time (a person, an audit
   * entry, an import row). It is the same markup either way: CSS alone
   * re-flows it, so a server-rendered table stays server-rendered.
   */
  stacked?: boolean;
  /**
   * Pins the first column while the rest scroll sideways, so a wide grid never
   * loses the row's name. A soft edge shows where the pinned column ends. Off
   * by default; with `stacked`, it applies from `md`, where the table is a
   * table. The header cell and the row cell share one opaque surface so
   * nothing shows through as they slide under.
   */
  stickyFirst?: boolean;
}

export function DataTable<Row>({
  rows,
  columns,
  rowKey,
  loading = false,
  loadingLabel = 'Loading…',
  emptyLabel = 'Nothing here yet.',
  onRowClick,
  className,
  expandedContent,
  isRowExpanded,
  isRowSelected,
  groupBy,
  renderGroupHeader,
  stacked = false,
  stickyFirst = false,
}: DataTableProps<Row>) {
  // `loading` wins when the caller passes it. Treating a null `rows` as
  // "still loading" unconditionally would strand the table on "Loading…"
  // forever in the case that matters most: a fetch that FAILED, where the
  // page sets its own error banner and leaves `rows` null with loading
  // already false.
  const isLoading = loading;
  const isEmpty = !isLoading && (rows == null || rows.length === 0);

  // Stacked: `display: block` strips table semantics in some browsers, so the
  // roles are restated. Unstacked tables get neither, and render unchanged.
  const role = (name: string) => (stacked ? { role: name } : undefined);
  const block = stacked ? 'max-md:block' : undefined;
  // The pinned column's own classes: the position (from `md` when stacked), the
  // paint that hides what slides under it, and the edge that says it is pinned.
  // Written out in full, twice, because Tailwind only emits classes it can read
  // as whole strings; a `md:` prefix glued on at runtime would not be generated.
  const pinned = stickyFirst
    ? stacked
      ? 'md:sticky md:start-0 md:z-raised md:after:pointer-events-none md:after:absolute md:after:inset-y-0 md:after:start-full md:after:w-3 md:after:bg-gradient-to-r md:after:from-scrim/5 md:after:to-transparent md:rtl:after:bg-gradient-to-l'
      : 'sticky start-0 z-raised after:pointer-events-none after:absolute after:inset-y-0 after:start-full after:w-3 after:bg-gradient-to-r after:from-scrim/5 after:to-transparent rtl:after:bg-gradient-to-l'
    : undefined;

  return (
    // The scroll container is the point: a wide table on a phone must scroll
    // inside its own box rather than widening the page.
    <div className={cn('w-full overflow-x-auto', className)}>
      <table {...role('table')} className={cn('w-full text-sm', block)}>
        <thead
          {...role('rowgroup')}
          className={cn(
            'whitespace-nowrap border-b border-neutral-100 bg-neutral-50',
            stacked && 'max-md:sr-only',
          )}
        >
          <tr {...role('row')}>
            {columns.map((column, i) => (
              <th
                key={i}
                scope="col"
                {...role('columnheader')}
                className={cn(
                  'px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-neutral-900/60',
                  column.align === 'end' ? 'text-end' : 'text-start',
                  i === 0 && pinned,
                  i === 0 && stickyFirst && 'bg-neutral-50',
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>

        <tbody
          {...role('rowgroup')}
          className={cn('divide-y divide-neutral-100', stacked && 'max-md:block max-md:divide-y-0 max-md:space-y-2 max-md:p-2')}
        >
          {isLoading || isEmpty ? (
            <tr {...role('row')} className={block}>
              <td
                colSpan={columns.length}
                {...role('cell')}
                className={cn('px-4 py-10 text-center text-sm text-neutral-900/60', block)}
              >
                {isLoading ? loadingLabel : emptyLabel}
              </td>
            </tr>
          ) : (
            (() => {
              let previousGroup: string | undefined;
              return (rows ?? []).map((row, index) => {
                const expanded = isRowExpanded?.(row) ?? false;
                const selected = isRowSelected?.(row) ?? false;
                const group = groupBy?.(row);
                const showGroupHeader = group !== undefined && group !== previousGroup;
                previousGroup = group;

                return (
                  <Fragment key={rowKey(row, index)}>
                    {showGroupHeader && renderGroupHeader ? (
                      <tr {...role('row')} className={block}>
                        <td colSpan={columns.length} {...role('cell')} className={cn('bg-neutral-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-900/60', block)}>
                          {renderGroupHeader(group)}
                        </td>
                      </tr>
                    ) : null}
                    <tr
                      {...role('row')}
                      onClick={onRowClick ? () => onRowClick(row) : undefined}
                      className={cn(
                        'transition-colors',
                        onRowClick ? 'cursor-pointer hover:bg-neutral-50' : 'hover:bg-neutral-50/50',
                        selected && 'bg-neutral-50',
                        // The card is a raised surface, so it needs no border; a
                        // selected card keeps its tint instead of going back to surface.
                        stacked && 'max-md:block max-md:rounded-md max-md:p-3 max-md:shadow-raised',
                        stacked && !selected && 'max-md:bg-surface',
                        stickyFirst && 'group',
                      )}
                    >
                      {columns.map((column, i) => (
                        <td
                          key={i}
                          {...role('cell')}
                          className={cn(
                            'px-3 py-3',
                            column.align === 'end' ? 'text-end' : 'text-start',
                            column.numeric && 'tabular-nums',
                            column.muted && 'text-neutral-900/70',
                            column.className,
                            stacked &&
                              (i === 0
                                ? 'max-md:block max-md:px-0 max-md:pb-2 max-md:pt-0 max-md:font-semibold'
                                : 'max-md:flex max-md:items-baseline max-md:justify-between max-md:gap-3 max-md:px-0 max-md:py-1'),
                            i === 0 && pinned,
                            i === 0 && stickyFirst && (selected ? 'bg-neutral-50' : 'bg-surface group-hover:bg-neutral-50'),
                          )}
                        >
                          {stacked && i > 0 ? (
                            <>
                              <span className="text-xs font-medium uppercase tracking-wide text-neutral-900/60 md:hidden">
                                {column.header}
                              </span>
                              <span className="md:contents max-md:min-w-0 max-md:text-end">{column.cell(row, index)}</span>
                            </>
                          ) : (
                            column.cell(row, index)
                          )}
                        </td>
                      ))}
                    </tr>
                    {expanded && expandedContent ? (
                      <tr {...role('row')} className={cn('bg-neutral-50', block)}>
                        <td colSpan={columns.length} {...role('cell')} className={cn('px-4 py-4', block)}>
                          {expandedContent(row)}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              });
            })()
          )}
        </tbody>
      </table>
    </div>
  );
}
