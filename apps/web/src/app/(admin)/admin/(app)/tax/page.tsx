'use client';

import { useCallback, useEffect, useState } from 'react';
import { cn } from '@/utils/cn';
import { adminFetch } from '@/lib/admin-client';
import { useToast } from '@/hooks/use-toast';
import { ConfirmDialog, DataTable, Loading } from '@/components/ui';

interface TaxRate {
  id: string;
  rateBps: number;
  effectiveAt: string;
  endedAt: string | null;
}

interface TaxClass {
  id: string;
  key: string;
  name: string;
  isDefault: boolean;
  rates: TaxRate[]; // list view: current active rate only, if any
}

interface TaxSettings {
  enabled: boolean;
  pricingMode: 'INCLUSIVE' | 'EXCLUSIVE';
  defaultClass: string;
}

/** 1700 -> "17%"; 1750 -> "17.5%". Never shows a rate as a Float in state — only for display. */
function formatRateBps(bps: number): string {
  const percent = bps / 100;
  return `${Number.isInteger(percent) ? percent : percent.toFixed(2)}%`;
}

export default function TaxAdminPage() {
  const { toasts, add: addToast, remove: removeToast } = useToast();

  const [settings, setSettings] = useState<TaxSettings | null>(null);
  const [classes, setClasses] = useState<TaxClass[] | null>(null);
  const [busy, setBusy] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);

  const [newClassKey, setNewClassKey] = useState('');
  const [newClassName, setNewClassName] = useState('');
  const [newClassRate, setNewClassRate] = useState('');
  const [creatingClass, setCreatingClass] = useState(false);

  const [rateDraftByClassId, setRateDraftByClassId] = useState<Record<string, string>>({});
  const [savingRateFor, setSavingRateFor] = useState<string | null>(null);
  const [deletingClassId, setDeletingClassId] = useState<string | null>(null);
  const [deletingClass, setDeletingClass] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [settingsRes, classesRes] = await Promise.all([
        adminFetch<TaxSettings>('/admin/tax/settings'),
        adminFetch<{ data: TaxClass[] }>('/admin/tax/classes'),
      ]);
      setSettings(settingsRes);
      setClasses(classesRes.data);
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not load tax settings', 'error');
    } finally {
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function saveSettings(patch: Partial<TaxSettings>) {
    if (!settings) return;
    setSavingSettings(true);
    try {
      const updated = await adminFetch<TaxSettings>('/admin/tax/settings', {
        method: 'PUT',
        body: patch,
      });
      setSettings(updated);
      addToast('Tax settings saved', 'success');
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not save tax settings', 'error');
    } finally {
      setSavingSettings(false);
    }
  }

  async function createClass() {
    if (!newClassKey.trim() || !newClassName.trim()) {
      addToast('A key and a name are required.', 'error');
      return;
    }
    setCreatingClass(true);
    try {
      await adminFetch('/admin/tax/classes', {
        method: 'POST',
        body: {
          key: newClassKey.trim(),
          name: newClassName.trim(),
          isDefault: (classes?.length ?? 0) === 0,
          rateBps: newClassRate.trim() ? Math.round(Number(newClassRate) * 100) : undefined,
        },
      });
      setNewClassKey('');
      setNewClassName('');
      setNewClassRate('');
      addToast('Tax class created', 'success');
      await load();
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not create tax class', 'error');
    } finally {
      setCreatingClass(false);
    }
  }

  async function addRate(classId: string) {
    const draft = rateDraftByClassId[classId];
    const percent = Number(draft);
    if (!draft?.trim() || Number.isNaN(percent) || percent < 0) {
      addToast('Enter a valid rate, e.g. 17 for 17%.', 'error');
      return;
    }
    setSavingRateFor(classId);
    try {
      await adminFetch(`/admin/tax/classes/${classId}/rates`, {
        method: 'POST',
        body: { rateBps: Math.round(percent * 100) },
      });
      setRateDraftByClassId((prev) => ({ ...prev, [classId]: '' }));
      addToast('Rate updated', 'success');
      await load();
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not update the rate', 'error');
    } finally {
      setSavingRateFor(null);
    }
  }

  async function deleteClass(id: string) {
    setDeletingClass(true);
    try {
      await adminFetch(`/admin/tax/classes/${id}`, { method: 'DELETE' });
      addToast('Tax class deleted', 'success');
      await load();
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not delete this tax class', 'error');
    } finally {
      setDeletingClass(false);
      setDeletingClassId(null);
    }
  }

  return (
    <>
      {toasts.length > 0 && (
        <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
          {toasts.map((t) => (
            <button
              key={t.id}
              className={cn(
                'w-full cursor-pointer rounded-md border p-4 text-start text-sm shadow-md',
                t.type === 'error'
                  ? 'border-red-200 bg-red-50 text-red-800'
                  : t.type === 'success'
                    ? 'border-green-200 bg-green-50 text-green-800'
                    : 'border-blue-200 bg-blue-50 text-blue-800',
              )}
              type="button"
              onClick={() => removeToast(t.id)}
              aria-label={`Dismiss: ${t.message}`}
            >
              {t.message}
            </button>
          ))}
        </div>
      )}

      <h1 className="mb-1 text-xl font-semibold text-neutral-900">Tax</h1>
      <p className="mb-6 text-sm text-neutral-900/60">
        Off by default. Turning it on charges GST at checkout using the classes and rates below —
        see docs/implementation/tax-compliance/15-tax-module.md for the design.
      </p>

      {busy && !settings ? (
        <Loading />
      ) : (
        <>
          <section className="card mb-6 p-5">
            <h2 className="mb-4 text-sm font-semibold text-neutral-900">Settings</h2>
            <div className="flex flex-col gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={settings?.enabled ?? false}
                  disabled={savingSettings}
                  onChange={(e) => saveSettings({ enabled: e.target.checked })}
                />
                Charge tax at checkout
              </label>

              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-neutral-900/80">
                  Pricing mode
                  <select
                    className="field-input"
                    value={settings?.pricingMode ?? 'EXCLUSIVE'}
                    disabled={savingSettings}
                    onChange={(e) =>
                      saveSettings({ pricingMode: e.target.value as 'INCLUSIVE' | 'EXCLUSIVE' })
                    }
                  >
                    <option value="EXCLUSIVE">Exclusive — tax is added at checkout</option>
                    <option value="INCLUSIVE">
                      Inclusive — prices already include tax; nothing the customer pays changes
                    </option>
                  </select>
                </label>

                <label className="flex items-center gap-2 text-sm text-neutral-900/80">
                  Default class
                  <select
                    className="field-input"
                    value={settings?.defaultClass ?? ''}
                    disabled={savingSettings || !classes?.length}
                    onChange={(e) => saveSettings({ defaultClass: e.target.value })}
                  >
                    {classes?.map((taxClass) => (
                      <option key={taxClass.id} value={taxClass.key}>
                        {taxClass.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          </section>

          <section className="overflow-hidden">
            <div className="border-b border-neutral-100 bg-neutral-50 p-4">
              <h2 className="text-sm font-semibold text-neutral-900">Tax classes</h2>
              <p className="text-xs text-neutral-900/60">
                A product variant with no class of its own uses the default class above.
              </p>
            </div>

            <DataTable
              rows={classes}
              rowKey={(taxClass) => taxClass.id}
              emptyLabel="No tax classes yet — add one below."
              columns={[
                {
                  header: 'Name',
                  cell: (taxClass) => (
                    <span className="font-medium">
                      {taxClass.name}
                      {taxClass.isDefault && (
                        <span className="ms-2 rounded bg-neutral-100 px-2 py-0.5 text-xs text-accent-hover">
                          default
                        </span>
                      )}
                    </span>
                  ),
                },
                { header: 'Key', cell: (taxClass) => taxClass.key, muted: true },
                {
                  header: 'Current rate',
                  cell: (taxClass) => {
                    const activeRate = taxClass.rates[0] ?? null;
                    return activeRate ? formatRateBps(activeRate.rateBps) : '—';
                  },
                },
                {
                  header: 'New rate',
                  cell: (taxClass) => (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        placeholder="e.g. 17"
                        className="field-input w-24"
                        value={rateDraftByClassId[taxClass.id] ?? ''}
                        onChange={(e) =>
                          setRateDraftByClassId((prev) => ({
                            ...prev,
                            [taxClass.id]: e.target.value,
                          }))
                        }
                      />
                      <button
                        type="button"
                        className="btn-primary px-3 py-1.5 text-xs"
                        disabled={savingRateFor === taxClass.id}
                        onClick={() => addRate(taxClass.id)}
                      >
                        Set
                      </button>
                    </div>
                  ),
                },
                {
                  header: '',
                  align: 'end',
                  cell: (taxClass) => (
                    <button
                      type="button"
                      className="text-xs text-red-600 hover:underline"
                      onClick={() => setDeletingClassId(taxClass.id)}
                    >
                      Delete
                    </button>
                  ),
                },
              ]}
            />

            <div className="flex flex-wrap items-end gap-3 border-t border-neutral-100 p-4">
              <label className="flex flex-col gap-1 text-xs text-neutral-900/60">
                Key
                <input
                  className="field-input w-32"
                  placeholder="standard"
                  value={newClassKey}
                  onChange={(e) => setNewClassKey(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-neutral-900/60">
                Name
                <input
                  className="field-input w-48"
                  placeholder="Standard rate"
                  value={newClassName}
                  onChange={(e) => setNewClassName(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-neutral-900/60">
                Starting rate %
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className="field-input w-28"
                  placeholder="17"
                  value={newClassRate}
                  onChange={(e) => setNewClassRate(e.target.value)}
                />
              </label>
              <button
                type="button"
                className="btn-primary px-4 py-2 text-sm"
                disabled={creatingClass}
                onClick={createClass}
              >
                Add tax class
              </button>
            </div>
          </section>
        </>
      )}

      <ConfirmDialog
        open={deletingClassId !== null}
        onClose={() => setDeletingClassId(null)}
        onConfirm={() => {
          if (deletingClassId) return deleteClass(deletingClassId);
        }}
        title="Delete this tax class?"
        description="This only works if no product variant uses it — otherwise the delete is refused."
        confirmLabel="Delete"
        busy={deletingClass}
      />
    </>
  );
}
