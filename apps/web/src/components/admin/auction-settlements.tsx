'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { formatDateTime, formatMoney } from '@newax/shared';
import { adminFetch } from '@/lib/admin-client';
import {
  MAX_CANCEL_REASON_LENGTH,
  amountBreakdown,
  defaultSettlementFilter,
  describeSettlementFailure,
  describeSettlementLoadFailure,
  leftToPay,
  offerNextConsequence,
  receivedAfterEnd,
  settlementActLabel,
  settlementActs,
  settlementFilterOptions,
  settlementStatusWord,
  settlementSuccess,
  settlementTone,
  type SettlementAct,
  type SettlementFilter,
  type SettlementRow,
  type SettlementSummary,
} from '@/lib/auction-settlements';
import { Badge, Button, ConfirmDialog, DataTable, Dialog, EmptyState, Field, FormStack, Pagination, Segmented, type PaginationMeta } from '@/components/ui';
import Link from 'next/link';
import { ROUTES } from '@/constants/routes';
import { useAdminSession } from '@/components/admin/session';

interface SettlementPage {
  data: SettlementRow[];
  meta: PaginationMeta & { pageSize: number };
}

const PAGE_SIZE = 20;

/**
 * launchpad-apps/234-auction-app.md §9, §11 (WO-234.6) — what this auction's
 * winners owe, as the panel behind the "Winners" figure on the auction page.
 * Opens on what is still owed or needs fixing when anything does, and on the
 * history otherwise; the filter and the page are the server's, so a thousand wins
 * cost one page of rows. Each row says what is owed and by when, and offers only
 * the acts its state allows: try the invoice again, cancel the win with a reason
 * and no strike, or offer the lot to the next bidder. The server decides again
 * from the state the screen was looking at.
 *
 * The panel only mounts when the figure is chosen (the strip renders its detail
 * on demand), so nothing is read for a page that never opens it (Law 7).
 */
