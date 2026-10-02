'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminFetch } from '@/lib/admin-client';
import { useToast } from '@/hooks/use-toast';
import { ToastStack } from '@/components/admin/toast-stack';
import { Loading } from '@/components/ui';

interface MarketingSettings {
  automationEnabled: boolean;
  abandonedCartReminderHours: number;
  abandonedCartIncentiveHours: number;
  reviewRequestDays: number;
  replenishmentReminderDays: number;
}

export default function MarketingAdminPage() {
  const { toasts, add: addToast, remove: removeToast } = useToast();

  const [settings, setSettings] = useState<MarketingSettings | null>(null);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      setSettings(await adminFetch<MarketingSettings>('/admin/marketing/settings'));
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not load marketing settings', 'error');
    } finally {
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save(patch: Partial<MarketingSettings>) {
    if (!settings) return;
    setSaving(true);
    try {
      const updated = await adminFetch<MarketingSettings>('/admin/marketing/settings', {
        method: 'PUT',
        body: patch,
      });
      setSettings(updated);
      addToast('Marketing settings saved', 'success');
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not save marketing settings', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <ToastStack toasts={toasts} onDismiss={removeToast} />

      <h1 className="mb-1 text-xl font-semibold text-neutral-900">Marketing automation</h1>
      <p className="mb-6 text-sm text-neutral-900/60">
        Off by default. Turning this on lets the store email a logged-in customer automatically —
        an abandoned-cart reminder, a post-delivery review request, a reorder nudge for products
        flagged as consumable. Guest checkouts are never included: there is no account to record
        an unsubscribe against. Every send carries a working unsubscribe link.
      </p>

      {busy && !settings ? (
        <Loading />
      ) : (
        <section className="card p-5">
          <label className="flex items-center gap-2 text-sm font-medium text-neutral-900">
            <input
              type="checkbox"
              checked={settings?.automationEnabled ?? false}
              disabled={saving}
              onChange={(e) => save({ automationEnabled: e.target.checked })}
            />
            Send automated marketing email
          </label>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <NumberField
              label="Abandoned-cart reminder (hours idle)"
              value={settings?.abandonedCartReminderHours}
              disabled={saving}
              onSave={(value) => save({ abandonedCartReminderHours: value })}
            />
            <NumberField
              label="Abandoned-cart incentive follow-up (further hours idle)"
              value={settings?.abandonedCartIncentiveHours}
              disabled={saving}
              onSave={(value) => save({ abandonedCartIncentiveHours: value })}
            />
            <NumberField
              label="Review request (days after delivery)"
              value={settings?.reviewRequestDays}
              disabled={saving}
              onSave={(value) => save({ reviewRequestDays: value })}
            />
            <NumberField
              label="Replenishment reminder (days after delivery)"
              value={settings?.replenishmentReminderDays}
              disabled={saving}
              onSave={(value) => save({ replenishmentReminderDays: value })}
            />
          </div>

          <p className="mt-6 text-xs text-neutral-900/60">
            Flag which products are worth a reorder nudge from the product editor (Consumable /
            repeat-buy).
          </p>
        </section>
      )}
    </>
  );
}

function NumberField({
  label,
  value,
  disabled,
  onSave,
}: {
  label: string;
  value: number | undefined;
  disabled: boolean;
  onSave: (value: number) => void;
}) {
  const [draft, setDraft] = useState(value?.toString() ?? '');

  useEffect(() => {
    setDraft(value?.toString() ?? '');
  }, [value]);

  return (
    <label className="flex flex-col gap-1 text-sm text-neutral-900/80">
      {label}
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={1}
          className="field-input w-28"
          value={draft}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button
          type="button"
          className="btn-ghost px-2 py-1 text-xs"
          disabled={disabled || !draft.trim() || Number(draft) === value}
          onClick={() => onSave(Math.round(Number(draft)))}
        >
          Save
        </button>
      </div>
    </label>
  );
}
