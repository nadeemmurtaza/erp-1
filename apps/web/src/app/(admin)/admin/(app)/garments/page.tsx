'use client';

import { useCallback, useEffect, useState } from 'react';
import { Wizard, type WizardStep } from '@/components/common/wizard';
import { adminFetch } from '@/lib/admin-client';
import type { AdminGarmentSizeChartRow, GarmentType, MeasurementFieldRow } from '@/types/api';
import { formatMoney } from '@yaseen/shared';

import { Loading } from '@/components/ui';
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

const SIZE_TOKENS = ['XS', 'S', 'M', 'L', 'XL', 'XXL'] as const;
type SizeToken = (typeof SIZE_TOKENS)[number];

/** Every cell as a string, matching how the rest of this form drives number inputs. */
type SizeChartDraft = Record<SizeToken, Record<string, string>>;

/**
 * The admin list endpoint (GET /admin/measurements/garment-types) doesn't include
 * the sizeChart relation — only the public storefront endpoint does. We still
 * declare it here, optionally, so this page can pick it up for free the day that
 * changes; until then it's always undefined and every read below is guarded.
 */
type GarmentWithSizeChart = GarmentType & { sizeChart?: AdminGarmentSizeChartRow[] };

/**
 * Garment types and the measurements each one asks for.
 *
 * These rows drive every measurement form in the system — storefront, admin and
 * later the mobile app — so adding "cuff width" here makes it appear everywhere
 * without a deploy. Removing a field deactivates it rather than deleting it,
 * because saved profiles and jobs in production still reference it.
 */
