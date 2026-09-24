import { cn } from '@/utils/cn';

/**
 * The prev/next/page-count block, written out by hand at the foot of every
 * paged list — eight times, each agreeing on the words but drifting on the
 * markup around them. `PaginatedResponse<T>['meta']` already carries
 * everything this needs to render, so a page passes its fetch response
 * straight through instead of unpacking five props of its own.
 *
 * Deliberately server-page, not client-page: this renders the meta the API
 * already computed and asks for the next page on click. It does not slice an
 * in-memory array — that would silently disagree with the server's own count
 * the moment a list is large enough to matter.
 */
export interface PaginationMeta {
  page: number;
  totalPages: number;
  total: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export function Pagination({
  meta,
  onChange,
  itemLabel = 'results',
  className,
}: {
  meta: PaginationMeta;
  onChange: (page: number) => void;
  /** Plural noun for the count, e.g. "products", "orders". */
  itemLabel?: string;
  className?: string;
}) {
  if (meta.totalPages <= 1) return null;

  return (
    <div
      className={cn(
        'flex items-center justify-between border-t border-neutral-100 px-4 py-3 text-sm',
        className,
      )}
    >
      <button
        type="button"
        className="btn-ghost"
        disabled={!meta.hasPrevious}
        onClick={() => onChange(meta.page - 1)}
      >
        Previous
      </button>
      <span className="text-neutral-900/60">
        Page {meta.page} of {meta.totalPages} · {meta.total} {itemLabel}
      </span>
      <button
        type="button"
        className="btn-ghost"
        disabled={!meta.hasNext}
        onClick={() => onChange(meta.page + 1)}
      >
        Next
      </button>
    </div>
  );
}
