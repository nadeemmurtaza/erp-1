'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { adminFetch } from '@/lib/admin-client';
import { Disclosure, Loading, PageHeader, SectionRail } from '@/components/ui';
import { ROUTES } from '@/constants/routes';
import {
  ANYWHERE,
  AREAS,
  isBlankOption,
  toOptionDraft,
  toPaisa,
  type DesignArea,
  type GroupDraft,
  type OptionDraft,
} from '@/utils/design-drafts';
import type { AdminStitchingOptionGroup, GarmentType } from '@/types/api';

/**
 * One style question, and the answers a customer can give it.
 *
 * The wizard this replaces made basics and choices a sequence, which they are
 * not — the usual job here is adding an option to a question that exists,
 * and that sat behind a "next" button. Rail sections instead, both present.
 *
 * Retiring lives behind a disclosure because it is rare and reversible but
 * changes what customers see. It hides the group from the storefront while
 * leaving its options arranged, so restoring brings the whole question back
 * as it was.
 */
export default function AdminDesignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [group, setGroup] = useState<AdminStitchingOptionGroup | null>(null);
  const [garments, setGarments] = useState<GarmentType[]>([]);
  const [draft, setDraft] = useState<GroupDraft | null>(null);
  const [options, setOptions] = useState<OptionDraft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [loadedGroups, loadedGarments] = await Promise.all([
        adminFetch<AdminStitchingOptionGroup[]>('/admin/stitching/option-groups'),
        adminFetch<GarmentType[]>('/admin/measurements/garment-types'),
      ]);
      setGarments(loadedGarments);

      const found = loadedGroups.find((candidate) => candidate.id === id) ?? null;
      setGroup(found);
      if (!found) {
        setError('That design group no longer exists.');
        return;
      }

      setDraft({
        labelEn: found.labelEn,
        labelUr: found.labelUr,
        area: found.area ?? '',
        garmentTypeId: found.garmentTypeId ?? '',
        selectionType: found.selectionType,
        required: found.required,
        allowCustomText: found.allowCustomText,
        helpEn: found.helpEn ?? '',
        helpUr: found.helpUr ?? '',
        isActive: found.isActive,
      });
      setOptions(found.options.map(toOptionDraft));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the design group');
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!draft) return;

    setError(null);
    setNotice(null);
    setBusy(true);

    try {
      await adminFetch(`/admin/stitching/option-groups/${id}`, {
        method: 'PATCH',
        body: {
          labelEn: draft.labelEn.trim(),
          labelUr: draft.labelUr.trim(),
          // Explicit null clears the column; omitting the key would leave the
          // stored value alone, which is not what an emptied select means.
          area: draft.area === '' ? null : draft.area,
          garmentTypeId: draft.garmentTypeId === '' ? null : draft.garmentTypeId,
          selectionType: draft.selectionType,
          required: draft.required,
          allowCustomText: draft.allowCustomText,
          helpEn: draft.helpEn.trim() || null,
          helpUr: draft.helpUr.trim() || null,
          isActive: draft.isActive,
        },
      });

      // Options save one row at a time — the group endpoint takes no nested
      // list. `order` goes out explicitly so the on-screen order is the order
      // the storefront renders, instead of the append order the API defaults to.
      let position = 0;
      for (const option of options) {
        if (isBlankOption(option)) continue;

        const body = {
          key: option.key.trim(),
          labelEn: option.labelEn.trim(),
          labelUr: option.labelUr.trim(),
          priceDelta: toPaisa(option.priceDelta),
          imageUrl: option.imageUrl.trim() || null,
          order: position,
          isActive: option.isActive,
        };

        if (option.id) {
          await adminFetch(`/admin/stitching/options/${option.id}`, { method: 'PATCH', body });
        } else {
          await adminFetch(`/admin/stitching/option-groups/${id}/options`, { method: 'POST', body });
        }
        position += 1;
      }

      setNotice('Saved. The stitching panel now offers these choices.');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the design group');
    } finally {
      setBusy(false);
    }
  }

  const back = (
    <Link href={ROUTES.admin.designs} className="hover:text-neutral-900">
      &larr; Stitching designs
    </Link>
  );

  if (!group || !draft) {
    return (
      <>
        <PageHeader title="Design group" context={back} />
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
        title={group.labelEn}
        context={back}
        action={
          <button type="button" onClick={() => void save()} disabled={busy} className="btn-primary">
            {busy ? 'Saving…' : 'Save design group'}
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
        label="Design group sections"
        sections={[
          {
            id: 'question',
            label: 'The question',
            content: (
              <div className="max-w-3xl">
                <label className="mb-5 block sm:max-w-xs">
                  <span className="field-label">Key</span>
                  <input
                    value={group.key}
                    readOnly
                    className="field-input bg-neutral-50 text-neutral-900/60"
                  />
                  <span className="mt-1 block text-xs text-neutral-900/50">
                    Fixed — open carts store their custom notes against it.
                  </span>
                </label>

                <div className="grid gap-5 sm:grid-cols-2">
                  <label className="block">
                    <span className="field-label">Question (English)</span>
                    <input
                      value={draft.labelEn}
                      onChange={(event) => setDraft({ ...draft, labelEn: event.target.value })}
                      className="field-input"
                      required
                    />
                  </label>

                  <label className="block" dir="rtl">
                    <span className="field-label">سوال (اردو)</span>
                    <input
                      value={draft.labelUr}
                      onChange={(event) => setDraft({ ...draft, labelUr: event.target.value })}
                      className="field-input font-urdu"
                      required
                    />
                  </label>

                  <label className="block">
                    <span className="field-label">Part of the garment</span>
                    <select
                      value={draft.area}
                      onChange={(event) =>
                        setDraft({ ...draft, area: event.target.value as DesignArea | '' })
                      }
                      className="field-input"
                    >
                      <option value="">{ANYWHERE}</option>
                      {AREAS.map((area) => (
                        <option key={area.value} value={area.value}>
                          {area.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="field-label">Asked for</span>
                    <select
                      value={draft.garmentTypeId}
                      onChange={(event) => setDraft({ ...draft, garmentTypeId: event.target.value })}
                      className="field-input"
                    >
                      <option value="">Every garment</option>
                      {garments.map((garment) => (
                        <option key={garment.id} value={garment.id}>
                          {garment.labelEn}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="field-label">Answers allowed</span>
                    <select
                      value={draft.selectionType}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          selectionType: event.target.value as 'SINGLE' | 'MULTI',
                        })
                      }
                      className="field-input"
                    >
                      <option value="SINGLE">One choice</option>
                      <option value="MULTI">Several choices</option>
                    </select>
                  </label>

                  <div className="flex flex-wrap items-center gap-4 pt-6">
                    <label className="flex items-center gap-2 text-sm text-neutral-900/70">
                      <input
                        type="checkbox"
                        checked={draft.required}
                        onChange={(event) => setDraft({ ...draft, required: event.target.checked })}
                        className="field-check"
                      />
                      Required
                    </label>
                    <label className="flex items-center gap-2 text-sm text-neutral-900/70">
                      <input
                        type="checkbox"
                        checked={draft.allowCustomText}
                        onChange={(event) =>
                          setDraft({ ...draft, allowCustomText: event.target.checked })
                        }
                        className="field-check"
                      />
                      Allow a custom description
                    </label>
                  </div>

                  <label className="block">
                    <span className="field-label">Hint (English)</span>
                    <input
                      value={draft.helpEn}
                      onChange={(event) => setDraft({ ...draft, helpEn: event.target.value })}
                      className="field-input"
                      maxLength={200}
                    />
                  </label>

                  <label className="block" dir="rtl">
                    <span className="field-label">اشارہ (اردو)</span>
                    <input
                      value={draft.helpUr}
                      onChange={(event) => setDraft({ ...draft, helpUr: event.target.value })}
                      className="field-input font-urdu"
                      maxLength={200}
                    />
                  </label>
                </div>

                <Disclosure label="Retire this group" className="mt-8">
                  <p className="mb-3 max-w-prose text-sm text-neutral-900/60">
                    Retiring hides the question from the storefront but leaves its options
                    arranged, so restoring brings the whole thing back as it was.
                  </p>
                  <button
                    type="button"
                    onClick={() => setDraft({ ...draft, isActive: !draft.isActive })}
                    className="btn-secondary"
                  >
                    {draft.isActive ? 'Retire this group' : 'Restore this group'}
                  </button>
                  {draft.isActive === group.isActive ? null : (
                    <span className="ms-3 text-xs text-neutral-900/50">Save to apply.</span>
                  )}
                </Disclosure>
              </div>
            ),
          },
          {
            id: 'choices',
            label: 'Choices',
            badge: options.filter((option) => option.isActive).length,
            content: (
              <div>
                <p className="mb-4 max-w-prose text-sm text-neutral-900/60">
                  What a customer can answer, and what each answer adds to the garment&apos;s base
                  stitching fee. The order here is the order the storefront shows.
                </p>

                <div className="space-y-2">
                  {options.map((option, index) => (
                    <div
                      key={option.id ?? `new-${index}`}
                      className={
                        option.isActive
                          ? 'grid items-end gap-2 border border-neutral-100 p-2 sm:grid-cols-6'
                          : 'grid items-end gap-2 border border-neutral-100 bg-neutral-50 p-2 opacity-60 sm:grid-cols-6'
                      }
                    >
                      <Small label="Key">
                        <input
                          value={option.key}
                          onChange={(event) => patch(setOptions, index, { key: event.target.value })}
                          className="field-input py-1 text-sm"
                        />
                      </Small>
                      <Small label="English">
                        <input
                          value={option.labelEn}
                          onChange={(event) =>
                            patch(setOptions, index, { labelEn: event.target.value })
                          }
                          className="field-input py-1 text-sm"
                        />
                      </Small>
                      <Small label="اردو">
                        <input
                          value={option.labelUr}
                          onChange={(event) =>
                            patch(setOptions, index, { labelUr: event.target.value })
                          }
                          dir="rtl"
                          className="field-input py-1 font-urdu text-sm"
                        />
                      </Small>
                      <Small label="Price change (Rs)">
                        {/*
                          Deliberately unbounded below: a plain neckline that costs the
                          tailor less is a legitimate discount against the garment's base
                          fee, which is itself never negative and is set on the garment
                          page. Rupees here, paisa on the wire.
                        */}
                        <input
                          type="number"
                          step="1"
                          value={option.priceDelta}
                          onChange={(event) =>
                            patch(setOptions, index, { priceDelta: event.target.value })
                          }
                          className="field-input py-1 text-sm"
                        />
                      </Small>
                      <Small label="Image URL">
                        <input
                          value={option.imageUrl}
                          onChange={(event) =>
                            patch(setOptions, index, { imageUrl: event.target.value })
                          }
                          className="field-input py-1 text-sm"
                        />
                      </Small>
                      <div className="flex items-center pb-1">
                        <button
                          type="button"
                          onClick={() => patch(setOptions, index, { isActive: !option.isActive })}
                          className="text-xs text-neutral-900/60 hover:text-neutral-900"
                        >
                          {option.isActive ? 'Retire' : 'Restore'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setOptions((current) => [
                      ...current,
                      {
                        key: '',
                        labelEn: '',
                        labelUr: '',
                        priceDelta: '0',
                        imageUrl: '',
                        isActive: true,
                      },
                    ])
                  }
                  className="btn-secondary mt-3"
                >
                  Add option
                </button>
              </div>
            ),
          },
        ]}
      />
    </>
  );
}

function patch(
  setOptions: React.Dispatch<React.SetStateAction<OptionDraft[]>>,
  index: number,
  changes: Partial<OptionDraft>,
): void {
  setOptions((current) =>
    current.map((option, position) => (position === index ? { ...option, ...changes } : option)),
  );
}

function Small({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-neutral-900/50">{label}</span>
      {children}
    </label>
  );
}
