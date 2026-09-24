'use client';

import { useEffect, useState } from 'react';
import { adminFetch } from '@/lib/admin-client';
import { formatMoney } from '@newax/shared';
import { DataTable, PageHeader, Tabs } from '@/components/ui';

interface Zone {
  id: string;
  key: string;
  cities: string[];
  isCatchAll: boolean;
  isActive: boolean;
  translations: Array<{ locale: string; label: string }>;
  rates: Array<{ id: string; methodId: string; type: string; fee: number; freeAbove: number | null }>;
}

interface Method {
  id: string;
  key: string;
  etaMinDays: number;
  etaMaxDays: number;
  isActive: boolean;
  translations: Array<{ locale: string; label: string }>;
}

interface ShippingClass {
  id: string;
  key: string;
  handlingFee: number;
  isActive: boolean;
  translations: Array<{ locale: string; label: string }>;
}

function labelOf(translations: Array<{ locale: string; label: string }>): string {
  return translations.find((t) => t.locale === 'en')?.label ?? translations[0]?.label ?? '—';
}

/** WO-6.8's `/admin/settings/shipping` — zones, rates, methods, classes. */
export default function ShippingSettingsPage() {
  const [zones, setZones] = useState<Zone[] | null>(null);
  const [methods, setMethods] = useState<Method[] | null>(null);
  const [classes, setClasses] = useState<ShippingClass[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const [z, m, c] = await Promise.all([
        adminFetch<Zone[]>('/admin/settings/shipping/zones'),
        adminFetch<Method[]>('/admin/settings/shipping/methods'),
        adminFetch<ShippingClass[]>('/admin/settings/shipping/classes'),
      ]);
      setZones(z);
      setMethods(m);
      setClasses(c);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load shipping settings');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function addZone() {
    const key = window.prompt('Zone key (e.g. karachi)');
    if (!key) return;
    const label = window.prompt('Label', key) ?? key;
    const cities = (window.prompt('Cities, comma-separated (blank = catch-all)') ?? '')
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);
    const feeRs = Number(window.prompt('Flat fee, in Rs', '150') ?? '0');
    const freeAboveRs = Number(window.prompt('Free above, in Rs (0 = never free)', '0') ?? '0');

    setBusy(true);
    try {
      const zone = await adminFetch<Zone>('/admin/settings/shipping/zones', {
        method: 'POST',
        body: { key, cities, isCatchAll: cities.length === 0, translations: [{ locale: 'en', label }] },
      });
      const standard = methods?.find((m) => m.key === 'standard');
      if (standard) {
        await adminFetch('/admin/settings/shipping/rates', {
          method: 'POST',
          body: {
            zoneId: zone.id,
            methodId: standard.id,
            type: 'FLAT',
            fee: Math.round(feeRs * 100),
            freeAbove: freeAboveRs > 0 ? Math.round(freeAboveRs * 100) : undefined,
          },
        });
      }
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create the zone');
    } finally {
      setBusy(false);
    }
  }

  async function addMethod() {
    const key = window.prompt('Method key (e.g. express)');
    if (!key) return;
    const label = window.prompt('Label', key) ?? key;
    setBusy(true);
    try {
      await adminFetch('/admin/settings/shipping/methods', {
        method: 'POST',
        body: { key, translations: [{ locale: 'en', label }] },
      });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create the method');
    } finally {
      setBusy(false);
    }
  }

  async function addClass() {
    const key = window.prompt('Shipping class key (e.g. fragile)');
    if (!key) return;
    const label = window.prompt('Label', key) ?? key;
    const feeRs = Number(window.prompt('Handling fee, in Rs', '0') ?? '0');
    setBusy(true);
    try {
      await adminFetch('/admin/settings/shipping/classes', {
        method: 'POST',
        body: { key, handlingFee: Math.round(feeRs * 100), translations: [{ locale: 'en', label }] },
      });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create the shipping class');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Shipping" description="Zones, rates, methods and per-product handling fees — WO-6.1." />

      {error ? <p role="alert" className="notice notice-error mb-4">{error}</p> : null}

      <Tabs
        label="Shipping settings"
        items={[
          {
            key: 'zones',
            label: 'Zones',
            content: (
              <div>
                <div className="mb-3 flex justify-end">
                  <button type="button" className="btn-secondary" disabled={busy} onClick={() => void addZone()}>
                    Add zone
                  </button>
                </div>
                <DataTable
                  rows={zones}
                  loading={zones === null}
                  rowKey={(row) => row.id}
                  emptyLabel="No shipping zones yet."
                  columns={[
                    { header: 'Zone', cell: (row) => labelOf(row.translations), className: 'font-medium' },
                    { header: 'Cities', muted: true, cell: (row) => (row.cities.length > 0 ? row.cities.join(', ') : 'Catch-all') },
                    {
                      header: 'Fee',
                      align: 'end',
                      numeric: true,
                      cell: (row) => (row.rates[0] ? formatMoney(row.rates[0].fee) : '—'),
                    },
                    {
                      header: 'Free above',
                      align: 'end',
                      numeric: true,
                      muted: true,
                      cell: (row) => (row.rates[0]?.freeAbove ? formatMoney(row.rates[0].freeAbove) : '—'),
                    },
                  ]}
                />
              </div>
            ),
          },
          {
            key: 'methods',
            label: 'Methods',
            content: (
              <div>
                <div className="mb-3 flex justify-end">
                  <button type="button" className="btn-secondary" disabled={busy} onClick={() => void addMethod()}>
                    Add method
                  </button>
                </div>
                <DataTable
                  rows={methods}
                  loading={methods === null}
                  rowKey={(row) => row.id}
                  emptyLabel="No shipping methods yet."
                  columns={[
                    { header: 'Method', cell: (row) => labelOf(row.translations), className: 'font-medium' },
                    { header: 'Key', muted: true, cell: (row) => row.key },
                    {
                      header: 'ETA',
                      align: 'end',
                      muted: true,
                      cell: (row) => `${row.etaMinDays}–${row.etaMaxDays} days`,
                    },
                  ]}
                />
              </div>
            ),
          },
          {
            key: 'classes',
            label: 'Shipping classes',
            content: (
              <div>
                <div className="mb-3 flex justify-end">
                  <button type="button" className="btn-secondary" disabled={busy} onClick={() => void addClass()}>
                    Add class
                  </button>
                </div>
                <DataTable
                  rows={classes}
                  loading={classes === null}
                  rowKey={(row) => row.id}
                  emptyLabel="No shipping classes yet — every product costs nothing extra to pack."
                  columns={[
                    { header: 'Class', cell: (row) => labelOf(row.translations), className: 'font-medium' },
                    { header: 'Key', muted: true, cell: (row) => row.key },
                    { header: 'Handling fee', align: 'end', numeric: true, cell: (row) => formatMoney(row.handlingFee) },
                  ]}
                />
              </div>
            ),
          },
        ]}
      />
    </>
  );
}
