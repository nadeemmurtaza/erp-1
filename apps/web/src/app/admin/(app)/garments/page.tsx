'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminFetch } from '@/lib/admin-client';
import type { GarmentType, MeasurementFieldRow } from '@/lib/api-types';

interface FieldDraft {
  key: string;
  labelEn: string;
  labelUr: string;
  unit: 'INCH' | 'CM';
  min: string;
  max: string;
  required: boolean;
  isActive: boolean;
}

/**
 * Garment types and the measurements each one asks for.
 *
 * These rows drive every measurement form in the system — storefront, admin and
 * later the mobile app — so adding "cuff width" here makes it appear everywhere
 * without a deploy. Removing a field deactivates it rather than deleting it,
 * because saved profiles and jobs in production still reference it.
 */
export default function AdminGarmentsPage() {
  const [garments, setGarments] = useState<GarmentType[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fields, setFields] = useState<FieldDraft[]>([]);
  const [labelEn, setLabelEn] = useState('');
  const [labelUr, setLabelUr] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const loaded = await adminFetch<GarmentType[]>('/admin/measurements/garment-types');
      setGarments(loaded);
      setSelectedId((current) => current ?? loaded[0]?.id ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load garment types');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const garment = garments.find((candidate) => candidate.id === selectedId);
    if (!garment) return;

    setLabelEn(garment.labelEn);
    setLabelUr(garment.labelUr);
    setFields(garment.fields.map(toDraft));
  }, [selectedId, garments]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedId) return;

    setError(null);
    setNotice(null);
    setBusy(true);

    try {
      await adminFetch(`/admin/measurements/garment-types/${selectedId}`, {
        method: 'PATCH',
        body: {
          key: garments.find((g) => g.id === selectedId)!.key,
          labelEn: labelEn.trim(),
          labelUr: labelUr.trim(),
          fields: fields.map((field, index) => ({
            key: field.key.trim(),
            labelEn: field.labelEn.trim(),
            labelUr: field.labelUr.trim(),
            unit: field.unit,
            min: Number(field.min),
            max: Number(field.max),
            required: field.required,
            order: index,
            isActive: field.isActive,
          })),
        },
      });

      setNotice('Saved. Every measurement form now uses these fields.');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the garment type');
    } finally {
      setBusy(false);
    }
  }

  const selected = garments.find((garment) => garment.id === selectedId);

  return (
    <>
      <h1 className="mb-1 text-xl font-semibold text-ink">Garments &amp; measurements</h1>
      <p className="mb-6 text-sm text-ink/60">
        What the tailor needs for each garment. Changes apply everywhere immediately.
      </p>

      {error ? (
        <p role="alert" className="card mb-4 whitespace-pre-line p-4 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="card mb-4 p-4 text-sm text-brand-800">{notice}</p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[14rem_1fr]">
        <nav className="card h-fit p-2">
          <ul className="space-y-0.5">
            {garments.map((garment) => (
              <li key={garment.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(garment.id)}
                  className={
                    garment.id === selectedId
                      ? 'w-full rounded-md bg-brand-50 px-3 py-2 text-start text-sm font-medium text-brand-800'
                      : 'w-full rounded-md px-3 py-2 text-start text-sm text-ink/75 hover:bg-sand-100'
                  }
                >
                  {garment.labelEn}
                  <span className="block text-xs text-ink/40">
                    {garment.fields.filter((field) => field.isActive).length} measurements
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {selected ? (
          <form onSubmit={save} className="card p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="field-label">Name (English)</span>
                <input
                  value={labelEn}
                  onChange={(event) => setLabelEn(event.target.value)}
                  className="field-input"
                  required
                />
              </label>
              <label className="block" dir="rtl">
                <span className="field-label">نام (اردو)</span>
                <input
                  value={labelUr}
                  onChange={(event) => setLabelUr(event.target.value)}
                  className="field-input font-urdu"
                  required
                />
              </label>
            </div>

            <h2 className="mb-2 mt-6 text-sm font-semibold text-ink">Measurements</h2>
            <div className="space-y-2">
              {fields.map((field, index) => (
                <div
                  key={`${field.key}-${index}`}
                  className={
                    field.isActive
                      ? 'grid items-end gap-2 rounded-md border border-sand-200 p-2 sm:grid-cols-7'
                      : 'grid items-end gap-2 rounded-md border border-sand-200 bg-sand-50 p-2 opacity-60 sm:grid-cols-7'
                  }
                >
                  <Small label="Key">
                    <input
                      value={field.key}
                      onChange={(event) => patch(setFields, index, { key: event.target.value })}
                      className="field-input py-1 text-sm"
                    />
                  </Small>
                  <Small label="English">
                    <input
                      value={field.labelEn}
                      onChange={(event) =>
                        patch(setFields, index, { labelEn: event.target.value })
                      }
                      className="field-input py-1 text-sm"
                    />
                  </Small>
                  <Small label="اردو">
                    <input
                      value={field.labelUr}
                      onChange={(event) =>
                        patch(setFields, index, { labelUr: event.target.value })
                      }
                      dir="rtl"
                      className="field-input py-1 font-urdu text-sm"
                    />
                  </Small>
                  <Small label="Unit">
                    <select
                      value={field.unit}
                      onChange={(event) =>
                        patch(setFields, index, { unit: event.target.value as 'INCH' | 'CM' })
                      }
                      className="field-input py-1 text-sm"
                    >
                      <option value="INCH">inch</option>
                      <option value="CM">cm</option>
                    </select>
                  </Small>
                  <Small label="Min">
                    <input
                      type="number"
                      step="0.25"
                      value={field.min}
                      onChange={(event) => patch(setFields, index, { min: event.target.value })}
                      className="field-input py-1 text-sm"
                    />
                  </Small>
                  <Small label="Max">
                    <input
                      type="number"
                      step="0.25"
                      value={field.max}
                      onChange={(event) => patch(setFields, index, { max: event.target.value })}
                      className="field-input py-1 text-sm"
                    />
                  </Small>
                  <div className="flex items-center gap-3 pb-1">
                    <label className="flex items-center gap-1 text-xs text-ink/70">
                      <input
                        type="checkbox"
                        checked={field.required}
                        onChange={(event) =>
                          patch(setFields, index, { required: event.target.checked })
                        }
                        className="rounded border-sand-300 text-brand-600 focus:ring-brand-500"
                      />
                      Required
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        patch(setFields, index, { isActive: !field.isActive })
                      }
                      className="text-xs text-ink/60 hover:text-ink"
                    >
                      {field.isActive ? 'Retire' : 'Restore'}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() =>
                setFields((current) => [
                  ...current,
                  {
                    key: '',
                    labelEn: '',
                    labelUr: '',
                    unit: 'INCH',
                    min: '1',
                    max: '100',
                    required: true,
                    isActive: true,
                  },
                ])
              }
              className="btn-secondary mt-3"
            >
              Add measurement
            </button>

            <div className="mt-6 border-t border-sand-200 pt-4">
              <button type="submit" disabled={busy} className="btn-primary">
                {busy ? 'Saving…' : 'Save garment'}
              </button>
            </div>
          </form>
        ) : (
          <p className="text-sm text-ink/50">Loading…</p>
        )}
      </div>
    </>
  );
}

function toDraft(field: MeasurementFieldRow): FieldDraft {
  return {
    key: field.key,
    labelEn: field.labelEn,
    labelUr: field.labelUr,
    unit: field.unit,
    min: String(field.min),
    max: String(field.max),
    required: field.required,
    isActive: field.isActive,
  };
}

function patch(
  setFields: React.Dispatch<React.SetStateAction<FieldDraft[]>>,
  index: number,
  changes: Partial<FieldDraft>,
): void {
  setFields((current) =>
    current.map((field, position) => (position === index ? { ...field, ...changes } : field)),
  );
}

function Small({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-ink/50">{label}</span>
      {children}
    </label>
  );
}
