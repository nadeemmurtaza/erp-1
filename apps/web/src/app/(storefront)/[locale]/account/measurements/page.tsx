'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { GarmentType, MeasurementProfile } from '@/lib/api-types';
import { customerFetch } from '@/lib/customer-client';

interface Draft {
  id?: string;
  garmentTypeId: string;
  label: string;
  notes: string;
  isDefault: boolean;
  values: Record<string, string>;
}

const BLANK: Draft = { garmentTypeId: '', label: '', notes: '', isDefault: false, values: {} };

export default function AccountMeasurementsPage() {
  const [profiles, setProfiles] = useState<MeasurementProfile[]>([]);
  const [garmentTypes, setGarmentTypes] = useState<GarmentType[]>([]);
  const [draft, setDraft] = useState<Draft>(BLANK);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [ownProfiles, garments] = await Promise.all([
        customerFetch<MeasurementProfile[]>('/measurements/profiles'),
        customerFetch<GarmentType[]>('/measurements/garment-types'),
      ]);
      setProfiles(ownProfiles);
      setGarmentTypes(garments);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load your measurements');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedGarment = useMemo(
    () => garmentTypes.find((g) => g.id === draft.garmentTypeId) ?? null,
    [garmentTypes, draft.garmentTypeId],
  );

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    const values: Record<string, number> = {};
    for (const [key, raw] of Object.entries(draft.values)) {
      if (raw !== '') values[key] = Number(raw);
    }

    try {
      if (draft.id) {
        await customerFetch(`/measurements/profiles/${draft.id}`, {
          method: 'PATCH',
          body: { label: draft.label, values, notes: draft.notes || undefined, isDefault: draft.isDefault },
        });
      } else {
        await customerFetch('/measurements/profiles', {
          method: 'POST',
          body: {
            label: draft.label,
            garmentTypeId: draft.garmentTypeId,
            values,
            notes: draft.notes || undefined,
            isDefault: draft.isDefault,
          },
        });
      }
      setDraft(BLANK);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save this profile');
    } finally {
      setBusy(false);
    }
  }

  async function remove(profile: MeasurementProfile) {
    setError(null);
    try {
      await customerFetch(`/measurements/profiles/${profile.id}`, { method: 'DELETE' });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not remove this profile');
    }
  }

  function edit(profile: MeasurementProfile) {
    const values: Record<string, string> = {};
    for (const [key, value] of Object.entries(profile.values)) {
      values[key] = String(value);
    }
    setDraft({
      id: profile.id,
      garmentTypeId: profile.garmentTypeId,
      label: profile.label,
      notes: profile.notes ?? '',
      isDefault: profile.isDefault,
      values,
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-3">
        {error ? (
          <p role="alert" className="card p-4 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        {profiles.length === 0 ? (
          <div className="card p-6 text-center text-sm text-ink/50">
            No saved measurement profiles yet.
          </div>
        ) : (
          profiles.map((profile) => (
            <div key={profile.id} className="card flex items-start justify-between p-4">
              <div>
                <p className="font-medium text-ink">
                  {profile.label}
                  {profile.isDefault ? (
                    <span className="ms-2 rounded bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
                      Default
                    </span>
                  ) : null}
                </p>
                <p className="mt-1 text-sm text-ink/60">{profile.garmentType.labelEn}</p>
                <p className="mt-1 text-xs text-ink/50">
                  {Object.entries(profile.values)
                    .map(([key, value]) => `${key}: ${value}`)
                    .join(' · ')}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => edit(profile)}
                  className="rounded px-2 py-1 text-xs text-brand-700 hover:bg-brand-50"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => void remove(profile)}
                  className="rounded px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <form onSubmit={save} className="card h-fit space-y-4 p-4">
        <h2 className="text-sm font-semibold text-ink">
          {draft.id ? 'Edit profile' : 'Add a measurement profile'}
        </h2>

        <label className="block">
          <span className="field-label">Profile name</span>
          <input
            value={draft.label}
            onChange={(event) => setDraft({ ...draft, label: event.target.value })}
            placeholder="Self, Ammi…"
            required
            className="field-input"
          />
        </label>

        <label className="block">
          <span className="field-label">Garment</span>
          <select
            value={draft.garmentTypeId}
            disabled={Boolean(draft.id)}
            onChange={(event) => setDraft({ ...draft, garmentTypeId: event.target.value, values: {} })}
            required
            className="field-input disabled:opacity-50"
          >
            <option value="">Select a garment</option>
            {garmentTypes.map((garment) => (
              <option key={garment.id} value={garment.id}>
                {garment.labelEn}
              </option>
            ))}
          </select>
        </label>

        {selectedGarment
          ? selectedGarment.fields.map((field) => (
              <label className="block" key={field.key}>
                <span className="field-label">
                  {field.labelEn} ({field.unit.toLowerCase()})
                </span>
                <input
                  type="number"
                  step="0.1"
                  min={field.min}
                  max={field.max}
                  required={field.required}
                  value={draft.values[field.key] ?? ''}
                  onChange={(event) =>
                    setDraft({ ...draft, values: { ...draft.values, [field.key]: event.target.value } })
                  }
                  className="field-input"
                />
              </label>
            ))
          : null}

        <label className="block">
          <span className="field-label">Notes</span>
          <input
            value={draft.notes}
            onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
            className="field-input"
          />
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.isDefault}
            onChange={(event) => setDraft({ ...draft, isDefault: event.target.checked })}
            className="rounded border-sand-300 text-brand-600 focus:ring-brand-500"
          />
          Preselect for this garment
        </label>

        <div className="flex gap-2">
          <button type="submit" disabled={busy} className="btn-primary">
            {draft.id ? 'Save' : 'Add'}
          </button>
          {draft.id ? (
            <button type="button" onClick={() => setDraft(BLANK)} className="btn-ghost">
              Cancel
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
