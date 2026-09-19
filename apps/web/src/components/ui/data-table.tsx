import type { ReactNode } from 'react';
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
                  'px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-neutral-900/50',
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
                className="px-4 py-10 text-center text-sm text-neutral-900/50"
              >
                {isLoading ? loadingLabel : emptyLabel}
              </td>
            </tr>
          ) : (
            (rows ?? []).map((row, index) => (
              <tr
                key={rowKey(row, index)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  'transition-colors',
                  onRowClick ? 'cursor-pointer hover:bg-neutral-50' : 'hover:bg-neutral-50/50',
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
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
