'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { formatDate } from '@newax/shared';
import { adminFetch } from '@/lib/admin-client';
import {
  defaultFilter,
  describeLoadFailure,
  filterOptions,
  filterParam,
  statusWord,
  type BidderFilter,
  type BidderRow,
  type BidderSummary,
} from '@/lib/auction-bidders';
import { Badge, Button, DataTable, EmptyState, Pagination, Segmented, type PaginationMeta } from '@/components/ui';
import { StatusBadge } from '@/components/common/status-badge';
import { AuctionBidderSheet, type SheetLot } from '@/components/admin/auction-bidder-sheet';

interface BidderPage {
  data: BidderRow[];
  meta: PaginationMeta & { pageSize: number };
}

const PAGE_SIZE = 20;

/**
 * launchpad-apps/234-auction-app.md §8, §11 (WO-234.5) — who has joined this
 * auction and who needs a decision, as the panel behind the "Bidders" figure on
 * the auction page. Opens on the people waiting for a decision when anyone is,
 * and on everyone otherwise; the filter and the page are the server's, so a
 * thousand bidders cost one page of rows. A row opens its sheet; the sheet is
 * where the deciding happens.
 *
 * The panel only mounts when the figure is chosen (the strip renders its detail
 * on demand), so the list is not read for a page that never opens it (Law 7).
 */
