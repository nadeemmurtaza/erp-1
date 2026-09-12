'use client';

import { useCallback, useEffect, useState } from 'react';
import { cn } from '@/utils/cn';
import { LEAD_STATUSES, formatDate, formatMoney, toMinor } from '@newax/shared';
import { adminFetch } from '@/lib/admin-client';

interface Lead {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  message: string | null;
  source: string;
  status: string;
  quotedValue: number | null;
  createdAt: string;
  contact: { id: string; name: string; lifetimeValue: number } | null;
}

/** The columns of the pipeline, in the order an enquiry moves through them. */
const COLUMNS = ['NEW', 'CONTACTED', 'QUOTED', 'WON', 'LOST'] as const;

const NEXT: Record<string, string[]> = {
  NEW: ['CONTACTED', 'LOST'],
  CONTACTED: ['QUOTED', 'WON', 'LOST'],
  QUOTED: ['WON', 'LOST'],
  WON: [],
  LOST: ['CONTACTED'],
};

/**
 * Enquiries that are not yet orders — a stitching quote, a WhatsApp message,
 * a contact-form submission. An enquiry from someone who has ordered before is
 * linked to their customer record automatically.
 */
export default function AdminLeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setLeads(await adminFetch<Lead[]>('/admin/crm/leads'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load enquiries');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function move(lead: Lead, status: string) {
    let quotedValue: number | undefined;
    let lostReason: string | undefined;

    if (status === 'QUOTED') {
      const rupees = window.prompt(`What was quoted to ${lead.name}? (rupees)`);
      if (rupees === null) return;
      quotedValue = toMinor(Number(rupees) || 0);
    }

    if (status === 'LOST') {
      const reason = window.prompt('Why was it lost?');
      if (reason === null) return;
      lostReason = reason;
    }

    setBusy(true);
    try {
      await adminFetch(`/admin/crm/leads/${lead.id}`, {
        method: 'PATCH',
        body: { status, quotedValue, lostReason },
      });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update the enquiry');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1 className="mb-1 text-xl font-semibold text-neutral-900">Enquiries</h1>
      <p className="mb-6 text-sm text-neutral-900/60">
        People who have asked about something but not yet ordered.
      </p>

      {error ? (
        <p role="alert" className="card mb-4 p-4 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-5">
        {COLUMNS.map((column) => {
          const inColumn = leads.filter((lead) => lead.status === column);

          return (
            <section key={column} className="card p-3">
              <h2 className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-neutral-900/50">
                {column.charAt(0) + column.slice(1).toLowerCase()}
                <span className="rounded bg-white px-1.5 py-0.5 text-neutral-900/60">
                  {inColumn.length}
                </span>
              </h2>

              <ul className="mt-3 space-y-2">
                {inColumn.length === 0 ? (
                  <li className="py-4 text-center text-xs text-neutral-900/40">Empty</li>
                ) : (
                  inColumn.map((lead) => (
                    <li key={lead.id} className="rounded-md border border-neutral-100 p-2.5">
                      <p className="text-sm font-medium text-neutral-900">{lead.name}</p>
                      <p className="text-xs text-neutral-900/50">{lead.phone ?? lead.email ?? '—'}</p>

                      {lead.message ? (
                        <p className="mt-1 line-clamp-3 text-xs text-neutral-900/70">{lead.message}</p>
                      ) : null}

                      {lead.contact ? (
                        <p className="mt-1 text-xs text-accent-hover">
                          Existing customer · {formatMoney(lead.contact.lifetimeValue)}
                        </p>
                      ) : null}

                      {lead.quotedValue ? (
                        <p className="mt-1 text-xs font-medium text-neutral-900">
                          Quoted {formatMoney(lead.quotedValue)}
                        </p>
                      ) : null}

                      <p className="mt-1 text-[10px] uppercase tracking-wide text-neutral-900/30">
                        {lead.source.replace(/_/g, ' ')} ·{' '}
                        {formatDate(lead.createdAt)}
                      </p>

                      {(NEXT[lead.status] ?? []).length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {NEXT[lead.status]!.map((next) => (
                            <button
                              key={next}
                              type="button"
                              disabled={busy}
                              onClick={() => void move(lead, next)}
                              className={cn(
                                'rounded px-1.5 py-0.5 text-[11px]',
                                next === 'LOST'
                                  ? 'text-red-700 hover:bg-red-50'
                                  : 'text-accent-hover hover:bg-neutral-50',
                              )}
                            >
                              {next.charAt(0) + next.slice(1).toLowerCase()}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </li>
                  ))
                )}
              </ul>
            </section>
          );
        })}
      </div>

      <p className="mt-6 text-xs text-neutral-900/40">
        Statuses: {LEAD_STATUSES.join(' → ')}
      </p>
    </>
  );
}
