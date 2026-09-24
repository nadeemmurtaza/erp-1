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
}: DataTableProps<Row>) {
  // `loading` wins when the caller passes it. Treating a null `rows` as
  // "still loading" unconditionally would strand the table on "Loading…"
  // forever in the case that matters most: a fetch that FAILED, where the
  // page sets its own error banner and leaves `rows` null with loading
  // already false.
  const isLoading = loading;
  const isEmpty = !isLoading && (rows == null || rows.length === 0);

  return (
    // The scroll container is the point: a wide table on a phone must scroll
    // inside its own box rather than widening the page.
    <div className={cn('w-full overflow-x-auto', className)}>
      <table className="w-full text-sm">
        <thead className="whitespace-nowrap border-b border-neutral-100 bg-neutral-50">
          <tr>
            {columns.map((column, i) => (
              <th
                key={i}
                scope="col"
                className={cn(
                  'px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-neutral-900/60',
                  column.align === 'end' ? 'text-end' : 'text-start',
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>

        <tbody className="divide-y divide-neutral-100">
          {isLoading || isEmpty ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-10 text-center text-sm text-neutral-900/60"
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
                      <tr>
                        <td colSpan={columns.length} className="bg-neutral-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-900/60">
                          {renderGroupHeader(group)}
                        </td>
                      </tr>
                    ) : null}
                    <tr
                      onClick={onRowClick ? () => onRowClick(row) : undefined}
                      className={cn(
                        'transition-colors',
                        onRowClick ? 'cursor-pointer hover:bg-neutral-50' : 'hover:bg-neutral-50/50',
                        selected && 'bg-neutral-50',
                      )}
                    >
                      {columns.map((column, i) => (
                        <td
                          key={i}
                          className={cn(
                            'px-3 py-3',
                            column.align === 'end' ? 'text-end' : 'text-start',
                            column.numeric && 'tabular-nums',
                            column.muted && 'text-neutral-900/70',
                            column.className,
                          )}
                        >
                          {column.cell(row, index)}
                        </td>
                      ))}
                    </tr>
                    {expanded && expandedContent ? (
                      <tr className="bg-neutral-50">
                        <td colSpan={columns.length} className="px-4 py-4">
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
