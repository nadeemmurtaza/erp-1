'use client';

import { useEffect, useState } from 'react';
import { adminFetch } from '@/lib/admin-client';
import { Loading } from '@/components/ui';
import { MetadataDrivenForm, type MetadataFieldValue } from './metadata-driven-form';
import type { EntityAttribute, FormMetadata } from '@/types/api';

/**
 * architecture-patterns/141-general-metadata-driven-ui-engine.md (WO-141.4)
 * — the one real, wired-up screen this engine renders today: a
 * `FormMetadata` definition for one entity type, with values stored as
 * doc 140's own `EntityAttribute` rows rather than a second, parallel
 * write path. Renders nothing when no form is defined for this entity
 * type yet (doc 141's own "additive, never a replacement" scope).
 */
export function MetadataDrivenEntityForm({ entityType, entityId }: { entityType: string; entityId: string }) {
  const [metadata, setMetadata] = useState<FormMetadata | null | undefined>(undefined);
  const [values, setValues] = useState<Record<string, MetadataFieldValue>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      adminFetch<FormMetadata | null>(`/admin/metadata-forms/${entityType}`),
      adminFetch<EntityAttribute[]>('/admin/entity-attributes', { query: { entityType, entityId } }),
    ])
      .then(([form, attributes]) => {
        if (cancelled) return;
        setMetadata(form);
        setValues(Object.fromEntries(attributes.map((attribute) => [attribute.attributeKey, coerce(attribute.attributeValue, attribute.valueType)])));
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Could not load the metadata-driven form');
      });
    return () => {
      cancelled = true;
    };
  }, [entityType, entityId]);

  async function save() {
    if (!metadata) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await Promise.all(
        metadata.fields.map((field) =>
          adminFetch('/admin/entity-attributes', {
            method: 'POST',
            body: {
              entityType,
              entityId,
              attributeKey: field.key,
              attributeValue: String(values[field.key] ?? ''),
              valueType: field.valueType === 'SELECT' ? 'TEXT' : field.valueType,
            },
          }),
        ),
      );
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  if (metadata === undefined) {
    return error ? (
      <p role="alert" className="notice notice-error">
        {error}
      </p>
    ) : (
      <Loading />
    );
  }

  // No form defined for this entity type yet — nothing to show, matching
  // doc 141's own additive scope (never a required screen).
  if (metadata === null) return null;

  return (
    <div className="card mt-6 p-6">
      <h2 className="mb-1 text-lg font-medium text-neutral-900">Additional details</h2>
      <p className="mb-4 text-sm text-neutral-900/60">Defined under Settings &rsaquo; Metadata forms &mdash; updates here with no frontend deploy.</p>

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      <MetadataDrivenForm
        fields={metadata.fields}
        values={values}
        onChange={(key, value) => {
          setValues((prev) => ({ ...prev, [key]: value }));
          setSaved(false);
        }}
      />

      <div className="mt-4 flex items-center gap-3">
        <button type="button" onClick={() => void save()} disabled={saving} className="btn-primary">
          {saving ? 'Saving…' : 'Save'}
        </button>
        {saved ? <span className="text-sm text-green-700">Saved.</span> : null}
      </div>
    </div>
  );
}

function coerce(value: string, valueType: string): MetadataFieldValue {
  if (valueType === 'NUMBER') return value === '' ? null : Number(value);
  if (valueType === 'BOOLEAN') return value === 'true';
  return value;
}
