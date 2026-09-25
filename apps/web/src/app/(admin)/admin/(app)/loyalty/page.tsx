'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminFetch } from '@/lib/admin-client';
import { useToast } from '@/hooks/use-toast';
import { ToastStack } from '@/components/admin/toast-stack';
import { DataTable, PageHeader, Section } from '@/components/ui';
import { formatMoney, toMinor } from '@newax/shared';

interface Tier {
  id: string;
  name: string;
  minSpend: number;
  benefitDescriptionEn: string;
  sortOrder: number;
}

/** WO-7.7 — trailing-12-month spend tiers. Few rows, staff-editable. */
export default function LoyaltyAdminPage() {
  const { toasts, add: addToast, remove: removeToast } = useToast();
  const [tiers, setTiers] = useState<Tier[] | null>(null);
  const [busy, setBusy] = useState(true);
  const [name, setName] = useState('');
  const [minSpendRupees, setMinSpendRupees] = useState('');
  const [benefit, setBenefit] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      setTiers(await adminFetch<Tier[]>('/loyalty/tiers'));
    } catch {
      addToast('Could not load loyalty tiers.', 'error');
    } finally {
      setBusy(false);
    }
  }, [addToast]);

  useEffect(() => {
    load();
  }, [load]);

  async function createTier(event: React.FormEvent) {
    event.preventDefault();
    setCreating(true);
    try {
      await adminFetch('/admin/loyalty/tiers', {
        method: 'POST',
        body: { name, minSpend: toMinor(Number(minSpendRupees) || 0), benefitDescriptionEn: benefit, sortOrder: (tiers?.length ?? 0) },
      });
      addToast('Tier created.', 'success');
      setName('');
      setMinSpendRupees('');
      setBenefit('');
      load();
    } catch {
      addToast('Could not create that tier.', 'error');
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <PageHeader title="Loyalty" description="Trailing-12-month spend tiers and their benefits." />
      <ToastStack toasts={toasts} onDismiss={removeToast} />

      <DataTable<Tier>
        rows={tiers}
        loading={busy}
        rowKey={(row) => row.id}
        emptyLabel="No tiers yet."
        columns={[
          { header: 'Name', cell: (row) => row.name },
          { header: 'Minimum spend (12mo)', cell: (row) => formatMoney(row.minSpend), numeric: true },
          { header: 'Benefit', cell: (row) => row.benefitDescriptionEn },
        ]}
      />

      <Section title="Add a tier" className="mt-6">
        <form onSubmit={createTier} className="grid max-w-xl gap-4 sm:grid-cols-2">
          <div>
            <label className="field-label" htmlFor="tierName">
              Name
            </label>
            <input id="tierName" className="field-input" value={name} onChange={(event) => setName(event.target.value)} required />
          </div>
          <div>
            <label className="field-label" htmlFor="tierMinSpend">
              Minimum spend (Rs., 12 months)
            </label>
            <input
              id="tierMinSpend"
              type="number"
              min={0}
              className="field-input"
              value={minSpendRupees}
              onChange={(event) => setMinSpendRupees(event.target.value)}
              required
            />
          </div>
          <div className="sm:col-span-2">
            <label className="field-label" htmlFor="tierBenefit">
              Benefit
            </label>
            <input id="tierBenefit" className="field-input" value={benefit} onChange={(event) => setBenefit(event.target.value)} required />
          </div>
          <button type="submit" disabled={creating} className="btn-primary sm:col-span-2">
            {creating ? 'Adding…' : 'Add tier'}
          </button>
        </form>
      </Section>
    </>
  );
}
