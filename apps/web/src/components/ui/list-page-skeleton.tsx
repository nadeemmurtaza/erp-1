/**
 * The shape of a list page, before the list page.
 *
 * Every route under `(app)` inherited the SAME group-level `loading.tsx` —
 * shaped like the dashboard — so a table page like Orders flashed four stat
 * cards and a two-column grid before rendering a filter bar and a table.
 * WO-2.7 (docs/implementation/admin-platform/02-admin-shell.md): a route's own skeleton
 * describes the layout that actually arrives. This is that shape for the
 * one layout most admin routes share — `PageHeader` + `FilterBar` + a table
 * — parameterized on how many filters and columns the real page has, so
 * `app/(admin)/admin/(app)/orders/loading.tsx` is one line:
 *
 *   export default function Loading() {
 *     return <ListPageSkeleton filters={2} columns={6} />;
 *   }
 *
 * A page whose layout genuinely differs (a kanban board, a master/detail
 * split) gets its own `loading.tsx` instead of forcing this shape onto it.
 */
export function ListPageSkeleton({
  filters = 2,
  rows = 6,
  columns = 5,
}: {
  /** Filter controls in the bar beneath the header. */
  filters?: number;
  /** Skeleton rows in the table body. */
  rows?: number;
  columns?: number;
}) {
  return (
    <div className="animate-fadeIn">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex-1">
          <div className="skeleton mb-2 h-6 w-40 rounded" />
          <div className="skeleton h-3 w-72 rounded" />
        </div>
        <div className="skeleton h-9 w-28 rounded" />
      </div>

      <div className="mb-6 flex flex-wrap gap-3 border-b border-neutral-100 pb-4">
        {[...Array(filters)].map((_, index) => (
          <div key={index} className="skeleton h-9 w-40 rounded" />
        ))}
      </div>

      <div className="overflow-hidden">
        <div className="mb-3 flex gap-4 border-b border-neutral-100 pb-2.5">
          {[...Array(columns)].map((_, index) => (
            <div key={index} className="skeleton h-2.5 flex-1 rounded" />
          ))}
        </div>
        <div className="stagger space-y-3">
          {[...Array(rows)].map((_, row) => (
            <div key={row} className="flex gap-4">
              {[...Array(columns)].map((_, column) => (
                <div key={column} className="skeleton h-4 flex-1 rounded" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
