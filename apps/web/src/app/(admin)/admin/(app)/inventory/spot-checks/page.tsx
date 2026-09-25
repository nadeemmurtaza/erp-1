'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adminFetch } from '@/lib/admin-client';
import { formatDateTime } from '@newax/shared';
import { ROUTES } from '@/constants/routes';
import { PageHeader, DataTable, EmptyState, Disclosure } from '@/components/ui';
import { StatusBadge } from '@/components/common/status-badge';
import type { Location } from '@/types/api';

interface SpotCheckRow {
  id: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  scheduledFor: string;
  location: { id: string; name: string };
  lines: Array<{ id: string }>;
}

interface SpotCheckPolicy {
  id: string;
  locationId: string | null;
  minSkusPerCheck: number;
  frequencyDays: number;
  isActive: boolean;
}

export default function SpotChecksPage() {
  const [checks, setChecks] = useState<SpotCheckRow[] | null>(null);
  const [policies, setPolicies] = useState<SpotCheckPolicy[] | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [newLocationId, setNewLocationId] = useState('');
  const [newFrequency, setNewFrequency] = useState(3);
  const [newMinSkus, setNewMinSkus] = useState(5);
  const [savingPolicy, setSavingPolicy] = useState(false);

  const load = () => {
    Promise.all([
      adminFetch<{ data: SpotCheckRow[] }>('/admin/inventory/spot-checks'),
      adminFetch<{ data: SpotCheckPolicy[] }>('/admin/inventory/spot-check-policies'),
      adminFetch<Location[]>('/admin/inventory/locations'),
    ])
      .then(([checkRes, policyRes, locationRes]) => {
        setChecks(checkRes.data);
        setPolicies(policyRes.data);
        setLocations(locationRes);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load spot checks'));
  };

  useEffect(load, []);

  const createPolicy = async () => {
    setSavingPolicy(true);
    try {
      await adminFetch('/admin/inventory/spot-check-policies', {
        method: 'POST',
        body: { locationId: newLocationId || undefined, frequencyDays: newFrequency, minSkusPerCheck: newMinSkus },
      });
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create policy');
    } finally {
      setSavingPolicy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Spot checks"
        description="Small, unscheduled counts at an unpredictable time — the deterrent for a single-employee branch."
      />

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      <Disclosure label="Spot-check policy">
        <div className="p-4 space-y-4">
          {policies && policies.length > 0 ? (
            <ul className="space-y-2">
              {policies.map((p) => (
                <li key={p.id} className="text-sm text-neutral-900/80">
                  {p.locationId ? locations.find((l) => l.id === p.locationId)?.name ?? p.locationId : 'Every location'} — every ~
                  {p.frequencyDays} days, {p.minSkusPerCheck} SKUs — {p.isActive ? 'active' : 'inactive'}
                </li>
              ))}
            </ul>
          ) : null}

          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="policy-location" className="mb-1 block text-xs text-neutral-900/70">
                Location
              </label>
              <select id="policy-location" className="field-input" value={newLocationId} onChange={(e) => setNewLocationId(e.target.value)}>
                <option value="">Every location</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="policy-frequency" className="mb-1 block text-xs text-neutral-900/70">
                Every ~N days
              </label>
              <input
                id="policy-frequency"
                type="number"
                min="1"
                className="field-input w-20"
                value={newFrequency}
                onChange={(e) => setNewFrequency(parseInt(e.target.value) || 1)}
              />
            </div>
            <div>
              <label htmlFor="policy-skus" className="mb-1 block text-xs text-neutral-900/70">
                SKUs per check
              </label>
              <input
                id="policy-skus"
                type="number"
                min="1"
                className="field-input w-20"
                value={newMinSkus}
                onChange={(e) => setNewMinSkus(parseInt(e.target.value) || 1)}
              />
            </div>
            <button onClick={createPolicy} disabled={savingPolicy} className="btn-primary">
              Add policy
            </button>
          </div>
        </div>
      </Disclosure>

      <div className="mt-6">
        {checks && checks.length === 0 ? (
          <EmptyState title="No spot checks yet" description="One will appear here once a policy's cadence comes due." />
        ) : (
          <div className="overflow-hidden">
            <DataTable
              rows={checks}
              loading={!checks}
              emptyLabel="No spot checks found."
              rowKey={(c) => c.id}
              columns={[
                {
                  header: 'Check',
                  cell: (c) => (
                    <Link href={ROUTES.admin.spotCheck(c.id)} className="font-medium text-accent-hover hover:underline">
                      {c.lines.length} SKU{c.lines.length === 1 ? '' : 's'}
                    </Link>
                  ),
                },
                { header: 'Location', cell: (c) => c.location.name, muted: true },
                { header: 'Scheduled', cell: (c) => formatDateTime(c.scheduledFor), muted: true },
                { header: 'Status', cell: (c) => <StatusBadge status={c.status} /> },
              ]}
            />
          </div>
        )}
      </div>
    </>
  );
}
