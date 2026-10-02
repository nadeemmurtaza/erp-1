'use client';

import { use, useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { formatDateTime, formatMoney, toMajor, toMinor } from '@newax/shared';
import { adminFetch } from '@/lib/admin-client';
import { ROUTES } from '@/constants/routes';
import {
  Button,
  ConfirmDialog,
  DangerZone,
  DataTable,
  Dialog,
  Field,
  FormStack,
  Loading,
  MetricStrip,
  PageHeader,
  Section,
} from '@/components/ui';
import { StatusBadge } from '@/components/common/status-badge';
import { useAdminSession } from '@/components/admin/session';

interface Lot {
  id: string;
  lotNo: number;
  title: string;
  description: string | null;
  quantity: number;
  startPriceMinor: number;
  /** Present only for a holder of auction.manage — the server leaves it out for everyone else. */
  reservePriceMinor?: number | null;
  status: string;
}

interface AuctionDetail {
  id: string;
  number: string;
  title: string;
  status: string;
  startsAt: string;
  endsAt: string;
  terms: string | null;
  lots: Lot[];
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Whole or two-decimal major units typed by a person, or null when it is not a positive amount. */
function parseAmount(text: string): number | null {
  const value = Number(text);
  return text.trim() !== '' && Number.isFinite(value) && value > 0 ? toMinor(value) : null;
}

/**
 * launchpad-apps/234-auction-app.md (WO-234.1) — prepare one auction for sale:
 * set its times, add its lots, schedule it. Everything here edits a draft; once
 * scheduled the page locks and says how to unlock it, and a cancelled or later
 * auction is read-only. The lot's reserve is shown only to a holder of
 * `auction.manage` — the server does not send it to anyone else.
 */
export default function AuctionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { can } = useAdminSession();
  const canManage = can('auction.manage');
  const canPublish = can('auction.publish');

  const [auction, setAuction] = useState<AuctionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [withdrawing, setWithdrawing] = useState<Lot | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [terms, setTerms] = useState('');

  const [lotOpen, setLotOpen] = useState(false);
  const [editingLot, setEditingLot] = useState<Lot | null>(null);
  const [lotTitle, setLotTitle] = useState('');
  const [lotDescription, setLotDescription] = useState('');
  const [lotQuantity, setLotQuantity] = useState('1');
  const [lotStart, setLotStart] = useState('');
  const [lotReserve, setLotReserve] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setAuction(await adminFetch<AuctionDetail>(`/admin/auctions/${id}`));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load this auction');
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  /** Runs one write, reloads the page's data, and puts any refusal where the person is looking. */
  const run = async (write: () => Promise<unknown>, onError: (message: string) => void = setError) => {
    setBusy(true);
    try {
      await write();
      await load();
      return true;
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'That did not go through');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const openEdit = (current: AuctionDetail) => {
    setTitle(current.title);
    setStartsAt(toLocalInput(current.startsAt));
    setEndsAt(toLocalInput(current.endsAt));
    setTerms(current.terms ?? '');
    setFormError(null);
    setEditOpen(true);
  };

  const saveEdit = async (event: FormEvent) => {
    event.preventDefault();
    const saved = await run(
      () =>
        adminFetch(`/admin/auctions/${id}`, {
          method: 'PATCH',
          body: { title: title.trim(), startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString(), terms: terms.trim() },
        }),
      setFormError,
    );
    if (saved) setEditOpen(false);
  };

  const openLot = (lot: Lot | null) => {
    setEditingLot(lot);
    setLotTitle(lot?.title ?? '');
    setLotDescription(lot?.description ?? '');
    setLotQuantity(String(lot?.quantity ?? 1));
    setLotStart(lot ? String(toMajor(lot.startPriceMinor)) : '');
    setLotReserve(lot?.reservePriceMinor ? String(toMajor(lot.reservePriceMinor)) : '');
    setFormError(null);
    setLotOpen(true);
  };

  const startMinor = parseAmount(lotStart);
  const reserveMinor = lotReserve.trim() === '' ? null : parseAmount(lotReserve);
  const reserveError =
    lotReserve.trim() !== '' && reserveMinor === null
      ? 'Enter an amount above zero, or leave it blank for no reserve.'
      : reserveMinor !== null && startMinor !== null && reserveMinor < startMinor
        ? 'The reserve cannot be below the opening price.'
        : null;

  const saveLot = async (event: FormEvent) => {
    event.preventDefault();
    if (startMinor === null || reserveError) return;
    const body = {
      title: lotTitle.trim(),
      description: lotDescription.trim(),
      quantity: parseInt(lotQuantity, 10) || 1,
      startPriceMinor: startMinor,
      reservePriceMinor: reserveMinor,
    };
    const saved = await run(
      () =>
        editingLot
          ? adminFetch(`/admin/auctions/${id}/lots/${editingLot.id}`, { method: 'PATCH', body })
          : adminFetch(`/admin/auctions/${id}/lots`, { method: 'POST', body: { ...body, reservePriceMinor: reserveMinor ?? undefined } }),
      setFormError,
    );
    if (saved) setLotOpen(false);
  };

  if (!auction) {
    return error ? (
      <>
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={load}>
            Try again
          </Button>
          <Link href={ROUTES.admin.auctions} className="btn-secondary">
            Back to auctions
          </Link>
        </div>
      </>
    ) : (
      <Loading label="Loading auction" />
    );
  }

  const isDraft = auction.status === 'DRAFT';
  const isScheduled = auction.status === 'SCHEDULED';
  const onSale = auction.lots.filter((lot) => lot.status !== 'WITHDRAWN');
  const editable = isDraft && canManage;
  const showReserve = canManage;

  const primary = isDraft && canPublish ? (
    <Button onClick={() => setScheduleOpen(true)} disabled={onSale.length === 0}>
      Schedule auction
    </Button>
  ) : isScheduled && canPublish ? (
    <Button
      variant="secondary"
      loading={busy}
      onClick={() => run(() => adminFetch(`/admin/auctions/${id}/unschedule`, { method: 'POST' }))}
    >
      Return to draft
    </Button>
  ) : undefined;

  return (
    <>
      <PageHeader
        context={
          <Link href={ROUTES.admin.auctions} className="hover:underline">
            ← Auctions
          </Link>
        }
        title={auction.title}
        description={
          <span className="inline-flex items-center gap-2">
            {auction.number}
            <StatusBadge status={auction.status} />
          </span>
        }
        action={primary}
      />

      {isDraft && canPublish && onSale.length === 0 ? (
        <p className="notice notice-info mb-4">
          Add at least one lot to schedule this auction.
        </p>
      ) : null}
      {isScheduled ? (
        <p className="notice notice-info mb-4">
          Scheduled to open {formatDateTime(auction.startsAt)}. Its details and lots are locked
          {canPublish ? '; return it to draft to change them.' : '.'}
        </p>
      ) : null}
      {auction.status === 'CANCELLED' ? <p className="notice mb-4">This auction was cancelled. Nothing on it can change.</p> : null}
      {!isDraft && !isScheduled && auction.status !== 'CANCELLED' ? (
        <p className="notice mb-4">This auction has opened, so it can no longer be edited here.</p>
      ) : null}

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      <MetricStrip
        label="Auction summary"
        className="mb-6"
        items={[
          { key: 'opens', label: 'Opens', value: formatDateTime(auction.startsAt) },
          { key: 'closes', label: 'Closes', value: formatDateTime(auction.endsAt) },
          { key: 'lots', label: 'Lots on sale', value: String(onSale.length) },
        ]}
      />

      <Section
        title="Lots"
        action={
          editable ? (
            <Button variant="secondary" onClick={() => openLot(null)}>
              Add lot
            </Button>
          ) : undefined
        }
      >
        <div className="overflow-hidden">
          <DataTable
            rows={auction.lots}
            rowKey={(lot) => lot.id}
            emptyLabel={editable ? 'No lots yet. Add the first one.' : 'This auction has no lots.'}
            columns={[
              { header: 'No.', numeric: true, cell: (lot) => lot.lotNo },
              {
                header: 'Lot',
                cell: (lot) => (
                  <span>
                    {lot.title}
                    {lot.status === 'WITHDRAWN' ? (
                      <span className="ms-2">
                        <StatusBadge status="WITHDRAWN" />
                      </span>
                    ) : null}
                    {lot.description ? <span className="block text-xs text-neutral-900/60">{lot.description}</span> : null}
                  </span>
                ),
              },
              { header: 'Qty', align: 'end', numeric: true, cell: (lot) => lot.quantity },
              { header: 'Opening price', align: 'end', numeric: true, cell: (lot) => formatMoney(lot.startPriceMinor) },
              ...(showReserve
                ? [
                    {
                      header: 'Reserve',
                      align: 'end' as const,
                      numeric: true,
                      muted: true,
                      cell: (lot: Lot) => (lot.reservePriceMinor ? formatMoney(lot.reservePriceMinor) : '—'),
                    },
                  ]
                : []),
              ...(editable
                ? [
                    {
                      header: '',
                      align: 'end' as const,
                      cell: (lot: Lot) =>
                        lot.status === 'WITHDRAWN' ? null : (
                          <span className="inline-flex gap-1">
                            <Button variant="ghost" onClick={() => openLot(lot)}>
                              Edit
                            </Button>
                            <Button variant="ghost" onClick={() => setWithdrawing(lot)}>
                              Withdraw
                            </Button>
                          </span>
                        ),
                    },
                  ]
                : []),
            ]}
          />
        </div>
      </Section>

      <Section
        title="Details"
        action={
          editable ? (
            <Button variant="secondary" onClick={() => openEdit(auction)}>
              Edit details
            </Button>
          ) : undefined
        }
        className="mt-8"
      >
        {auction.terms ? (
          <p className="max-w-prose whitespace-pre-line text-sm">{auction.terms}</p>
        ) : (
          <p className="text-sm text-neutral-900/60">No terms written. Bidders will see none on the lot page.</p>
        )}
      </Section>

      {canManage && (isDraft || isScheduled) ? (
        <DangerZone
          className="mt-10"
          actions={[
            {
              id: 'cancel-auction',
              title: 'Cancel this auction',
              description: 'It will never open and every lot is withdrawn. The auction and its history stay on record; it cannot be reopened.',
              control: (
                <Button
                  variant="danger"
                  onClick={() => {
                    setReason('');
                    setFormError(null);
                    setCancelOpen(true);
                  }}
                >
                  Cancel auction
                </Button>
              ),
            },
          ]}
        />
      ) : null}

      <ConfirmDialog
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        title="Schedule this auction?"
        description={`It will open to bidding on ${formatDateTime(auction.startsAt)} with ${onSale.length} ${onSale.length === 1 ? 'lot' : 'lots'}. You can return it to draft any time before then.`}
        confirmLabel="Schedule auction"
        variant="primary"
        busy={busy}
        onConfirm={async () => {
          if (await run(() => adminFetch(`/admin/auctions/${id}/schedule`, { method: 'POST' }))) setScheduleOpen(false);
        }}
      />

      <ConfirmDialog
        open={withdrawing !== null}
        onClose={() => setWithdrawing(null)}
        title={withdrawing ? `Withdraw lot ${withdrawing.lotNo}?` : ''}
        description="It comes off the auction and keeps its number. It stays on record; to sell the item, add it again as a new lot."
        confirmLabel={withdrawing ? `Withdraw lot ${withdrawing.lotNo}` : 'Withdraw lot'}
        busy={busy}
        onConfirm={async () => {
          if (!withdrawing) return;
          if (await run(() => adminFetch(`/admin/auctions/${id}/lots/${withdrawing.id}/withdraw`, { method: 'POST' }))) setWithdrawing(null);
        }}
      />

      <Dialog open={cancelOpen} onClose={busy ? () => {} : () => setCancelOpen(false)} title="Cancel this auction">
        <FormStack
          onSubmit={async (event) => {
            event.preventDefault();
            const done = await run(() => adminFetch(`/admin/auctions/${id}/cancel`, { method: 'POST', body: { reason: reason.trim() } }), setFormError);
            if (done) setCancelOpen(false);
          }}
          actions={
            <div className="flex justify-between gap-2">
              <Button variant="danger" type="submit" loading={busy} loadingLabel="Cancelling…" disabled={!reason.trim()}>
                Cancel auction
              </Button>
              <Button variant="secondary" type="button" disabled={busy} onClick={() => setCancelOpen(false)}>
                Keep auction
              </Button>
            </div>
          }
        >
          <p className="text-sm">
            {auction.title} will never open and all of its lots are withdrawn. This cannot be undone.
          </p>
          <Field label="Reason" hint="Written to the audit trail." error={formError}>
            {(control) => (
              <textarea {...control} className="field-input w-full" rows={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
            )}
          </Field>
        </FormStack>
      </Dialog>

      <Dialog open={editOpen} onClose={busy ? () => {} : () => setEditOpen(false)} title="Edit auction details">
        <FormStack
          onSubmit={saveEdit}
          actions={
            <div className="flex justify-end gap-2">
              <Button variant="secondary" type="button" disabled={busy} onClick={() => setEditOpen(false)}>
                Discard changes
              </Button>
              <Button type="submit" loading={busy} loadingLabel="Saving…" disabled={!title.trim() || !startsAt || !endsAt}>
                Save details
              </Button>
            </div>
          }
        >
          <Field label="Title">
            {(control) => <input {...control} className="field-input w-full" value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} />}
          </Field>
          <Field label="Opens">
            {(control) => <input {...control} type="datetime-local" className="field-input w-full" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />}
          </Field>
          <Field label="Closes">
            {(control) => <input {...control} type="datetime-local" className="field-input w-full" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />}
          </Field>
          <Field label="Terms" hint="Bidders accept these on every lot page." error={formError}>
            {(control) => <textarea {...control} className="field-input w-full" rows={4} maxLength={5000} value={terms} onChange={(e) => setTerms(e.target.value)} />}
          </Field>
        </FormStack>
      </Dialog>

      <Dialog open={lotOpen} onClose={busy ? () => {} : () => setLotOpen(false)} title={editingLot ? `Edit lot ${editingLot.lotNo}` : 'Add lot'}>
        <FormStack
          onSubmit={saveLot}
          actions={
            <div className="flex justify-end gap-2">
              <Button variant="secondary" type="button" disabled={busy} onClick={() => setLotOpen(false)}>
                Discard lot
              </Button>
              <Button
                type="submit"
                loading={busy}
                loadingLabel="Saving…"
                disabled={!lotTitle.trim() || startMinor === null || reserveError !== null}
              >
                {editingLot ? 'Save lot' : 'Add lot'}
              </Button>
            </div>
          }
        >
          <Field label="Title">
            {(control) => <input {...control} className="field-input w-full" value={lotTitle} maxLength={160} onChange={(e) => setLotTitle(e.target.value)} />}
          </Field>
          <Field label="Description" hint="Optional.">
            {(control) => <textarea {...control} className="field-input w-full" rows={3} maxLength={2000} value={lotDescription} onChange={(e) => setLotDescription(e.target.value)} />}
          </Field>
          <div className="grid grid-cols-1 gap-4 fold:grid-cols-2">
            <Field label="Quantity">
              {(control) => <input {...control} type="number" min="1" className="field-input w-full" value={lotQuantity} onChange={(e) => setLotQuantity(e.target.value)} />}
            </Field>
            <Field label="Opening price">
              {(control) => <input {...control} type="number" min="0" step="any" inputMode="decimal" className="field-input w-full" value={lotStart} onChange={(e) => setLotStart(e.target.value)} />}
            </Field>
          </div>
          <Field label="Reserve price" hint="Optional. Never shown to bidders. If bidding ends below it, the lot is not sold." error={reserveError ?? formError}>
            {(control) => <input {...control} type="number" min="0" step="any" inputMode="decimal" className="field-input w-full" value={lotReserve} onChange={(e) => setLotReserve(e.target.value)} />}
          </Field>
        </FormStack>
      </Dialog>
    </>
  );
}