export default function AdminGarmentsPage() {
  const [garments, setGarments] = useState<GarmentWithSizeChart[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fields, setFields] = useState<FieldDraft[]>([]);
  const [labelEn, setLabelEn] = useState('');
  const [labelUr, setLabelUr] = useState('');
  // Rupees, not paisa: this one input sits on the customer-facing side of the money
  // boundary. Everything stored and priced elsewhere is integer paisa, so the value is
  // divided by 100 on load and multiplied back on save.
  const [stitchingPrice, setStitchingPrice] = useState('0');
  const [stitchingEnabled, setStitchingEnabled] = useState(true);
  // Plain Float, not money: a fabric-length benchmark in Gaz (yards). Unlike the Rs
  // field above, this one is never paisa and never gets a x100/÷100 conversion.
  const [baseFabricGaz, setBaseFabricGaz] = useState('');
  // Comma-separated in the UI, string[] on the wire — split/joined at the form edges.
  const [aliasesEn, setAliasesEn] = useState('');
  const [aliasesUr, setAliasesUr] = useState('');
  const [sizeChart, setSizeChart] = useState<SizeChartDraft>(emptySizeChart());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sizeBusy, setSizeBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const loaded = await adminFetch<GarmentWithSizeChart[]>('/admin/measurements/garment-types');
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
    setStitchingPrice(String(garment.stitchingPrice / 100));
    setStitchingEnabled(garment.stitchingEnabled);
    setBaseFabricGaz(garment.baseFabricGaz === null ? '' : String(garment.baseFabricGaz));
    setAliasesEn(garment.aliasesEn.join(', '));
    setAliasesUr(garment.aliasesUr.join(', '));
    setFields(garment.fields.map(toDraft));
    setSizeChart(toSizeChartDraft(garment.sizeChart));
  }, [selectedId, garments]);

  async function save() {
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
          stitchingPrice: Math.round(Number(stitchingPrice || 0) * 100),
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

  const selected = garments.find((garment) => garment.id === selectedId);
  const activeFields = selected?.fields.filter((field) => field.isActive) ?? [];

  async function saveSizeChart(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedId) return;

    setError(null);
    setNotice(null);
    setSizeBusy(true);

    try {
      // Skip rows where every cell is blank — the endpoint replaces only the sizes
      // it's sent, so a garment with no XXL wearers yet can just omit that row.
      const rows = SIZE_TOKENS.map((sizeToken) => ({
        sizeToken,
        values: activeFields.reduce<Record<string, number>>((values, field) => {
          const raw = sizeChart[sizeToken][field.key];
          if (raw !== undefined && raw.trim() !== '') values[field.key] = Number(raw);
          return values;
        }, {}),
      })).filter((row) => Object.keys(row.values).length > 0);

      const saved = await adminFetch<AdminGarmentSizeChartRow[]>(
        `/admin/measurements/garment-types/${selectedId}/size-chart`,
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

  return (
    <>
      <h1 className="mb-1 text-xl font-semibold text-neutral-900">Garments &amp; measurements</h1>
      <p className="mb-6 text-sm text-neutral-900/60">
        What the tailor needs for each garment. Changes apply everywhere immediately.
      </p>

      {error ? (
        <p role="alert" className="card mb-4 whitespace-pre-line p-4 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="card mb-4 p-4 text-sm text-accent-hover">{notice}</p>
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
                      ? 'w-full rounded-md bg-neutral-50 px-3 py-2 text-start text-sm font-medium text-accent-hover'
                      : 'w-full rounded-md px-3 py-2 text-start text-sm text-neutral-900/75 hover:bg-white'
                  }
                >
                  {garment.labelEn}
                  <span className="block text-xs text-neutral-900/40">
                    {garment.fields.filter((field) => field.isActive).length} measurements ·{' '}
                    {formatMoney(garment.stitchingPrice)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {selected ? (
          <div className="space-y-6">
            <div className="card p-4">
              <GarmentWizard
                key={selectedId}
                labelEn={labelEn}
                setLabelEn={setLabelEn}
                labelUr={labelUr}
                setLabelUr={setLabelUr}
                stitchingPrice={stitchingPrice}
                setStitchingPrice={setStitchingPrice}
                stitchingEnabled={stitchingEnabled}
                setStitchingEnabled={setStitchingEnabled}
                baseFabricGaz={baseFabricGaz}
                setBaseFabricGaz={setBaseFabricGaz}
                aliasesEn={aliasesEn}
                setAliasesEn={setAliasesEn}
                aliasesUr={aliasesUr}
                setAliasesUr={setAliasesUr}
                fields={fields}
                setFields={setFields}
                busy={busy}
                onSave={save}
              />
            </div>

            <form onSubmit={saveSizeChart} className="card p-4">
              <h2 className="text-sm font-semibold text-neutral-900">Standard sizes (RTW)</h2>
              <p className="mb-4 mt-1 text-xs text-neutral-900/50">
                For customers who don&apos;t know their measurements. Fill in the sizes you
                stock — a size left blank isn&apos;t offered as a quick pick for this garment.
              </p>

              {activeFields.length === 0 ? (
                <p className="text-sm text-neutral-900/50">
                  Add at least one measurement above before setting standard sizes.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr>
                        <th className="p-2 text-start text-xs font-medium text-neutral-900/50">Size</th>
                        {activeFields.map((field) => (
                          <th
                            key={field.id}
                            className="p-2 text-start text-xs font-medium text-neutral-900/50"
                          >
                            {field.labelEn} ({field.unit === 'INCH' ? 'in' : 'cm'})
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {SIZE_TOKENS.map((sizeToken) => (
                        <tr key={sizeToken} className="border-t border-neutral-100">
                          <td className="p-2 text-sm font-medium text-neutral-900/70">{sizeToken}</td>
                          {activeFields.map((field) => (
                            <td key={field.id} className="p-2">
                              <input
                                type="number"
                                step="0.25"
                                value={sizeChart[sizeToken][field.key] ?? ''}
                                onChange={(event) =>
                                  patchSizeCell(sizeToken, field.key, event.target.value)
                                }
                                className="field-input py-1 text-sm"
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="mt-4 border-t border-neutral-100 pt-4">
                <button
                  type="submit"
                  disabled={sizeBusy || activeFields.length === 0}
                  className="btn-primary"
                >
                  {sizeBusy ? 'Saving…' : 'Save sizes'}
                </button>
              </div>
            </form>
          </div>
        ) : (
          <Loading />
        )}
      </div>
    </>
  );
}

/** The garment editor's own two-step wizard: basics, then its measurement fields. */
function GarmentWizard({
  labelEn,
  setLabelEn,
  labelUr,
  setLabelUr,
  stitchingPrice,
  setStitchingPrice,
  stitchingEnabled,
  setStitchingEnabled,
  baseFabricGaz,
  setBaseFabricGaz,
  aliasesEn,
  setAliasesEn,
  aliasesUr,
  setAliasesUr,
  fields,
  setFields,
  busy,
  onSave,
}: {
  labelEn: string;
  setLabelEn: (value: string) => void;
  labelUr: string;
  setLabelUr: (value: string) => void;
  stitchingPrice: string;
  setStitchingPrice: (value: string) => void;
  stitchingEnabled: boolean;
  setStitchingEnabled: (value: boolean) => void;
  baseFabricGaz: string;
  setBaseFabricGaz: (value: string) => void;
  aliasesEn: string;
  setAliasesEn: (value: string) => void;
  aliasesUr: string;
  setAliasesUr: (value: string) => void;
  fields: FieldDraft[];
  setFields: React.Dispatch<React.SetStateAction<FieldDraft[]>>;
  busy: boolean;
  onSave: () => void;
}) {
  const steps: WizardStep[] = [
    {
      id: 'basics',
      label: 'Basics',
      isValid: Boolean(labelEn.trim() && labelUr.trim() && stitchingPrice.trim()),
      content: (
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
            <span className="mt-1 block text-xs text-neutral-900/50">
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
            <span className="mt-1 block text-xs text-neutral-900/50">
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
            <span className="mt-1 block text-xs text-neutral-900/50">
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
            <span className="mt-1 block text-xs text-neutral-900/50">Comma-separated.</span>
          </label>
          <label className="block" dir="rtl">
            <span className="field-label">بھی کہا جاتا ہے (اردو)</span>
            <input
              value={aliasesUr}
              onChange={(event) => setAliasesUr(event.target.value)}
              className="field-input font-urdu"
            />
            <span className="mt-1 block text-xs text-neutral-900/50" dir="ltr">
              Comma-separated.
            </span>
          </label>
        </div>
      ),
    },
    {
      id: 'measurements',
      label: 'Measurements',
      isValid: true,
      content: (
        <div>
          <div className="space-y-2">
            {fields.map((field, index) => (
              <div
                key={`${field.key}-${index}`}
                className={
                  field.isActive
                    ? 'grid items-end gap-2 rounded-md border border-neutral-100 p-2 sm:grid-cols-7'
                    : 'grid items-end gap-2 rounded-md border border-neutral-100 bg-neutral-50 p-2 opacity-60 sm:grid-cols-7'
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
  ];

  return (
    <Wizard
      steps={steps}
      onSubmit={onSave}
      submitLabel={busy ? 'Saving…' : 'Save garment'}
      submitBusy={busy}
      submitDisabled={busy}
      accentClassName="bg-accent-hover text-white"
    />
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

function emptySizeChart(): SizeChartDraft {
  return { XS: {}, S: {}, M: {}, L: {}, XL: {}, XXL: {} };
}

/** Every value stringified for the number inputs; missing rows stay empty. */
function toSizeChartDraft(rows: AdminGarmentSizeChartRow[] | undefined): SizeChartDraft {
  const draft = emptySizeChart();
  for (const row of rows ?? []) {
    draft[row.sizeToken] = Object.fromEntries(
      Object.entries(row.values).map(([key, value]) => [key, String(value)]),
    );
  }
  return draft;
}

function splitAliases(value: string): string[] {
  return value
    .split(',')
    .map((alias) => alias.trim())
    .filter((alias) => alias.length > 0);
}

function Small({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-neutral-900/50">{label}</span>
      {children}
    </label>
  );
}
