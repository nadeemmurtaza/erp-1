'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatDateTimeSeconds, formatMoney } from '@newax/shared';
import { adminFetch } from '@/lib/admin-client';
import { Button, DataTable, Dialog, Pagination, Section } from '@/components/ui';

interface LedgerBid {
  id: string;
  seq: number;
  alias: string;
  amountMinor: number;
  acceptedAt: string;
  hash: string;
}

interface LedgerPage {
  data: LedgerBid[];
  meta: { page: number; pageSize: number; total: number; totalPages: number; hasNext: boolean; hasPrevious: boolean };
}

interface Integrity {
  valid: boolean;
  bidCount: number;
  brokenAtSeq?: number;
}

export interface LedgerLot {
  id: string;
  lotNo: number;
  title: string;
}

/**
 * launchpad-apps/234-auction-app.md (WO-234.2) — every accepted bid on one lot,
 * newest first, as a side sheet over the auction page. The page is about
 * preparing and running the auction; a lot's bids are one level down, opened
 * only for the lot a person asks about (Law 7). Bidders appear by alias, as
 * they do to each other: identities belong to the bidder-management permission.
 *
 * "Check the bid chain" re-walks the lot's hash chain on the server and says
 * whether any bid was inserted, changed or removed after it was accepted. It
 * reads and writes nothing, so it is safe on a lot that is still open.
 */
export function AuctionBidLedger({ auctionId, lot, onClose }: { auctionId: string; lot: LedgerLot | null; onClose: () => void }) {
  const [page, setPage] = useState(1);
  const [ledger, setLedger] = useState<LedgerPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [integrity, setIntegrity] = useState<Integrity | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);

  const lotId = lot?.id;

  const load = useCallback(async () => {
    if (!lotId) return;
    setLoading(true);
    setError(null);
    try {
      setLedger(await adminFetch<LedgerPage>(`/admin/auctions/${auctionId}/lots/${lotId}/bids`, { query: { page, pageSize: 20 } }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load these bids');
    } finally {
      setLoading(false);
    }
  }, [auctionId, lotId, page]);

  // A different lot starts from its first page with nothing carried over from the last one.
  useEffect(() => {
    setPage(1);
    setLedger(null);
    setIntegrity(null);
    setCheckError(null);
  }, [lotId]);

  useEffect(() => {
    load();
  }, [load]);

  const check = async () => {
    if (!lotId) return;
    setChecking(true);
    setCheckError(null);
    try {
      setIntegrity(await adminFetch<Integrity>(`/admin/auctions/${auctionId}/lots/${lotId}/bids/verify`));
    } catch (cause) {
      setIntegrity(null);
      setCheckError(cause instanceof Error ? cause.message : 'The check did not run');
    } finally {
      setChecking(false);
    }
  };

  return (
    <Dialog open={lot !== null} onClose={onClose} title={lot ? `Lot ${lot.lotNo} bids` : 'Bids'} align="end">
      {lot ? (
        <div className="space-y-6">
          <p className="text-sm text-neutral-900/70">
            {lot.title}. Newest bid first, bidders shown by alias.
          </p>

          {error ? (
            <div role="alert" className="notice notice-error">
              <p>{error}</p>
              <Button variant="secondary" className="mt-2" onClick={load}>
                Try again
              </Button>
            </div>
          ) : (
            <>
              <DataTable
                rows={ledger?.data}
                rowKey={(bid) => bid.id}
                loading={loading && ledger === null}
                loadingLabel="Loading bids"
                emptyLabel="No bids have been placed on this lot."
                columns={[
                  { header: 'No.', numeric: true, cell: (bid) => bid.seq },
                  { header: 'Bidder', cell: (bid) => bid.alias },
                  { header: 'Bid', align: 'end', numeric: true, cell: (bid) => formatMoney(bid.amountMinor) },
                  { header: 'Placed', muted: true, cell: (bid) => formatDateTimeSeconds(bid.acceptedAt) },
                ]}
              />
              {ledger ? <Pagination meta={ledger.meta} onChange={setPage} itemLabel="bids" /> : null}
            </>
          )}

          <Section title="Integrity" description="Each bid carries a fingerprint of the one before it, so a bid added, changed or removed later shows up here.">
            <Button variant="secondary" loading={checking} loadingLabel="Checking…" onClick={check}>
              Check the bid chain
            </Button>
            {integrity?.valid ? (
              <p role="status" className="notice notice-success mt-3">
                The chain is intact. All {integrity.bidCount} {integrity.bidCount === 1 ? 'bid was' : 'bids were'} checked and none was added, changed or removed since it was accepted.
              </p>
            ) : null}
            {integrity && !integrity.valid ? (
              <p role="alert" className="notice notice-error mt-3">
                The chain breaks at bid {integrity.brokenAtSeq ?? '—'}. A bid on lot {lot.lotNo} was added, changed or removed after it was accepted, or the lot&apos;s price no longer matches its bids. Do not settle this lot. Tell your administrator and give them the lot number.
              </p>
            ) : null}
            {checkError ? (
              <p role="alert" className="notice notice-error mt-3">
                {checkError}
              </p>
            ) : null}
          </Section>
        </div>
      ) : null}
    </Dialog>
  );
}