export function AuctionSettlements({
  auctionId,
  summary,
  onChanged,
}: {
  auctionId: string;
  /** The page's own counts, read once on load and again after every act. */
  summary: SettlementSummary | null;
  /** Tells the page to read the counts, and the auction's status, again. */
  onChanged: () => void;
}) {
  const { can } = useAdminSession();
  const canSeeOrders = can('orders.manage');
  const [filter, setFilter] = useState<SettlementFilter>(() => defaultSettlementFilter(summary));
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<SettlementPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [cancelling, setCancelling] = useState<SettlementRow | null>(null);
  const [offering, setOffering] = useState<SettlementRow | null>(null);
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  /** The newest read wins: a slow answer to an earlier filter or page must not overwrite the one the person is looking at. */
  const latest = useRef(0);

  const base = `/admin/auctions/${auctionId}/settlements`;

  const load = useCallback(async () => {
    const mine = ++latest.current;
    setError(null);
    setLoading(true);
    try {
      const read = await adminFetch<SettlementPage>(base, { query: { page, pageSize: PAGE_SIZE, filter } });
      if (mine === latest.current) setRows(read);
    } catch (cause) {
      if (mine === latest.current) setError(describeSettlementLoadFailure(cause));
    } finally {
      if (mine === latest.current) setLoading(false);
    }
  }, [base, filter, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const choose = (next: SettlementFilter) => {
    setFilter(next);
    setPage(1);
    setLoading(true); // so the old filter's rows are never read as the new one's empty state for the frame before the read starts
    setOutcome(null);
  };

  /** Runs one act on one win and says what happened to which lot. A refusal is told where the person is looking and the list is read again, because it usually means the win has moved. */
  const act = async (kind: SettlementAct, row: SettlementRow, body?: object): Promise<boolean> => {
    const path = kind === 'replay' ? 'replay' : kind === 'cancel' ? 'cancel' : 'offer-next';
    setBusyId(row.id);
    setOutcome(null);
    try {
      const after = await adminFetch<SettlementRow>(`${base}/${row.id}/${path}`, { method: 'POST', body: body ?? {} });
      setOutcome({ tone: 'success', text: settlementSuccess(kind, after) });
      onChanged();
      void load();
      return true;
    } catch (cause) {
      const text = describeSettlementFailure(cause, row.lot.lotNo);
      setOutcome({ tone: 'error', text });
      setFormError(text);
      void load();
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const openCancel = (row: SettlementRow) => {
    setReason('');
    setFormError(null);
    setCancelling(row);
  };

  const empty = rows?.meta.total === 0 && filter === 'all';

  return (
    <div className="grid gap-4">
      <Segmented kind="filter" label="Show wins" options={settlementFilterOptions(summary)} value={filter} onChange={choose} />

      {outcome ? (
        <p role={outcome.tone === 'error' ? 'alert' : 'status'} className={outcome.tone === 'error' ? 'notice notice-error' : 'notice notice-success'}>
          {outcome.text}
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
          title={empty ? 'Nothing is owed yet' : filter === 'open' ? 'Nothing is waiting on a winner' : 'No wins match this filter'}
          description={
            empty
              ? 'A lot that closes with its reserve met appears here with what its winner owes.'
              : filter === 'open'
                ? 'Every win is paid or has ended.'
                : 'Try another view, or show every win.'
          }
          action={
            empty ? undefined : (
              <Button variant="secondary" onClick={() => choose('all')}>
                Show all wins
              </Button>
            )
          }
        />
      ) : (
        <div aria-busy={loading} className={loading && rows ? 'opacity-60' : undefined}>
          <DataTable
            stacked
            rows={rows?.data}
            rowKey={(row) => row.id}
            loading={loading && rows === null}
            loadingLabel="Loading wins"
            columns={[
              {
                header: 'Lot',
                cell: (row) => (
                  <span className="grid gap-0.5 break-words">
                    <span className="font-medium">
                      Lot {row.lot.lotNo}
                      {row.attempt > 1 ? <span className="font-normal text-neutral-900/60"> · offer {row.attempt}</span> : null}
                    </span>
                    <span className="text-xs text-neutral-900/60">{row.lot.title}</span>
                  </span>
                ),
              },
              { header: 'Winner', cell: (row) => row.bidder.alias },
              {
                header: 'Owes',
                align: 'end',
                numeric: true,
                cell: (row) => (
                  <span className="grid justify-items-end gap-0.5">
                    <span className="font-medium">{formatMoney(row.totalMinor)}</span>
                    <span className="text-xs text-neutral-900/60">{amountBreakdown(row)}</span>
                    {leftToPay(row) !== null ? <span className="text-xs text-neutral-900/60">{formatMoney(leftToPay(row) ?? 0)} left</span> : null}
                  </span>
                ),
              },
              {
                header: 'Status',
                cell: (row) => (
                  <span className="grid justify-items-start gap-1 break-words">
                    <Badge tone={settlementTone(row.status)}>{settlementStatusWord(row.status)}</Badge>
                    {row.status === 'AWAITING_PAYMENT' ? <span className="text-xs text-neutral-900/60">Due {formatDateTime(row.dueAt)}</span> : null}
                    {row.status === 'EXPIRED' ? (
                      <span className="text-xs text-neutral-900/60">{row.struck ? 'Strike recorded' : 'No strike recorded'}</span>
                    ) : null}
                    {row.status === 'CANCELLED' && row.resolutionNote ? <span dir="auto" className="text-xs text-neutral-900/60">{row.resolutionNote}</span> : null}
                    {row.failureReason ? (
                      <span dir="auto" className="text-xs text-feedback-negative">
                        {row.failureReason}
                      </span>
                    ) : null}
                    {receivedAfterEnd(row) ? (
                      <span className="text-xs text-amber-700">{formatMoney(row.paidMinor)} received after it ended. Refund it or honour the sale.</span>
                    ) : null}
                    {row.orderNumber ? (
                      canSeeOrders && row.orderId ? (
                        <Link href={ROUTES.admin.order(row.orderId)} className="inline-flex min-h-touch items-center text-xs font-medium text-accent-hover hover:underline fold:min-h-0">
                          Order {row.orderNumber}
                        </Link>
                      ) : (
                        <span className="text-xs text-neutral-900/60">Order {row.orderNumber}</span>
                      )
                    ) : null}
                  </span>
                ),
              },
              {
                header: '',
                align: 'end',
                cell: (row) => {
                  const acts = settlementActs(row);
                  if (acts.length === 0) return null;
                  return (
                    <span className="flex flex-wrap justify-end gap-2">
                      {acts.map((kind) => (
                        <Button
                          key={kind}
                          variant="secondary"
                          disabled={busyId !== null}
                          loading={busyId === row.id && kind === 'replay'}
                          loadingLabel="Trying…"
                          aria-label={settlementActLabel(kind, row)}
                          onClick={() => {
                            if (kind === 'replay') void act('replay', row);
                            else if (kind === 'cancel') openCancel(row);
                            else {
                              setFormError(null);
                              setOffering(row);
                            }
                          }}
                        >
                          {kind === 'replay' ? 'Try invoice again' : kind === 'cancel' ? 'Cancel win' : 'Offer to next'}
                        </Button>
                      ))}
                    </span>
                  );
                },
              },
            ]}
          />
          {rows ? (
            <Pagination
              meta={rows.meta}
              onChange={(next) => {
                setPage(next);
                setLoading(true);
              }}
              itemLabel="wins"
            />
          ) : null}
        </div>
      )}

      <Dialog open={cancelling !== null} onClose={busyId ? () => {} : () => setCancelling(null)} title={cancelling ? `Cancel the win of lot ${cancelling.lot.lotNo}` : 'Cancel a win'}>
        <FormStack
          onSubmit={async (event) => {
            event.preventDefault();
            if (!cancelling) return;
            if (await act('cancel', cancelling, { reason: reason.trim() })) setCancelling(null);
          }}
          actions={
            <div className="flex justify-between gap-2">
              <Button variant="danger" type="submit" loading={busyId !== null} loadingLabel="Cancelling…" disabled={!reason.trim()}>
                {cancelling ? `Cancel win of lot ${cancelling.lot.lotNo}` : 'Cancel win'}
              </Button>
              <Button variant="secondary" type="button" disabled={busyId !== null} onClick={() => setCancelling(null)}>
                Keep win
              </Button>
            </div>
          }
        >
          {cancelling ? (
            <p className="text-sm">
              {cancelling.bidder.alias} no longer owes {formatMoney(cancelling.totalMinor)} for lot {cancelling.lot.lotNo}, and the order{cancelling.orderNumber ? ` ${cancelling.orderNumber}` : ''} is cancelled. No strike is recorded.
              You can still offer the lot to the next bidder afterwards.
            </p>
          ) : null}
          <Field label="Reason" hint="Kept on the win and in the audit trail." error={formError}>
            {(control) => (
              <textarea
                {...control}
                className="field-input w-full"
                rows={3}
                maxLength={MAX_CANCEL_REASON_LENGTH}
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value);
                  setFormError(null);
                }}
              />
            )}
          </Field>
        </FormStack>
      </Dialog>

      <ConfirmDialog
        open={offering !== null}
        onClose={() => setOffering(null)}
        onConfirm={async () => {
          if (!offering) return;
          // Closed either way: the outcome, a success or the reason it was refused, is on the page behind.
          await act('offerNext', offering);
          setOffering(null);
        }}
        title={offering ? `Offer lot ${offering.lot.lotNo} to the next bidder?` : 'Offer to the next bidder?'}
        description={offering ? offerNextConsequence(offering) : ''}
        confirmLabel={offering?.next ? `Offer lot ${offering.lot.lotNo} to ${offering.next.alias}` : 'Offer lot to next bidder'}
        variant="primary"
        busy={busyId !== null}
      />
    </div>
  );
}
