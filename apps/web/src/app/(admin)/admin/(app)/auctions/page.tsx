'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatDateTime } from '@newax/shared';
import { adminFetch } from '@/lib/admin-client';
import { ROUTES } from '@/constants/routes';
import type { PaginatedResponse } from '@/types/api';
import {
  Button,
  DataTable,
  Dialog,
  EmptyState,
  Field,
  FilterBar,
  FormStack,
  PageHeader,
  Pagination,
  useFilterPage,
  useFilterParam,
  useSetFilterPage,
} from '@/components/ui';
import { StatusBadge, statusLabel } from '@/components/common/status-badge';
import { useAdminSession } from '@/components/admin/session';

interface AuctionRow {
  id: string;
  number: string;
  title: string;
  status: string;
  startsAt: string;
  endsAt: string;
  lotCount: number;
}

const STATUSES = ['DRAFT', 'SCHEDULED', 'OPEN', 'CLOSING', 'CLOSED', 'SETTLED', 'CANCELLED'];

/**
 * launchpad-apps/234-auction-app.md (WO-234.1) — find an auction, or start one.
 * A new auction opens straight onto its own page, because the next thing anyone
 * does with a draft is add its lots.
 */
export default function AuctionsPage() {
  const router = useRouter();
  const { can } = useAdminSession();
  const canManage = can('auction.manage');

  const status = useFilterParam('status');
  const q = useFilterParam('q');
  const page = useFilterPage();
  const setPage = useSetFilterPage();

  const [auctions, setAuctions] = useState<PaginatedResponse<AuctionRow> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [newOpen, setNewOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');

  const load = useCallback(async () => {
    setError(null);
    try {
      setAuctions(
        await adminFetch<PaginatedResponse<AuctionRow>>('/admin/auctions', {
          query: { status: status || undefined, q: q || undefined, page, pageSize: 20 },
        }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load auctions');
    }
  }, [status, q, page]);

  useEffect(() => {
    load();
  }, [load]);

  const closeNew = () => {
    setNewOpen(false);
    setFormError(null);
  };

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const created = await adminFetch<{ id: string }>('/admin/auctions', {
        method: 'POST',
        body: { title: title.trim(), startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString() },
      });
      router.push(ROUTES.admin.auction(created.id));
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Could not create the auction');
      setSaving(false);
    }
  };

  const newAction = canManage ? (
    <Button onClick={() => setNewOpen(true)}>New auction</Button>
  ) : undefined;

  return (
    <>
      <PageHeader
        title="Auctions"
        description="Sell by competitive bidding: draft an auction, add its lots, then schedule it."
        action={newAction}
      />

      <FilterBar
        filters={[
          { key: 'q', type: 'search', placeholder: 'Auction number or title' },
          {
            key: 'status',
            type: 'select',
            placeholder: 'All statuses',
            options: STATUSES.map((value) => ({ value, label: statusLabel(value) })),
          },
        ]}
      />

      {error ? (
        <div role="alert" className="notice notice-error mb-4 flex items-center justify-between gap-3">
          <span>{error}</span>
          <Button variant="secondary" onClick={load}>
            Try again
          </Button>
        </div>
      ) : null}

      <div className="overflow-hidden">
        {auctions && auctions.data.length === 0 && !error ? (
          <EmptyState
            title={status || q ? 'No auctions match' : 'No auctions yet'}
            description={
              status || q ? 'Clear the filters to see every auction.' : 'Draft one, add its lots, and schedule it when it is ready.'
            }
            action={!status && !q ? newAction : undefined}
          />
        ) : (
          <DataTable
            rows={auctions?.data}
            loading={!auctions && !error}
            emptyLabel="No auctions found."
            rowKey={(row) => row.id}
            columns={[
              {
                header: 'Auction',
                cell: (row) => (
                  <Link href={ROUTES.admin.auction(row.id)} className="font-medium text-accent-hover hover:underline">
                    {row.title}
                    <span className="ms-2 text-xs font-normal text-neutral-900/60">{row.number}</span>
                  </Link>
                ),
              },
              { header: 'Status', cell: (row) => <StatusBadge status={row.status} /> },
              { header: 'Opens', cell: (row) => formatDateTime(row.startsAt), muted: true, className: 'whitespace-nowrap' },
              { header: 'Closes', cell: (row) => formatDateTime(row.endsAt), muted: true, className: 'whitespace-nowrap' },
              { header: 'Lots', align: 'end', numeric: true, cell: (row) => row.lotCount },
            ]}
          />
        )}

        {auctions ? <Pagination meta={auctions.meta} onChange={setPage} itemLabel="auctions" /> : null}
      </div>

      <Dialog open={newOpen} onClose={saving ? () => {} : closeNew} title="New auction">
        <FormStack
          onSubmit={create}
          actions={
            <div className="flex justify-end gap-2">
              <Button variant="secondary" type="button" disabled={saving} onClick={closeNew}>
                Discard draft
              </Button>
              <Button type="submit" loading={saving} loadingLabel="Creating…" disabled={!title.trim() || !startsAt || !endsAt}>
                Create auction
              </Button>
            </div>
          }
        >
          <Field label="Title" hint="Bidders see this on every lot page.">
            {(control) => (
              <input {...control} className="field-input w-full" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} placeholder="Winter clearance, week 3" />
            )}
          </Field>
          <Field label="Opens">
            {(control) => (
              <input {...control} type="datetime-local" className="field-input w-full" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            )}
          </Field>
          <Field label="Closes" error={formError}>
            {(control) => (
              <input {...control} type="datetime-local" className="field-input w-full" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
            )}
          </Field>
        </FormStack>
      </Dialog>
    </>
  );
}
