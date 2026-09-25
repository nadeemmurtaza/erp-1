'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { PageHeader, Loading } from '@/components/ui';
import { customerFetch } from '@/lib/customer-client';

const CHANNELS = ['EMAIL', 'SMS', 'WHATSAPP', 'PUSH'] as const;
const CATEGORIES = ['STITCHING_PROGRESS', 'MARKETING', 'BACK_IN_STOCK'] as const;

interface Cell {
  channel: (typeof CHANNELS)[number];
  category: (typeof CATEGORIES)[number];
  enabled: boolean;
}

/** WO-7.8 — per-channel, per-category. Transactional messages are not opt-out and don't appear here. */
export default function NotificationPreferencesPage() {
  const t = useTranslations('account.notifications');
  const [cells, setCells] = useState<Cell[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    customerFetch<Cell[]>('/notification-preferences').then(setCells).catch(() => setCells([]));
  }, []);

  function toggle(channel: Cell['channel'], category: Cell['category']) {
    setCells((prev) =>
      prev
        ? prev.map((cell) => (cell.channel === channel && cell.category === category ? { ...cell, enabled: !cell.enabled } : cell))
        : prev,
    );
    setSaved(false);
  }

  async function save() {
    if (!cells) return;
    setSaving(true);
    try {
      const updated = await customerFetch<Cell[]>('/notification-preferences', { method: 'PUT', body: { updates: cells } });
      setCells(updated);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  if (cells === null) {
    return (
      <>
        <PageHeader title={t('title')} description={t('body')} />
        <Loading />
      </>
    );
  }

  return (
    <>
      <PageHeader title={t('title')} description={t('body')} />

      <div className="overflow-x-auto">
        <table className="table-flat w-full text-sm">
          <thead>
            <tr>
              <th className="text-start">{t('title')}</th>
              {CHANNELS.map((channel) => (
                <th key={channel} className="text-center">
                  {t(`channel_${channel}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CATEGORIES.map((category) => (
              <tr key={category}>
                <td>{t(`category_${category}`)}</td>
                {CHANNELS.map((channel) => {
                  const cell = cells.find((c) => c.channel === channel && c.category === category);
                  return (
                    <td key={channel} className="text-center">
                      <input
                        type="checkbox"
                        className="field-check"
                        checked={cell?.enabled ?? true}
                        onChange={() => toggle(channel, category)}
                        aria-label={`${t(`category_${category}`)} — ${t(`channel_${channel}`)}`}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button type="button" onClick={save} disabled={saving} className="btn-primary mt-4">
        {saving ? t('saving') : t('save')}
      </button>
      {saved ? <p className="notice notice-success mt-2">{t('saved')}</p> : null}
    </>
  );
}
