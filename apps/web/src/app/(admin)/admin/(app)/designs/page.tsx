'use client';

import { useCallback, useEffect, useState } from 'react';
import { Wizard, type WizardStep } from '@/components/common/wizard';
import { adminFetch } from '@/lib/admin-client';
import type {
  AdminStitchingOption,
  AdminStitchingOptionGroup,
  GarmentType,
  StitchingDesignArea,
} from '@/types/api';

type DesignArea = Exclude<StitchingDesignArea, null>;

/**
 * The regions, ordered the way a tailor reads down a garment rather than
 * alphabetically — the list arrives sorted by the raw column value, which puts
 * "back" above "neck" and reads as noise to the person maintaining it. The
 * last three cover garment families the original seven don't fit — festive
 * blouses/cholis, lehenga/petticoat skirts, and abaya/kaftan outerwear — and
 * are ordered to match the storefront panel's area grouping.
 */
const AREAS: ReadonlyArray<{ value: DesignArea; label: string }> = [
  { value: 'neck', label: 'Neck' },
  { value: 'sleeves', label: 'Sleeves' },
  { value: 'upper_front', label: 'Upper front' },
  { value: 'lower_front', label: 'Lower front' },
  { value: 'back', label: 'Back' },
  { value: 'trouser', label: 'Trouser' },
  { value: 'finishing', label: 'Finishing' },
  { value: 'bodice', label: 'Bodice' },
  { value: 'skirt_panel', label: 'Skirt panel' },
  { value: 'outerwear', label: 'Outer layer' },
];

/** Groups with no area apply wherever the storefront chooses to show them. */
const ANYWHERE = 'Applies anywhere';

interface GroupDraft {
  labelEn: string;
  labelUr: string;
  /** Empty string is the form's spelling of a null area. */
  area: DesignArea | '';
  /** Empty string is the form's spelling of "every garment". */
  garmentTypeId: string;
  selectionType: 'SINGLE' | 'MULTI';
  required: boolean;
  allowCustomText: boolean;
  helpEn: string;
  helpUr: string;
  isActive: boolean;
}

interface OptionDraft {
  /** Absent until the row has been saved once. */
  id?: string;
  key: string;
  labelEn: string;
  labelUr: string;
  /** Rupees, as typed. Converted to paisa on save — the API stores integer paisa. */
  priceDelta: string;
  imageUrl: string;
  isActive: boolean;
}

interface NewGroupDraft {
  key: string;
  labelEn: string;
  labelUr: string;
}

const BLANK_NEW: NewGroupDraft = { key: '', labelEn: '', labelUr: '' };

/**
 * The design choices a customer picks from when ordering stitching.
 *
 * A group is one question ("Neckline") and its options are the answers, each
 * with a price difference against the garment's base stitching fee. Groups are
 * scoped to a garment or left open to all of them, so a shalwar kameez and a
 * kurta can share "Finishing" while keeping their own necklines.
 */
