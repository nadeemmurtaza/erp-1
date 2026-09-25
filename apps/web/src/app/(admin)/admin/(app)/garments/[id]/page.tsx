'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { toMajor, toMinor } from '@newax/shared';
import { adminFetch } from '@/lib/admin-client';
import type { AdminGarmentSizeChartRow } from '@/types/api';
import { DataTable, Loading, PageHeader, SectionRail } from '@/components/ui';
import {
  SIZE_TOKENS,
  emptySizeChart,
  splitAliases,
  toDraft,
  toSizeChartDraft,
  type FieldDraft,
  type GarmentWithSizeChart,
  type SizeChartDraft,
  type SizeToken,
} from '@/utils/garment-drafts';

/**
 * One garment: what it is called, what it costs, and what the tailor measures.
 *
 * This was the right-hand two-thirds of a page that also held a picker for
 * every other garment. The sections are the same ones — they were a wizard's
 * two steps plus a form underneath — but they are a rail now rather than a
 * sequence, because editing a garment is not a procedure with an order. An
 * admin fixing a price should not walk past the measurement editor to reach
 * it, and the wizard made them do exactly that.
 *
 * Two saves, not one, and deliberately: the fields and the size chart are
 * separate endpoints, and the size-chart PUT replaces whichever rows it is
 * sent. Folding them into one button would mean rewriting the size chart
 * every time somebody corrected a typo in the Urdu name.
 */