export function AuctionBidders({
  auctionId,
  summary,
  lots,
  onChanged,
  onChangeWhoMayBid,
}: {
  auctionId: string;
  /** The page's own counts, read once on load and again after every act. */
  summary: BidderSummary | null;
  lots: readonly SheetLot[];
  /** Tells the page to read the counts again. */
  onChanged: () => void;
  /** Offered in the empty state only when the rule can still be edited (a draft, by someone who may). */
  onChangeWhoMayBid?: () => void;
}) {
  const [filter, setFilter] = useState<BidderFilter>(() => defaultFilter(summary));
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<BidderPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [nextError, setNextError] = useState<string | null>(null);
  const [nextNote, setNextNote] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  /** The newest read wins: a slow answer to an earlier filter or page must not overwrite the one the person is looking at. */
  const latest = useRef(0);

  const base = `/admin/auctions/${auctionId}/bidders`;

  const load = useCallback(async () => {
    const mine = ++latest.current;
    setError(null);
    setLoading(true);
    try {
      const page_ = await adminFetch<BidderPage>(base, { query: { page, pageSize: PAGE_SIZE, filter: filterParam(filter) } });
      if (mine === latest.current) setRows(page_);
    } catch (cause) {
      if (mine === latest.current) setError(describeLoadFailure(cause, 'bidders'));
    } finally {
      if (mine === latest.current) setLoading(false);
    }
  }, [base, filter, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const choose = (next: BidderFilter) => {
    setFilter(next);
    setPage(1);
    setLoading(true); // so the old filter's rows are never read as the new one's empty state for the frame before the read starts
    setNextNote(null);
  };

  const changed = () => {
    onChanged();
    void load();
  };

  /** The next person waiting, after a decision: the first of the queue, which no longer includes the one just decided. */
  const reviewNext = async () => {
    setNextError(null);
    try {
      const queue = await adminFetch<BidderPage>(base, { query: { page: 1, pageSize: 1, filter: 'waiting' } });
      const next = queue.data[0];
      if (next) setReviewing(next.id);
      else {
        // Someone else decided the last one, or the button was offered a moment too soon: say so, rather than closing the sheet on a click that appears to do nothing.
        setReviewing(null);
        setNextNote('Nobody else is waiting. Everyone who joined has been decided.');
      }
    } catch (cause) {
      setNextError(describeLoadFailure(cause, 'next'));
    }
  };

  const close = () => {
    const id = reviewing;
    setReviewing(null);
    // Back to the row's own button, where the person was; it may have moved to another page or filter, in which case there is nothing to return to.
    if (id) requestAnimationFrame(() => root.current?.querySelector<HTMLButtonElement>(`[data-review="${CSS.escape(id)}"]`)?.focus());
  };

  // The three empties are told apart from what the list itself said, not from the counts, which can fail to load on their own.
  const empty = rows?.meta.total === 0 && filter === 'all';

  return (
    <div ref={root} className="grid gap-4">
      <Segmented kind="filter" label="Show bidders" options={filterOptions(summary)} value={filter} onChange={choose} />

      {nextNote ? (
        <p role="status" className="notice notice-info">
          {nextNote}
        </p>
      ) : null}

      {nextError ? (
        <p role="alert" className="notice notice-error">
          {nextError} Open the next bidder from the list yourself.
        </p>
      ) : null}

      {error ? (
        <div role="alert" className="notice notice-error grid gap-2">
          <p>{error}</p>
          <Button variant="secondary" className="justify-self-start" onClick={() => void load()}>
            Try again
          </Button>
        </div>
      ) : !loading && rows && rows.data.length === 0 ? (
        <EmptyState
          title={empty ? 'No one has joined yet' : filter === 'waiting' ? 'Nobody is waiting' : 'No bidders match this filter'}
          description={
            empty
              ? 'Customers appear here when they join from a lot page.'
              : filter === 'waiting'
                ? 'Everyone who joined has been decided.'
                : 'Try another view, or show everyone who joined.'
          }
          action={
            empty ? (
              onChangeWhoMayBid ? (
                <Button variant="secondary" onClick={onChangeWhoMayBid}>
                  Change who may bid
                </Button>
              ) : undefined
            ) : (
              <Button variant="secondary" onClick={() => choose('all')}>
                Show all bidders
              </Button>
            )
          }
        />
      ) : (
        <div aria-busy={loading} className={loading && rows ? 'opacity-60' : undefined}>
          <DataTable
            stacked
            rows={rows?.data}
            rowKey={(bidder) => bidder.id}
            loading={loading && rows === null}
            loadingLabel="Loading bidders"
            columns={[
              {
                header: 'Bidder',
                cell: (bidder) => (
                  <span className="grid gap-0.5 break-words">
                    <span className="font-medium">{bidder.alias}</span>
                    {bidder.person.name ? <span>{bidder.person.name}</span> : null}
                    {bidder.person.email || bidder.person.phone ? (
                      <span className="text-xs text-neutral-900/60">{bidder.person.email ?? bidder.person.phone}</span>
                    ) : null}
                  </span>
                ),
              },
              {
                header: 'Status',
                cell: (bidder) => (
                  <span className="grid justify-items-start gap-1">
                    <StatusBadge status={bidder.status} label={statusWord(bidder.status)} />
                    {bidder.appeal.state === 'WAITING' ? <span className="text-xs text-neutral-900/60">Appeal waiting</span> : null}
                  </span>
                ),
              },
              {
                header: 'Strikes',
                align: 'end',
                numeric: true,
                cell: (bidder) => (
                  <span className="inline-flex items-center gap-2">
                    {bidder.strikes.reviewDue ? <Badge tone="danger">Review due</Badge> : null}
                    {bidder.strikes.inWindow}
                  </span>
                ),
              },
              { header: 'Joined', muted: true, cell: (bidder) => formatDate(bidder.joinedAt) },
              {
                header: '',
                align: 'end',
                cell: (bidder) => (
                  <Button
                    variant="secondary"
                    data-review={bidder.id}
                    aria-label={`Review ${bidder.alias}`}
                    onClick={() => setReviewing(bidder.id)}
                  >
                    Review
                  </Button>
                ),
              },
            ]}
          />
          {rows ? <Pagination
              meta={rows.meta}
              onChange={(next) => {
                setPage(next);
                setLoading(true);
              }}
              itemLabel="bidders"
            /> : null}
        </div>
      )}

      <AuctionBidderSheet
        auctionId={auctionId}
        bidderId={reviewing}
        lots={lots}
        waiting={summary?.waiting ?? 0}
        onClose={close}
        onChanged={changed}
        onReviewNext={() => void reviewNext()}
      />
    </div>
  );
}