export default function AdminDesignsPage() {
  const [groups, setGroups] = useState<AdminStitchingOptionGroup[]>([]);
  const [garments, setGarments] = useState<GarmentType[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<GroupDraft | null>(null);
  const [options, setOptions] = useState<OptionDraft[]>([]);
  const [creating, setCreating] = useState(false);
  const [newGroup, setNewGroup] = useState<NewGroupDraft>(BLANK_NEW);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [loadedGroups, loadedGarments] = await Promise.all([
        adminFetch<AdminStitchingOptionGroup[]>('/admin/stitching/option-groups'),
        adminFetch<GarmentType[]>('/admin/measurements/garment-types'),
      ]);
      setGroups(loadedGroups);
      setGarments(loadedGarments);
      setSelectedId((current) => current ?? loadedGroups[0]?.id ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load design groups');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const group = groups.find((candidate) => candidate.id === selectedId);
    if (!group) return;

    setDraft({
      labelEn: group.labelEn,
      labelUr: group.labelUr,
      area: group.area ?? '',
      garmentTypeId: group.garmentTypeId ?? '',
      selectionType: group.selectionType,
      required: group.required,
      allowCustomText: group.allowCustomText,
      helpEn: group.helpEn ?? '',
      helpUr: group.helpUr ?? '',
      isActive: group.isActive,
    });
    setOptions(group.options.map(toDraft));
  }, [selectedId, groups]);

  async function createGroup(event: React.FormEvent) {
    event.preventDefault();

    setError(null);
    setNotice(null);
    setBusy(true);

    try {
      const created = await adminFetch<AdminStitchingOptionGroup>(
        '/admin/stitching/option-groups',
        {
          method: 'POST',
          body: {
            key: newGroup.key.trim(),
            labelEn: newGroup.labelEn.trim(),
            labelUr: newGroup.labelUr.trim(),
          },
        },
      );

      setCreating(false);
      setNewGroup(BLANK_NEW);
      await load();
      // The server normalises the key, so select by the id it handed back
      // rather than by anything we typed.
      setSelectedId(created.id);
      setNotice(`Created "${created.labelEn}". Add its options below.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create the design group');
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!selectedId || !draft) return;

    setError(null);
    setNotice(null);
    setBusy(true);

    try {
      await adminFetch(`/admin/stitching/option-groups/${selectedId}`, {
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
        if (isBlank(option)) continue;

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
          await adminFetch(`/admin/stitching/option-groups/${selectedId}/options`, {
            method: 'POST',
            body,
          });
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

  const selected = groups.find((group) => group.id === selectedId);

  return (
    <>
      <h1 className="mb-1 text-xl font-semibold text-neutral-900">Stitching designs</h1>
      <p className="mb-6 text-sm text-neutral-900/60">
        The style questions asked during stitching, and what each answer adds to the price.
      </p>

      {error ? (
        <p role="alert" className="card mb-4 whitespace-pre-line p-4 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {notice ? <p className="card mb-4 p-4 text-sm text-accent-hover">{notice}</p> : null}

      <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
        <nav className="card h-fit p-2">
          <button
            type="button"
            onClick={() => {
              setCreating(true);
              setNotice(null);
            }}
            className="btn-secondary mb-2 w-full"
          >
            New design group
          </button>

          {groups.length === 0 ? (
            <p className="px-3 py-2 text-sm text-neutral-900/50">No design groups yet.</p>
          ) : null}

          {[...AREAS.map((area) => area.value), null].map((area) => {
            const inArea = groups.filter((group) => (group.area ?? null) === area);
            if (inArea.length === 0) return null;

            return (
              <section key={area ?? 'anywhere'} className="mb-3 last:mb-0">
                <h2 className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-neutral-900/50">
                  {areaLabel(area)}
                </h2>
                <ul className="space-y-0.5">
                  {inArea.map((group) => (
                    <li key={group.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setCreating(false);
                          setSelectedId(group.id);
                        }}
                        className={buttonClass(group.id === selectedId, group.isActive)}
                      >
                        {group.labelEn}
                        <span className="block text-xs text-neutral-900/40">
                          {group.options.filter((option) => option.isActive).length} options
                          {group.isActive ? '' : ' · Retired'}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </nav>

        {creating ? (
          <form onSubmit={createGroup} className="card h-fit space-y-4 p-4">
            <h2 className="text-sm font-semibold text-neutral-900">New design group</h2>

            <label className="block">
              <span className="field-label">Key</span>
              <input
                value={newGroup.key}
                onChange={(event) => setNewGroup({ ...newGroup, key: event.target.value })}
                className="field-input"
                required
              />
              <span className="mt-1 block text-xs text-neutral-900/50">
                Tidied into snake_case by the server, and fixed afterwards — carts store answers
                against it.
              </span>
            </label>

            <label className="block">
              <span className="field-label">Name (English)</span>
              <input
                value={newGroup.labelEn}
                onChange={(event) => setNewGroup({ ...newGroup, labelEn: event.target.value })}
                className="field-input"
                required
              />
            </label>

            <label className="block" dir="rtl">
              <span className="field-label">نام (اردو)</span>
              <input
                value={newGroup.labelUr}
                onChange={(event) => setNewGroup({ ...newGroup, labelUr: event.target.value })}
                className="field-input font-urdu"
                required
              />
            </label>

            <div className="flex gap-2">
              <button type="submit" disabled={busy} className="btn-primary">
                {busy ? 'Creating…' : 'Create'}
              </button>
              <button type="button" onClick={() => setCreating(false)} className="btn-ghost">
                Cancel
              </button>
            </div>
          </form>
        ) : selected && draft ? (
          (() => {
            const basicsStep: WizardStep = {
              id: 'basics',
              label: 'Basics',
              isValid: Boolean(draft.labelEn.trim() && draft.labelUr.trim()),
              content: (
            <div>
            <label className="mb-4 block sm:max-w-xs">
              <span className="field-label">Key</span>
              <input value={selected.key} readOnly className="field-input bg-neutral-50 text-neutral-900/60" />
              <span className="mt-1 block text-xs text-neutral-900/50">
                Fixed — open carts store their custom notes against it.
              </span>
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
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
                    className="rounded border-neutral-200 text-accent-hover focus:ring-accent"
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
                    className="rounded border-neutral-200 text-accent-hover focus:ring-accent"
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
            </div>
              ),
            };

            const choicesStep: WizardStep = {
              id: 'choices',
              label: 'Choices',
              isValid: true,
              content: (
            <div>
            <div className="space-y-2">
              {options.map((option, index) => (
                <div
                  key={option.id ?? `new-${index}`}
                  className={
                    option.isActive
                      ? 'grid items-end gap-2 rounded-md border border-neutral-100 p-2 sm:grid-cols-6'
                      : 'grid items-end gap-2 rounded-md border border-neutral-100 bg-neutral-50 p-2 opacity-60 sm:grid-cols-6'
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
            };

            const steps: WizardStep[] = [basicsStep, choicesStep];

            return (
              <div className="card space-y-4 p-4">
                <Wizard
                  key={selectedId}
                  steps={steps}
                  onSubmit={save}
                  submitLabel={busy ? 'Saving…' : 'Save design group'}
                  submitBusy={busy}
                  submitDisabled={busy}
                  accentClassName="bg-accent-hover text-white"
                />
                <div className="flex items-center gap-4 border-t border-neutral-100 pt-4">
                  {/*
                    Retiring hides the group from the storefront but leaves its options
                    arranged, so restoring brings the whole question back as it was.
                  */}
                  <button
                    type="button"
                    onClick={() => setDraft({ ...draft, isActive: !draft.isActive })}
                    className="text-sm text-neutral-900/60 hover:text-neutral-900"
                  >
                    {draft.isActive ? 'Retire this group' : 'Restore this group'}
                  </button>
                  {draft.isActive === selected.isActive ? null : (
                    <span className="text-xs text-neutral-900/50">Save to apply.</span>
                  )}
                </div>
              </div>
            );
          })()
        ) : (
          <p className="text-sm text-neutral-900/50">Loading…</p>
        )}
      </div>
    </>
  );
}

function toDraft(option: AdminStitchingOption): OptionDraft {
  return {
    id: option.id,
    key: option.key,
    labelEn: option.labelEn,
    labelUr: option.labelUr,
    priceDelta: String(option.priceDelta / 100),
    imageUrl: option.imageUrl ?? '',
    isActive: option.isActive,
  };
}

/** Rupees as typed to the integer paisa the API stores. Blank reads as free. */
function toPaisa(rupees: string): number {
  const value = Number(rupees);
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
}

/** An appended row the user never filled in — skipped rather than rejected. */
function isBlank(option: OptionDraft): boolean {
  return option.key.trim() === '' && option.labelEn.trim() === '';
}

function areaLabel(area: DesignArea | null): string {
  return AREAS.find((candidate) => candidate.value === area)?.label ?? ANYWHERE;
}

function buttonClass(isSelected: boolean, isActive: boolean): string {
  const base = 'w-full rounded-md px-3 py-2 text-start text-sm';
  const tone = isSelected
    ? 'bg-neutral-50 font-medium text-accent-hover'
    : 'text-neutral-900/75 hover:bg-white';
  return isActive ? `${base} ${tone}` : `${base} ${tone} opacity-60`;
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
