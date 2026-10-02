'use client';

import { useEffect, useState } from 'react';
import { adminFetch } from '@/lib/admin-client';
import { PageHeader } from '@/components/ui';
import type { Location } from '@/types/api';
import { DateField } from '@/components/ui/date-field';
import { Select } from '@/components/ui/select';

interface Report {
  locationId: string;
  date: string;
  cameraFootTraffic: number | null;
  posTransactionCount: number;
  ratio: number | null;
}

export default function SuspiciousTrafficPage() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    adminFetch<Location[]>('/admin/inventory/locations')
      .then((result) => {
        setLocations(result);
        setLocationId(result.find((l) => l.isDefault)?.id ?? result[0]?.id ?? '');
      })
      .catch(() => setLocations([]));
  }, []);

  useEffect(() => {
    if (!locationId) return;
    setBusy(true);
    setError(null);
    adminFetch<Report>('/admin/inventory/suspicious-traffic', { query: { locationId, date } })
      .then(setReport)
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load report'))
      .finally(() => setBusy(false));
  }, [locationId, date]);

  return (
    <>
      <PageHeader
        title="Suspicious traffic"
        description="A camera count far above the till's transaction count is a SIGNAL to review footage — never itself an accusation."
      />

      <div className="card p-6 mb-6 flex flex-wrap items-end gap-4 max-w-lg">
        <div>
          <label htmlFor="traffic-location" className="mb-1 block text-xs text-neutral-900/70">
            Location
          </label>
          <Select
            id="traffic-location"
            label="Location"
            value={locationId}
            onChange={setLocationId}
            options={locations.map((l) => ({ value: l.id, label: l.name }))}
          />
        </div>
        <div>
          <label htmlFor="traffic-date" className="mb-1 block text-xs text-neutral-900/70">
            Date
          </label>
          <DateField id="traffic-date" value={date} onChange={setDate} />
        </div>
      </div>

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      {busy || !report ? (
        <p className="text-sm text-neutral-900/60">Loading…</p>
      ) : (
        <div className="metric-strip">
          <div className="metric">
            <div className="text-xs text-neutral-900/60">Camera foot traffic</div>
            <div className="text-2xl font-semibold text-neutral-900">
              {report.cameraFootTraffic ?? 'Not available'}
            </div>
            {report.cameraFootTraffic === null ? (
              <p className="mt-1 text-xs text-neutral-900/60">No camera people-count feed is connected for this location.</p>
            ) : null}
          </div>
          <div className="metric">
            <div className="text-xs text-neutral-900/60">POS transactions</div>
            <div className="text-2xl font-semibold text-neutral-900">{report.posTransactionCount}</div>
          </div>
          <div className="metric">
            <div className="text-xs text-neutral-900/60">Ratio</div>
            <div className="text-2xl font-semibold text-neutral-900">{report.ratio != null ? report.ratio.toFixed(1) : '—'}</div>
          </div>
        </div>
      )}
    </>
  );
}
