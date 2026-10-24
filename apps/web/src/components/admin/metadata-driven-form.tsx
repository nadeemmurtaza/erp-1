'use client';

import type { FieldMetadata } from '@/types/api';

export type MetadataFieldValue = string | number | boolean | null;

/**
 * architecture-patterns/141-general-metadata-driven-ui-engine.md (WO-141.2).
 *
 * The mandatory guardrail this document names (§2): this file may
 * compose ONLY plain semantic HTML elements styled through this
 * repository's own already-swept `.field-label`/`.field-input`/
 * `.field-check` classes (`apps/web/src/app/globals.css`) — the identical
 * idiom every hand-authored form in this codebase already uses (see
 * `custom-field-form-section.tsx`) — never a raw inline `style`, never a
 * bespoke class, and never an import from any component library beyond
 * this file's own local helpers and `@/types/api`'s types. This is a
 * correction against the document's own literal premise ("compose
 * entirely from @newax/shared's own primitive components"): `@newax/shared`
 * is a pure logic/constants package with no React components at all (see
 * DECISIONS.md ADR-049) — the real, already-swept idiom is plain elements
 * plus these classes, and that is what `scripts/check-metadata-renderer.mjs`
 * enforces against THIS file.
 */
export function MetadataDrivenForm({
  fields,
  values,
  onChange,
  disabled,
}: {
  fields: FieldMetadata[];
  values: Record<string, MetadataFieldValue>;
  onChange: (key: string, value: MetadataFieldValue) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-4 fold:grid-cols-2">
      {fields.map((field) => (
        <MetadataField key={field.key} field={field} value={values[field.key] ?? null} onChange={(value) => onChange(field.key, value)} disabled={disabled} />
      ))}
    </div>
  );
}

function MetadataField({
  field,
  value,
  onChange,
  disabled,
}: {
  field: FieldMetadata;
  value: MetadataFieldValue;
  onChange: (value: MetadataFieldValue) => void;
  disabled?: boolean;
}) {
  const label = (
    <span className="field-label">
      {field.label}
      {field.isRequired ? <span aria-hidden="true"> *</span> : null}
    </span>
  );

  if (field.valueType === 'BOOLEAN') {
    return (
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={value === true} onChange={(event) => onChange(event.target.checked)} disabled={disabled} className="field-check" />
        <span className="text-sm text-neutral-900">
          {field.label}
          {field.isRequired ? <span aria-hidden="true"> *</span> : null}
        </span>
      </label>
    );
  }

  if (field.valueType === 'SELECT') {
    return (
      <label className="block">
        {label}
        <select
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(event.target.value || null)}
          disabled={disabled}
          required={field.isRequired}
          className="field-input"
        >
          <option value="">Select…</option>
          {(field.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        {field.helpText ? <span className="mt-1 block text-xs text-neutral-900/60">{field.helpText}</span> : null}
      </label>
    );
  }

  if (field.valueType === 'NUMBER') {
    return (
      <label className="block">
        {label}
        <input
          type="number"
          value={typeof value === 'number' ? value : ''}
          onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))}
          disabled={disabled}
          required={field.isRequired}
          className="field-input"
        />
        {field.helpText ? <span className="mt-1 block text-xs text-neutral-900/60">{field.helpText}</span> : null}
      </label>
    );
  }

  if (field.valueType === 'DATE') {
    return (
      <label className="block">
        {label}
        <input
          type="date"
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(event.target.value || null)}
          disabled={disabled}
          required={field.isRequired}
          className="field-input"
        />
        {field.helpText ? <span className="mt-1 block text-xs text-neutral-900/60">{field.helpText}</span> : null}
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
        disabled={disabled}
        required={field.isRequired}
        className="field-input"
      />
      {field.helpText ? <span className="mt-1 block text-xs text-neutral-900/60">{field.helpText}</span> : null}
    </label>
  );
}
