'use client';

import { useEffect, useState } from 'react';
import { adminFetch } from '@/lib/admin-client';
import { Loading } from '@/components/ui';
import type { EntityAttribute, EntityAttributeValueType } from '@/types/api';

const VALUE_TYPES: EntityAttributeValueType[] = ['TEXT', 'NUMBER', 'BOOLEAN', 'DATE'];

/**
 * architecture-patterns/140-general-eav-extensibility-model.md (WO-140.4) —
 * the general fallback editor for `EntityAttribute`, embeddable alongside
 * doc 104/105's own bounded `CustomFieldFormSection` where both coexist on
 * the same entity. Unlike that renderer, there is no predefined field list
 * to render from: the caller types the key on the spot, so this is the
 * "nobody has defined this field yet" escape hatch, not a replacement for
 * defining one properly under Settings when it's used more than once.
 */
export function EntityAttributeEditor({ entityType, entityId }: { entityType: string; entityId: string }) {
  const [attributes, setAttributes] = useState<EntityAttribute[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newValueType, setNewValueType] = useState<EntityAttributeValueType>('TEXT');

  function load() {
    adminFetch<EntityAttribute[]>('/admin/entity-attributes', { query: { entityType, entityId } })
      .then(setAttributes)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not load attributes'));
  }

  useEffect(() => {
    setAttributes(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, entityId]);

  async function setOne(attributeKey: string, attributeValue: string, valueType: EntityAttributeValueType) {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await adminFetch('/admin/entity-attributes', {
        method: 'POST',
        body: { entityType, entityId, attributeKey, attributeValue, valueType },
      });
      load();
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save attribute');
    } finally {
      setSaving(false);
    }
  }

  async function addAttribute() {
    if (!newKey.trim()) return;
    await setOne(newKey.trim(), newValue, newValueType);
    setNewKey('');
    setNewValue('');
    setNewValueType('TEXT');
  }

  // No attributes here yet and no unauthorized error — the entity type may
  // simply not be wired to this mechanism's permission map at all, in which
  // case the backend refuses every call; show nothing rather than a broken
  // form (doc 140's own "not defaulted to any signed-in user may edit").
  if (error && attributes === null) return null;

  return (
    <div className="card mt-6 p-6">
      <h2 className="mb-1 text-lg font-medium text-neutral-900">Additional attributes</h2>
      <p className="mb-4 text-sm text-neutral-900/60">
        Ad hoc key/value data with no predefined field — for anything not worth setting up under Settings yet.
      </p>

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      {!attributes ? (
        <Loading />
      ) : (
        <>
          {attributes.length > 0 ? (
            <table className="table-flat mb-4 w-full">
              <thead>
                <tr>
                  <th className="text-left">Key</th>
                  <th className="text-left">Value</th>
                  <th className="text-left">Type</th>
                </tr>
              </thead>
              <tbody>
                {attributes.map((attribute) => (
                  <tr key={attribute.id}>
                    <td>{attribute.attributeKey}</td>
                    <td>
                      <input
                        type="text"
                        className="field-input"
                        defaultValue={attribute.attributeValue}
                        onBlur={(event) => {
                          if (event.target.value !== attribute.attributeValue) {
                            void setOne(attribute.attributeKey, event.target.value, attribute.valueType);
                          }
                        }}
                      />
                    </td>
                    <td>{attribute.valueType}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}

          <div className="grid gap-3 fold:grid-cols-[1fr_1fr_auto_auto]">
            <label className="block">
              <span className="field-label">Key</span>
              <input
                type="text"
                className="field-input"
                placeholder="certification_number"
                value={newKey}
                onChange={(event) => setNewKey(event.target.value)}
              />
            </label>
            <label className="block">
              <span className="field-label">Value</span>
              <input type="text" className="field-input" value={newValue} onChange={(event) => setNewValue(event.target.value)} />
            </label>
            <label className="block">
              <span className="field-label">Type</span>
              <select
                className="field-input"
                value={newValueType}
                onChange={(event) => setNewValueType(event.target.value as EntityAttributeValueType)}
              >
                {VALUE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={() => void addAttribute()} disabled={saving || !newKey.trim()} className="btn-secondary self-end">
              {saving ? 'Saving…' : 'Add'}
            </button>
          </div>
          {saved ? <span className="mt-2 block text-sm text-green-700">Saved.</span> : null}
        </>
      )}
    </div>
  );
}
