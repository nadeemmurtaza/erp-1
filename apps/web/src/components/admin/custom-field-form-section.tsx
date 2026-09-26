'use client';

import { useEffect, useState } from 'react';
import { adminFetch } from '@/lib/admin-client';
import { Loading } from '@/components/ui';
import type { CustomFieldDefinition, CustomFieldEntityType, CustomFieldValue } from '@/types/api';

/**
 * architecture-patterns/105-metadata-driven-ui-rendering.md (WO-105.1) — the
 * one piece of metadata-driven rendering this repository actually needs: a
 * form section built from whatever `CustomFieldDefinition` rows exist for
 * one entity type, embeddable on that entity's own detail screen. Adding a
 * definition with `isRequired: true` makes the field mandatory here on the
 * very next render, with no frontend deploy — doc 104's own custom-fields
 * mechanism is what this renders, never a general "any screen" engine (see
 * doc 105's own "Out of scope").
 */
export function CustomFieldFormSection({ entityType, entityId }: { entityType: CustomFieldEntityType; entityId: string }) {
  const [definitions, setDefinitions] = useState<CustomFieldDefinition[] | null>(null);
  const [values, setValues] = useState<Record<string, CustomFieldValue>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      adminFetch<CustomFieldDefinition[]>('/admin/custom-fields/definitions', { query: { entityType } }),
      adminFetch<Record<string, CustomFieldValue>>('/admin/custom-fields/values', { query: { entityType, entityId } }),
    ])
      .then(([defs, vals]) => {
        if (cancelled) return;
        setDefinitions(defs);
        setValues(vals);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Could not load custom fields');
      });
    return () => {
      cancelled = true;
    };
  }, [entityType, entityId]);

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await adminFetch<Record<string, CustomFieldValue>>('/admin/custom-fields/values', {
        method: 'POST',
        body: { entityType, entityId, values },
      });
      setValues(updated);
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save custom fields');
    } finally {
      setSaving(false);
    }
  }

  // No definitions for this entity type yet — nothing to show, and no empty
  // card either (doc 104's own "rarely used" Solo-edition silhouette).
  if (definitions && definitions.length === 0) return null;

  return (
    <div className="card mt-6 p-6">
      <h2 className="mb-1 text-lg font-medium text-neutral-900">Custom fields</h2>
      <p className="mb-4 text-sm text-neutral-900/60">
        Extra fields your organization added — set up under Settings &rsaquo; Custom fields.
      </p>

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      {!definitions ? (
        <Loading />
      ) : (
        <>
          <div className="grid gap-4 fold:grid-cols-2">
            {definitions.map((definition) => (
              <CustomFieldInput
                key={definition.id}
                definition={definition}
                value={values[definition.key] ?? null}
                onChange={(next) => {
                  setValues((prev) => ({ ...prev, [definition.key]: next }));
                  setSaved(false);
                }}
              />
            ))}
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button type="button" onClick={() => void save()} disabled={saving} className="btn-primary">
              {saving ? 'Saving…' : 'Save custom fields'}
            </button>
            {saved ? <span className="text-sm text-green-700">Saved.</span> : null}
          </div>
        </>
      )}
    </div>
  );
}

function CustomFieldInput({
  definition,
  value,
  onChange,
}: {
  definition: CustomFieldDefinition;
  value: CustomFieldValue;
  onChange: (value: CustomFieldValue) => void;
}) {
  const label = (
    <span className="field-label">
      {definition.label}
      {definition.isRequired ? <span aria-hidden="true"> *</span> : null}
    </span>
  );

  if (definition.valueType === 'BOOLEAN') {
    return (
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={value === true} onChange={(event) => onChange(event.target.checked)} className="field-check" />
        <span className="text-sm text-neutral-900">
          {definition.label}
          {definition.isRequired ? <span aria-hidden="true"> *</span> : null}
        </span>
      </label>
    );
  }

  if (definition.valueType === 'NUMBER') {
    return (
      <label className="block">
        {label}
        <input
          type="number"
          value={typeof value === 'number' ? value : ''}
          onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))}
          required={definition.isRequired}
          className="field-input"
        />
      </label>
    );
  }

  if (definition.valueType === 'DATE') {
    return (
      <label className="block">
        {label}
        <input
          type="date"
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(event.target.value || null)}
          required={definition.isRequired}
          className="field-input"
        />
      </label>
    );
  }

  return (
    <label className="block">
      {label}
      <input
        type="text"
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value || null)}
        required={definition.isRequired}
        className="field-input"
      />
    </label>
  );
}