export default function AdminGarmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [garment, setGarment] = useState<GarmentWithSizeChart | null>(null);
  const [fields, setFields] = useState<FieldDraft[]>([]);
  const [labelEn, setLabelEn] = useState('');
  const [labelUr, setLabelUr] = useState('');
  // Rupees, not paisa: this input sits on the customer-facing side of the money
  // boundary. Everything stored and priced elsewhere is integer paisa, so the
  // value is divided by 100 on load and multiplied back on save.
  const [stitchingPrice, setStitchingPrice] = useState('0');
  const [stitchingEnabled, setStitchingEnabled] = useState(true);
  // Plain Float, not money: a fabric-length benchmark in Gaz (yards). Unlike the
  // Rs field above, this one never gets a x100 conversion.
  const [baseFabricGaz, setBaseFabricGaz] = useState('');
  // Comma-separated in the UI, string[] on the wire — split/joined at the edges.
  const [aliasesEn, setAliasesEn] = useState('');
  const [aliasesUr, setAliasesUr] = useState('');
  const [sizeChart, setSizeChart] = useState<SizeChartDraft>(emptySizeChart());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sizeBusy, setSizeBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const all = await adminFetch<GarmentWithSizeChart[]>('/admin/measurements/garment-types');
      const found = all.find((candidate) => candidate.id === id) ?? null;
      setGarment(found);
      if (!found) {
        setError('That garment no longer exists.');
        return;
      }

      setLabelEn(found.labelEn);
      setLabelUr(found.labelUr);
      setStitchingPrice(String(toMajor(found.stitchingPrice)));
      setStitchingEnabled(found.stitchingEnabled);
      setBaseFabricGaz(found.baseFabricGaz === null ? '' : String(found.baseFabricGaz));
      setAliasesEn(found.aliasesEn.join(', '));
      setAliasesUr(found.aliasesUr.join(', '));
      setFields(found.fields.map(toDraft));
      setSizeChart(toSizeChartDraft(found.sizeChart));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the garment');
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeFields = garment?.fields.filter((field) => field.isActive) ?? [];

  async function save() {
    if (!garment) return;

    setError(null);
    setNotice(null);
    setBusy(true);

    try {
      await adminFetch(`/admin/measurements/garment-types/${id}`, {
        method: 'PATCH',
        body: {
          key: garment.key,
          labelEn: labelEn.trim(),
          labelUr: labelUr.trim(),
          stitchingPrice: toMinor(Number(stitchingPrice || 0)),
          stitchingEnabled,
          baseFabricGaz: baseFabricGaz.trim() === '' ? undefined : Number(baseFabricGaz),
          aliasesEn: splitAliases(aliasesEn),
          aliasesUr: splitAliases(aliasesUr),
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

  async function saveSizeChart(event: React.FormEvent) {
    event.preventDefault();

    setError(null);
    setNotice(null);
    setSizeBusy(true);

    try {
      // Skip rows where every cell is blank — the endpoint replaces only the
      // sizes it's sent, so a garment with no XXL wearers yet can omit that row.
      const rows = SIZE_TOKENS.map((sizeToken) => ({
        sizeToken,
        values: activeFields.reduce<Record<string, number>>((values, field) => {
          const raw = sizeChart[sizeToken][field.key];
          if (raw !== undefined && raw.trim() !== '') values[field.key] = Number(raw);
          return values;
        }, {}),
      })).filter((row) => Object.keys(row.values).length > 0);

      const saved = await adminFetch<AdminGarmentSizeChartRow[]>(
        `/admin/measurements/garment-types/${id}/size-chart`,
        { method: 'PUT', body: rows },
      );

      setSizeChart(toSizeChartDraft(saved));
      setNotice('Standard sizes saved.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save standard sizes');
    } finally {
      setSizeBusy(false);
    }
  }

  function patchSizeCell(sizeToken: SizeToken, fieldKey: string, value: string): void {
    setSizeChart((current) => ({
      ...current,
      [sizeToken]: { ...current[sizeToken], [fieldKey]: value },
    }));
  }

  if (!garment) {
    return (
      <>
        <PageHeader title="Garment" />
        {error ? (
          <p role="alert" className="text-sm text-feedback-negative">
            {error}
          </p>
        ) : (
          <Loading />
        )}
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={garment.labelEn}
        action={
          <button type="button" onClick={() => void save()} disabled={busy} className="btn-primary">
            {busy ? 'Saving…' : 'Save garment'}
          </button>
        }
      />

      {error ? (
        <p role="alert" className="mb-6 whitespace-pre-line text-sm text-feedback-negative">
          {error}
        </p>
      ) : null}
      {notice ? <p className="mb-6 text-sm text-feedback-positive">{notice}</p> : null}

      <SectionRail
        label="Garment sections"
        sections={[
          {
            id: 'details',
            label: 'Details',
            content: (
              <div className="grid max-w-3xl gap-5 sm:grid-cols-2">
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

                <label className="block">
                  <span className="field-label">Stitching fee (Rs)</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={stitchingPrice}
                    onChange={(event) => setStitchingPrice(event.target.value)}
                    className="field-input"
                    required
                  />
                  <span className="mt-1 block text-xs text-neutral-900/60">
                    Charged when the customer picks no premium stitching service.
                  </span>
                </label>

                <div className="block">
                  <span className="field-label">Offered for stitching</span>
                  <label className="flex items-center gap-2 text-sm text-neutral-900/70">
                    <input
                      type="checkbox"
                      checked={stitchingEnabled}
                      onChange={(event) => setStitchingEnabled(event.target.checked)}
                      className="field-check"
                    />
                    Show in the stitching flow
                  </label>
                  <span className="mt-1 block text-xs text-neutral-900/60">
                    Unticking hides this garment from customers without deleting anything.
                  </span>
                </div>

                <label className="block">
                  <span className="field-label">Base fabric (Gaz)</span>
                  <input
                    type="number"
                    min="0"
                    step="0.25"
                    value={baseFabricGaz}
                    onChange={(event) => setBaseFabricGaz(event.target.value)}
                    className="field-input"
                  />
                  <span className="mt-1 block text-xs text-neutral-900/60">
                    Flat fabric benchmark, used when the yardage formula doesn&apos;t apply.
                  </span>
                </label>

                <label className="block">
                  <span className="field-label">Also known as (English)</span>
                  <input
                    value={aliasesEn}
                    onChange={(event) => setAliasesEn(event.target.value)}
                    placeholder="Anarkali, Panel Dress, Gown"
                    className="field-input"
                  />
                  <span className="mt-1 block text-xs text-neutral-900/60">Comma-separated.</span>
                </label>

                <label className="block" dir="rtl">
                  <span className="field-label">بھی کہا جاتا ہے (اردو)</span>
                  <input
                    value={aliasesUr}
                    onChange={(event) => setAliasesUr(event.target.value)}
                    className="field-input font-urdu"
                  />
                  <span className="mt-1 block text-xs text-neutral-900/60" dir="ltr">
                    Comma-separated.
                  </span>
                </label>
              </div>
            ),
          },
          {
            id: 'measurements',
            label: 'Measurements',
            badge: fields.filter((field) => field.isActive).length,
            content: (
              <div>
                <p className="mb-4 max-w-prose text-sm text-neutral-900/60">
                  These drive every measurement form in the system. Retiring a field keeps it on
                  saved profiles and jobs that already reference it.
                </p>

                <div className="space-y-2">
                  {fields.map((field, index) => (
                    <div
                      key={`${field.key}-${index}`}
                      className={
                        field.isActive
                          ? 'grid items-end gap-2 border border-neutral-100 p-2 sm:grid-cols-7 [&>*]:min-w-0'
                          : 'grid items-end gap-2 border border-neutral-100 bg-neutral-50 p-2 opacity-60 sm:grid-cols-7 [&>*]:min-w-0'
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
                      <div className="flex flex-wrap items-center gap-3 pb-1">
                        <label className="flex items-center gap-1 text-xs text-neutral-900/70">
                          <input
                            type="checkbox"
                            checked={field.required}
                            onChange={(event) =>
                              patch(setFields, index, { required: event.target.checked })
                            }
                            className="field-check"
                          />
                          Required
                        </label>
                        <button
                          type="button"
                          onClick={() => patch(setFields, index, { isActive: !field.isActive })}
                          className="text-xs text-neutral-900/60 hover:text-neutral-900"
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
              </div>
            ),
          },
          {
            id: 'sizes',
            label: 'Standard sizes',
            content: (
              <form onSubmit={saveSizeChart}>
                <p className="mb-4 max-w-prose text-sm text-neutral-900/60">
                  For customers who don&apos;t know their measurements. A size left blank
                  isn&apos;t offered as a quick pick for this garment.
                </p>

                {activeFields.length === 0 ? (
                  <p className="text-sm text-neutral-900/60">
                    Add at least one measurement and save before setting standard sizes.
                  </p>
                ) : (
                  <>
                    <DataTable<SizeToken>
                      rows={[...SIZE_TOKENS]}
                      rowKey={(sizeToken) => sizeToken}
                      columns={[
                        {
                          header: 'Size',
                          cell: (sizeToken) => (
                            <span className="font-medium text-neutral-900/70">{sizeToken}</span>
                          ),
                        },
                        ...activeFields.map((field) => ({
                          header: `${field.labelEn} (${field.unit === 'INCH' ? 'in' : 'cm'})`,
                          cell: (sizeToken: SizeToken) => (
                            <input
                              type="number"
                              step="0.25"
                              aria-label={`${sizeToken} ${field.labelEn}`}
                              value={sizeChart[sizeToken][field.key] ?? ''}
                              onChange={(event) =>
                                patchSizeCell(sizeToken, field.key, event.target.value)
                              }
                              className="field-input py-1 text-sm"
                            />
                          ),
                        })),
                      ]}
                    />

                    <button type="submit" disabled={sizeBusy} className="btn-secondary mt-4">
                      {sizeBusy ? 'Saving…' : 'Save sizes'}
                    </button>
                  </>
                )}
              </form>
            ),
          },
        ]}
      />
    </>
  );
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
      <span className="mb-1 block text-xs text-neutral-900/60">{label}</span>
      {children}
    </label>
  );
}
