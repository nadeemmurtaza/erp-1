'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatDateTime } from '@newax/shared';
import { adminFetch } from '@/lib/admin-client';
import type {
  ApprovalSubjectType,
  AuditLogPage,
  BpmnWorkflowDefinition,
  CustomFieldDefinition,
  CustomFieldEntityType,
  CustomFieldValueType,
  EmbeddedWidget,
  FieldMetadata,
  FieldMetadataValueType,
  FormMetadata,
  MicroFrontendFragment,
  RoleSummary,
} from '@/types/api';
import { BpmnEditor } from '@/components/admin/bpmn-editor';
import { DataTable, EmptyState, Loading, PageHeader, Pagination, Tabs } from '@/components/ui';
import { RoleWizard } from '@/components/admin/role-wizard';
import { useAdminSession } from '@/components/admin/session';
import { useEnabledModules } from '@/components/admin/deployment-modules';
import { isModuleEnabled } from '@/utils/module-gate';
import { DateField } from '@/components/ui/date-field';

/** Undefined = wizard closed. `null` = creating a new role. A `RoleSummary` = editing that one. */
type WizardTarget = RoleSummary | null | undefined;

export default function AdminSettingsPage() {
  const [roles, setRoles] = useState<RoleSummary[]>([]);
  const [wizardTarget, setWizardTarget] = useState<WizardTarget>(undefined);
  const [error, setError] = useState<string | null>(null);

  const [audit, setAudit] = useState<AuditLogPage | null>(null);
  const [auditFilters, setAuditFilters] = useState({ entity: '', actorId: '', from: '', to: '' });
  const [auditPage, setAuditPage] = useState(1);
  const [auditError, setAuditError] = useState<string | null>(null);

  const loadRoles = useCallback(async () => {
    setError(null);
    try {
      setRoles(await adminFetch<RoleSummary[]>('/admin/roles'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load roles');
    }
  }, []);

  useEffect(() => {
    void loadRoles();
  }, [loadRoles]);

  const loadAuditLog = useCallback(async () => {
    setAuditError(null);
    try {
      setAudit(
        await adminFetch<AuditLogPage>('/admin/settings/audit-log', {
          query: {
            entity: auditFilters.entity || undefined,
            actorId: auditFilters.actorId || undefined,
            from: auditFilters.from || undefined,
            to: auditFilters.to || undefined,
            page: auditPage,
            perPage: 50,
          },
        }),
      );
    } catch (cause) {
      setAuditError(cause instanceof Error ? cause.message : 'Could not load the audit log');
    }
  }, [auditFilters, auditPage]);

  useEffect(() => {
    void loadAuditLog();
  }, [loadAuditLog]);

  function handleWizardDone(saved: RoleSummary) {
    setRoles((prev) => {
      const exists = prev.some((r) => r.id === saved.id);
      return exists ? prev.map((r) => (r.id === saved.id ? saved : r)) : [...prev, saved];
    });
    setWizardTarget(undefined);
  }

  async function deleteRole(role: RoleSummary) {
    setError(null);
    try {
      await adminFetch(`/admin/roles/${role.id}`, { method: 'DELETE' });
      setRoles((prev) => prev.filter((r) => r.id !== role.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Could not delete "${role.name}"`);
    }
  }

  return (
    <>
      <PageHeader
        title="Settings"
        description="What each role can do, how media is stored, and a record of every change."
      />

      {/*
        Three unrelated jobs — who can do what, how uploads are stored, what
        happened. Tabs rather than one scroll: they are separate tasks on one
        object, and stacking them is how a settings page becomes the longest
        page in an admin.
      */}
      <Tabs
        label="Settings areas"
        items={[
          {
            key: 'permissions',
            label: 'Roles & permissions',
            content: (
      <section>
        {error ? (
          <p role="alert" className="notice notice-error mb-4">
            {error}
          </p>
        ) : null}

        {wizardTarget !== undefined ? (
          <RoleWizard
            role={wizardTarget ?? undefined}
            onDone={handleWizardDone}
            onCancel={() => setWizardTarget(undefined)}
          />
        ) : roles.length === 0 && !error ? (
          <Loading />
        ) : (
          <div>
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm text-neutral-900/60">
                {roles.length} role{roles.length === 1 ? '' : 's'} — each can hold any mix of the
                permission groups.
              </p>
              <button type="button" onClick={() => setWizardTarget(null)} className="btn-primary">
                New role
              </button>
            </div>

            <div className="overflow-hidden">
              <DataTable
                rows={roles}
                emptyLabel="No roles yet."
                rowKey={(role) => role.id}
                columns={[
                  {
                    header: 'Role',
                    cell: (role) => (
                      <>
                        <button
                          type="button"
                          onClick={() => setWizardTarget(role)}
                          className="font-medium text-accent-hover"
                        >
                          {role.name}
                        </button>
                        {role.description ? (
                          <p className="text-xs text-neutral-900/60">{role.description}</p>
                        ) : null}
                      </>
                    ),
                  },
                  {
                    header: 'Permissions',
                    align: 'end',
                    numeric: true,
                    cell: (role) => role.permissions.length,
                    muted: true,
                  },
                  {
                    header: 'Holders',
                    align: 'end',
                    numeric: true,
                    cell: (role) => role.userCount,
                    muted: true,
                  },
                  {
                    header: '',
                    align: 'end',
                    cell: (role) => (
                      <button
                        type="button"
                        onClick={() => void deleteRole(role)}
                        className="btn-text text-feedback-negative"
                      >
                        Delete
                      </button>
                    ),
                  },
                ]}
              />
            </div>
          </div>
        )}
      </section>
            ),
          },
          {
            key: 'documents',
            label: 'Documents & media',
            content: (
              <>
                <DocumentSettingsPanel />
                <MediaSettings />
              </>
            ),
          },
          {
            key: 'custom-fields',
            label: 'Custom fields',
            content: <CustomFieldsSettingsPanel />,
          },
          {
            key: 'embeds',
            label: 'Embeds',
            content: <EmbedsSettingsPanel />,
          },
          {
            key: 'fragments',
            label: 'Fragments',
            content: <FragmentsSettingsPanel />,
          },
          {
            key: 'metadata-forms',
            label: 'Metadata forms',
            content: <MetadataFormsSettingsPanel />,
          },
          {
            key: 'approval-workflows',
            label: 'Approval workflows',
            content: <BpmnWorkflowsSettingsPanel />,
          },
          {
            key: 'audit',
            label: 'Audit log',
            content: (
      <section>

        <div className="mb-6 flex flex-wrap items-end gap-3 border-b border-neutral-100 pb-4">
          <label className="block">
            <span className="field-label">Entity</span>
            <input
              value={auditFilters.entity}
              onChange={(event) => setAuditFilters({ ...auditFilters, entity: event.target.value })}
              placeholder="Order, Product…"
              className="field-input w-auto"
            />
          </label>
          <label className="block">
            <span className="field-label">Actor ID</span>
            <input
              value={auditFilters.actorId}
              onChange={(event) => setAuditFilters({ ...auditFilters, actorId: event.target.value })}
              className="field-input w-auto"
            />
          </label>
          <div>
            <label htmlFor="audit-from" className="field-label">
              From
            </label>
            <DateField
              id="audit-from"
              className="w-auto"
              value={auditFilters.from}
              onChange={(next) => setAuditFilters({ ...auditFilters, from: next })}
            />
          </div>
          <div>
            <label htmlFor="audit-to" className="field-label">
              To
            </label>
            <DateField
              id="audit-to"
              className="w-auto"
              value={auditFilters.to}
              onChange={(next) => setAuditFilters({ ...auditFilters, to: next })}
            />
          </div>
          <button
            type="button"
            onClick={() => {
              setAuditPage(1);
              void loadAuditLog();
            }}
            className="btn-secondary"
          >
            Filter
          </button>
        </div>

        {auditError ? (
          <p role="alert" className="notice notice-error mb-4">
            {auditError}
          </p>
        ) : null}

        <div className="overflow-hidden">
          <DataTable
            rows={audit?.entries}
            loading={!audit}
            emptyLabel="No matching entries."
            rowKey={(entry) => entry.id}
            columns={[
              { header: 'When', cell: (entry) => formatDateTime(entry.createdAt), muted: true },
              {
                header: 'Actor',
                cell: (entry) =>
                  entry.actor
                    ? [entry.actor.firstName, entry.actor.lastName].filter(Boolean).join(' ') ||
                      entry.actor.email
                    : '—',
              },
              { header: 'Action', cell: (entry) => entry.action, className: 'font-mono text-neutral-900/80' },
              {
                header: 'Entity',
                cell: (entry) => (
                  <>
                    {entry.entity}
                    {entry.entityId ? (
                      <span className="text-xs text-neutral-900/60"> · {entry.entityId}</span>
                    ) : null}
                  </>
                ),
                muted: true,
              },
            ]}
          />

          {audit ? (
            <Pagination
              meta={{
                page: audit.page,
                totalPages: Math.max(1, Math.ceil(audit.total / audit.perPage)),
                total: audit.total,
                hasNext: audit.page * audit.perPage < audit.total,
                hasPrevious: audit.page > 1,
              }}
              onChange={setAuditPage}
              itemLabel="entries"
            />
          ) : null}
        </div>
      </section>
            ),
          },
        ]}
      />
    </>
  );
}

interface DocumentSettings {
  logoSource: 'text' | 'site' | 'custom';
  logoUrl: string | null;
  prefixes: Record<string, string>;
}

/**
 * `module` ties a field to the API module it only means something for — a
 * pure B2B supplier deployment with `stitching`/`orders` off has no use for
 * a stitching-order prefix or a consumer order prefix. Omitted `module`
 * means universal (purchasing is `core`, so every deployment sees it).
 */
const PREFIX_FIELDS: Array<{ key: string; label: string; module?: string }> = [
  { key: 'order', label: 'Orders', module: 'orders' },
  { key: 'purchaseOrder', label: 'Purchase orders', module: 'purchasing' },
  { key: 'goodsReceipt', label: 'Goods receipts', module: 'purchasing' },
  { key: 'stitchingOrder', label: 'Stitching orders', module: 'stitching' },
  { key: 'stitchingJob', label: 'Workshop jobs', module: 'stitching' },
  { key: 'stockCount', label: 'Stock counts', module: 'inventory' },
  { key: 'journalEntry', label: 'Journal entries', module: 'accounting' },
  { key: 'invoice', label: 'Invoices (to trading partners)', module: 'tradingpartners' },
  { key: 'quote', label: 'Quotes (to trading partners)', module: 'tradingpartners' },
];

const LOGO_CHOICES: Array<{ value: DocumentSettings['logoSource']; label: string; hint: string }> = [
  {
    value: 'text',
    label: 'The shop name, as text',
    hint: 'What most people see. Mail clients block hosted images until the reader asks for them.',
  },
  {
    value: 'site',
    label: "The storefront's logo",
    hint: 'The same artwork the website header uses.',
  },
  {
    value: 'custom',
    label: 'A logo just for documents',
    hint: 'For when the web logo is knocked out white and an invoice needs a dark one.',
  },
];

/**
 * What customer-facing paperwork shows, and how it is numbered.
 *
 * Prefixes are here rather than in code because a shop that already numbers
 * its paperwork a particular way should not have to match ours — and because
 * the shipped default for orders is the client's initials, which the next
 * client will want changed. Changing one affects new documents only.
 */
function DocumentSettingsPanel() {
  const enabledModules = useEnabledModules();
  const prefixFields = PREFIX_FIELDS.filter((field) => isModuleEnabled(field.module, enabledModules));
  const [settings, setSettings] = useState<DocumentSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    adminFetch<DocumentSettings>('/admin/settings/documents')
      .then(setSettings)
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : 'Could not load document settings'),
      );
  }, []);

  async function save(patch: Partial<DocumentSettings>) {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const next = await adminFetch<DocumentSettings>('/admin/settings/documents', {
        method: 'PUT',
        body: patch,
      });
      setSettings(next);
      setNotice('Saved. New documents use these; anything already issued keeps its number.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save document settings');
    } finally {
      setSaving(false);
    }
  }

  if (!settings) {
    return error ? (
      <p role="alert" className="notice notice-error">
        {error}
      </p>
    ) : (
      <Loading />
    );
  }

  return (
    <section className="mb-10 max-w-prose">
      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}
      {notice ? <p className="notice notice-success mb-4">{notice}</p> : null}

      <h3 className="eyebrow mb-3">On receipts, invoices and emails</h3>
      <div className="space-y-3">
        {LOGO_CHOICES.map((choice) => (
          <label key={choice.value} className="flex items-start gap-3">
            <input
              type="radio"
              name="logoSource"
              checked={settings.logoSource === choice.value}
              disabled={saving}
              onChange={() => void save({ logoSource: choice.value })}
              className="field-check mt-1 rounded-full"
            />
            <span>
              <span className="block text-sm text-neutral-900">{choice.label}</span>
              <span className="mt-0.5 block text-xs text-neutral-900/60">{choice.hint}</span>
            </span>
          </label>
        ))}
      </div>

      {settings.logoSource === 'custom' ? (
        <label className="mt-4 block">
          <span className="field-label">Logo URL</span>
          <input
            defaultValue={settings.logoUrl ?? ''}
            onBlur={(event) => {
              const next = event.target.value.trim() || null;
              if (next !== settings.logoUrl) void save({ logoUrl: next });
            }}
            placeholder="https://…"
            className="field-input"
          />
          <span className="mt-1 block text-xs text-neutral-900/60">
            Upload it under Products &rsaquo; Images, then paste the address here. A wide,
            short mark reads best — it is shown 36px tall.
          </span>
        </label>
      ) : null}

      <h3 className="eyebrow mb-3 mt-8">Number prefixes</h3>
      <p className="mb-3 text-sm text-neutral-900/60">
        What each kind of document&rsquo;s number starts with, before the year and the
        sequence — <code className="text-neutral-900">{settings.prefixes.order}-2026-0001</code>.
      </p>
      <div className="grid gap-3 fold:grid-cols-2">
        {prefixFields.map((field) => (
          <label key={field.key} className="block">
            <span className="field-label">{field.label}</span>
            <input
              defaultValue={settings.prefixes[field.key] ?? ''}
              maxLength={8}
              onBlur={(event) => {
                const next = event.target.value.trim().toUpperCase();
                if (next && next !== settings.prefixes[field.key]) {
                  void save({ prefixes: { [field.key]: next } as Record<string, string> });
                }
              }}
              className="field-input"
            />
          </label>
        ))}
      </div>
    </section>
  );
}

/**
 * How uploaded images are stored.
 *
 * One switch, and a plain statement of what it does — an owner turning this
 * off should know it costs page speed, and that it changes nothing about the
 * images already on the shelf.
 */
function MediaSettings() {
  const [webpEnabled, setWebpEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    adminFetch<{ webpEnabled: boolean }>('/admin/settings/media')
      .then((media) => setWebpEnabled(media.webpEnabled))
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : 'Could not load media settings'),
      );
  }, []);

  async function save(next: boolean) {
    setSaving(true);
    setError(null);
    setNotice(null);
    // Optimistic, then corrected by what the server returns — a switch that
    // waits a round trip before moving feels broken.
    setWebpEnabled(next);
    try {
      const media = await adminFetch<{ webpEnabled: boolean }>('/admin/settings/media', {
        method: 'PUT',
        body: { webpEnabled: next },
      });
      setWebpEnabled(media.webpEnabled);
      setNotice(
        media.webpEnabled
          ? 'New uploads will be converted to WebP.'
          : 'New uploads will be stored in their original format.',
      );
    } catch (cause) {
      setWebpEnabled(!next);
      setError(cause instanceof Error ? cause.message : 'Could not save media settings');
    } finally {
      setSaving(false);
    }
  }

  if (webpEnabled === null) {
    return error ? (
      <p role="alert" className="notice notice-error">
        {error}
      </p>
    ) : (
      <Loading />
    );
  }

  return (
    <section className="max-w-prose">
      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}
      {notice ? <p className="notice notice-success mb-4">{notice}</p> : null}

      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={webpEnabled}
          disabled={saving}
          onChange={(event) => void save(event.target.checked)}
          className="field-check mt-1"
        />
        <span>
          <span className="block text-sm font-medium text-neutral-900">
            Convert uploads to WebP
          </span>
          <span className="mt-1 block text-sm text-neutral-900/60">
            WebP is smaller than JPEG or PNG at the same visual quality, so pages load faster and
            Lighthouse stops flagging &ldquo;next-gen formats&rdquo;. Turn it off only if an
            original has to be kept byte-for-byte.
          </span>
          <span className="mt-2 block text-xs text-neutral-900/60">
            Applies to new uploads. Images already stored keep the format they were saved in.
          </span>
        </span>
      </label>
    </section>
  );
}

const VALUE_TYPE_LABELS: Record<CustomFieldValueType, string> = {
  TEXT: 'Text',
  NUMBER: 'Number',
  BOOLEAN: 'Yes/No',
  DATE: 'Date',
};

/**
 * architecture-patterns/104-jsonb-eav-extensibility.md (WO-104.3) — define
 * a bounded set of extra fields per wired entity type (Supplier, today).
 * Application logic never reads a value defined here to make a decision;
 * this is a display/reporting overlay only, embedded on the entity's own
 * detail screen via `CustomFieldFormSection` (doc 105, WO-105.1).
 */
function CustomFieldsSettingsPanel() {
  const { can } = useAdminSession();
  const canManage = can('settings.custom-fields.manage');

  const [entityTypes, setEntityTypes] = useState<CustomFieldEntityType[] | null>(null);
  const [entityType, setEntityType] = useState<CustomFieldEntityType | ''>('');
  const [definitions, setDefinitions] = useState<CustomFieldDefinition[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newField, setNewField] = useState<{ key: string; label: string; valueType: CustomFieldValueType; isRequired: boolean }>({
    key: '',
    label: '',
    valueType: 'TEXT',
    isRequired: false,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!canManage) return;
    adminFetch<{ entityTypes: CustomFieldEntityType[] }>('/admin/custom-fields/entity-types')
      .then((res) => {
        setEntityTypes(res.entityTypes);
        setEntityType(res.entityTypes[0] ?? '');
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not load entity types'));
  }, [canManage]);

  const loadDefinitions = useCallback(async () => {
    if (!entityType) return;
    try {
      setDefinitions(await adminFetch<CustomFieldDefinition[]>('/admin/custom-fields/definitions', { query: { entityType } }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load custom fields');
    }
  }, [entityType]);

  useEffect(() => {
    void loadDefinitions();
  }, [loadDefinitions]);

  async function addField() {
    if (!entityType || !newField.key || !newField.label) return;
    setSaving(true);
    setError(null);
    try {
      await adminFetch('/admin/custom-fields/definitions', { method: 'POST', body: { entityType, ...newField } });
      setNewField({ key: '', label: '', valueType: 'TEXT', isRequired: false });
      await loadDefinitions();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not add the field');
    } finally {
      setSaving(false);
    }
  }

  async function removeField(id: string) {
    setError(null);
    try {
      await adminFetch(`/admin/custom-fields/definitions/${id}`, { method: 'DELETE' });
      setDefinitions((prev) => prev?.filter((definition) => definition.id !== id) ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not remove the field');
    }
  }

  if (!canManage) {
    return (
      <EmptyState
        title="Custom fields are set up by an administrator"
        description="Defining custom fields needs the settings.custom-fields.manage permission. Ask an administrator who holds it."
      />
    );
  }

  if (!entityTypes) {
    return error ? (
      <p role="alert" className="notice notice-error">
        {error}
      </p>
    ) : (
      <Loading />
    );
  }

  return (
    <section className="max-w-prose">
      <p className="mb-4 text-sm text-neutral-900/60">
        Add your own fields to a Supplier — a certification number, a carbon-footprint figure —
        with no code change. These are for your own reference and reporting; nothing here ever
        drives a pricing, compliance or business decision.
      </p>

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      <label className="mb-4 block max-w-xs">
        <span className="field-label">Entity type</span>
        <select
          value={entityType}
          onChange={(event) => setEntityType(event.target.value as CustomFieldEntityType)}
          className="field-input"
        >
          {entityTypes.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </label>

      <div className="overflow-hidden">
        <DataTable
          rows={definitions ?? undefined}
          loading={!definitions}
          emptyLabel="No custom fields defined yet for this entity type."
          rowKey={(definition) => definition.id}
          columns={[
            {
              header: 'Field',
              cell: (definition) => (
                <>
                  <span className="font-medium text-neutral-900">{definition.label}</span>
                  <span className="ml-2 font-mono text-xs text-neutral-900/60">{definition.key}</span>
                </>
              ),
            },
            { header: 'Type', muted: true, cell: (definition) => VALUE_TYPE_LABELS[definition.valueType] },
            { header: 'Required', muted: true, cell: (definition) => (definition.isRequired ? 'Yes' : 'No') },
            {
              header: '',
              align: 'end',
              cell: (definition) => (
                <button type="button" onClick={() => void removeField(definition.id)} className="btn-text text-feedback-negative">
                  Delete
                </button>
              ),
            },
          ]}
        />
      </div>

      <h3 className="eyebrow mb-3 mt-8">Add a field</h3>
      <div className="grid gap-3 fold:grid-cols-2">
        <label className="block">
          <span className="field-label">Key</span>
          <input
            value={newField.key}
            onChange={(event) => setNewField({ ...newField, key: event.target.value })}
            placeholder="carbon_footprint_kg"
            className="field-input"
          />
        </label>
        <label className="block">
          <span className="field-label">Label</span>
          <input
            value={newField.label}
            onChange={(event) => setNewField({ ...newField, label: event.target.value })}
            placeholder="Carbon footprint (kg)"
            className="field-input"
          />
        </label>
        <label className="block">
          <span className="field-label">Type</span>
          <select
            value={newField.valueType}
            onChange={(event) => setNewField({ ...newField, valueType: event.target.value as CustomFieldValueType })}
            className="field-input"
          >
            {Object.entries(VALUE_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 self-end pb-2">
          <input
            type="checkbox"
            checked={newField.isRequired}
            onChange={(event) => setNewField({ ...newField, isRequired: event.target.checked })}
            className="field-check"
          />
          <span className="text-sm text-neutral-900">Required</span>
        </label>
      </div>
      <button type="button" onClick={() => void addField()} disabled={saving || !newField.key || !newField.label} className="btn-primary mt-4">
        {saving ? 'Adding…' : 'Add field'}
      </button>
    </section>
  );
}

/**
 * architecture-patterns/113-micro-frontend-embedding.md (WO-113.2) — define
 * which third-party tools may be embedded. Viewing an already-configured
 * one is a separate screen (`/admin/embeds`, `analytics.view`) — this tab
 * only ever changes which widgets exist, never renders one.
 */
function EmbedsSettingsPanel() {
  const { can } = useAdminSession();
  const canManage = can('settings.embeds.manage');

  const [widgets, setWidgets] = useState<EmbeddedWidget[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newWidget, setNewWidget] = useState({ key: '', label: '', targetUrl: '' });
  const [saving, setSaving] = useState(false);

  const loadWidgets = useCallback(async () => {
    try {
      setWidgets(await adminFetch<EmbeddedWidget[]>('/admin/embeds/all'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load embedded widgets');
    }
  }, []);

  useEffect(() => {
    if (!canManage) return;
    void loadWidgets();
  }, [canManage, loadWidgets]);

  async function addWidget() {
    if (!newWidget.key || !newWidget.label || !newWidget.targetUrl) return;
    setSaving(true);
    setError(null);
    try {
      await adminFetch('/admin/embeds', { method: 'POST', body: newWidget });
      setNewWidget({ key: '', label: '', targetUrl: '' });
      await loadWidgets();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not add the widget');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(widget: EmbeddedWidget) {
    setError(null);
    try {
      const updated = await adminFetch<EmbeddedWidget>(`/admin/embeds/${widget.id}`, { method: 'PATCH', body: { isActive: !widget.isActive } });
      setWidgets((prev) => prev?.map((w) => (w.id === widget.id ? updated : w)) ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update the widget');
    }
  }

  async function removeWidget(id: string) {
    setError(null);
    try {
      await adminFetch(`/admin/embeds/${id}`, { method: 'DELETE' });
      setWidgets((prev) => prev?.filter((w) => w.id !== id) ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not remove the widget');
    }
  }

  if (!canManage) {
    return (
      <EmptyState
        title="Embeds are set up by an administrator"
        description="Registering an embeddable tool needs the settings.embeds.manage permission. Ask an administrator who holds it."
      />
    );
  }

  if (!widgets) {
    return error ? (
      <p role="alert" className="notice notice-error">
        {error}
      </p>
    ) : (
      <Loading />
    );
  }

  return (
    <section className="max-w-prose">
      <p className="mb-4 text-sm text-neutral-900/60">
        Embed a third-party tool — an analytics dashboard, a specialized reporting
        widget — directly alongside the rest of the ERP. Each viewer gets their own
        short-lived, scoped link; nobody&rsquo;s session credential is ever shared with it.
      </p>

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      <div className="overflow-hidden">
        <DataTable
          rows={widgets}
          emptyLabel="No embedded tools yet."
          rowKey={(widget) => widget.id}
          columns={[
            {
              header: 'Widget',
              cell: (widget) => (
                <>
                  <span className="font-medium text-neutral-900">{widget.label}</span>
                  <span className="mt-0.5 block break-all text-xs text-neutral-900/60">{widget.targetUrl}</span>
                </>
              ),
            },
            { header: 'Key', muted: true, cell: (widget) => <span className="font-mono text-xs">{widget.key}</span> },
            {
              header: 'State',
              cell: (widget) => (
                <button type="button" onClick={() => void toggleActive(widget)} className="btn-text">
                  {widget.isActive ? 'Active' : 'Inactive'}
                </button>
              ),
            },
            {
              header: '',
              align: 'end',
              cell: (widget) => (
                <button type="button" onClick={() => void removeWidget(widget.id)} className="btn-text text-feedback-negative">
                  Delete
                </button>
              ),
            },
          ]}
        />
      </div>

      <h3 className="eyebrow mb-3 mt-8">Add an embedded tool</h3>
      <div className="grid gap-3 fold:grid-cols-2">
        <label className="block">
          <span className="field-label">Key</span>
          <input
            value={newWidget.key}
            onChange={(event) => setNewWidget({ ...newWidget, key: event.target.value })}
            placeholder="predictive-analytics"
            className="field-input"
          />
        </label>
        <label className="block">
          <span className="field-label">Label</span>
          <input
            value={newWidget.label}
            onChange={(event) => setNewWidget({ ...newWidget, label: event.target.value })}
            placeholder="Predictive analytics"
            className="field-input"
          />
        </label>
        <label className="block fold:col-span-2">
          <span className="field-label">Target URL</span>
          <input
            value={newWidget.targetUrl}
            onChange={(event) => setNewWidget({ ...newWidget, targetUrl: event.target.value })}
            placeholder="https://vendor.example/embed"
            className="field-input"
          />
        </label>
      </div>
      <button
        type="button"
        onClick={() => void addWidget()}
        disabled={saving || !newWidget.key || !newWidget.label || !newWidget.targetUrl}
        className="btn-primary mt-4"
      >
        {saving ? 'Adding…' : 'Add widget'}
      </button>
    </section>
  );
}

/**
 * architecture-patterns/143-micro-frontend-architecture.md (WO-143.3) —
 * registration UI + the design-law attestation flow. Suspend/activate is
 * the kill switch, never a delete: a fragment always keeps its history of
 * having been registered.
 */
function FragmentsSettingsPanel() {
  const { can } = useAdminSession();
  const canManage = can('settings.fragments.manage');

  const [fragments, setFragments] = useState<MicroFrontendFragment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newFragment, setNewFragment] = useState({ key: '', label: '', remoteUrl: '', mountPoints: '' });
  const [attested, setAttested] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadFragments = useCallback(async () => {
    try {
      setFragments(await adminFetch<MicroFrontendFragment[]>('/admin/fragments'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load fragments');
    }
  }, []);

  useEffect(() => {
    if (!canManage) return;
    void loadFragments();
  }, [canManage, loadFragments]);

  async function registerFragment() {
    const mountPoints = newFragment.mountPoints
      .split(',')
      .map((point) => point.trim())
      .filter(Boolean);
    if (!newFragment.key || !newFragment.label || !newFragment.remoteUrl || mountPoints.length === 0 || !attested) return;
    setSaving(true);
    setError(null);
    try {
      await adminFetch('/admin/fragments', {
        method: 'POST',
        body: { key: newFragment.key, label: newFragment.label, remoteUrl: newFragment.remoteUrl, mountPoints, attestationConfirmed: attested },
      });
      setNewFragment({ key: '', label: '', remoteUrl: '', mountPoints: '' });
      setAttested(false);
      await loadFragments();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not register the fragment');
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(fragment: MicroFrontendFragment) {
    setError(null);
    try {
      const updated = await adminFetch<MicroFrontendFragment>(`/admin/fragments/${fragment.id}/${fragment.status === 'ACTIVE' ? 'suspend' : 'activate'}`, {
        method: 'POST',
      });
      setFragments((prev) => prev?.map((f) => (f.id === fragment.id ? updated : f)) ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update the fragment');
    }
  }

  if (!canManage) {
    return (
      <EmptyState
        title="Fragments are set up by an administrator"
        description="Registering a micro-frontend fragment needs the settings.fragments.manage permission. Ask an administrator who holds it."
      />
    );
  }

  if (!fragments) {
    return error ? (
      <p role="alert" className="notice notice-error">
        {error}
      </p>
    ) : (
      <Loading />
    );
  }

  return (
    <section className="max-w-prose">
      <p className="mb-4 text-sm text-neutral-900/60">
        Register a specialized tool as its own independently-deployed fragment, mounted into
        one or more named admin screens. Each viewer gets their own short-lived, scoped link —
        the same mechanism embeds already use. Suspending a fragment stops it being served
        immediately, with no deploy.
      </p>

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      <div className="overflow-hidden">
        <DataTable
          rows={fragments}
          emptyLabel="No fragments registered yet."
          rowKey={(fragment) => fragment.id}
          columns={[
            {
              header: 'Fragment',
              cell: (fragment) => (
                <>
                  <span className="font-medium text-neutral-900">{fragment.label}</span>
                  <span className="mt-0.5 block break-all text-xs text-neutral-900/60">{fragment.remoteUrl}</span>
                </>
              ),
            },
            { header: 'Key', muted: true, cell: (fragment) => <span className="font-mono text-xs">{fragment.key}</span> },
            {
              header: 'Mount points',
              muted: true,
              cell: (fragment) => fragment.mountPoints.join(', '),
            },
            {
              header: 'State',
              cell: (fragment) => (
                <button type="button" onClick={() => void toggleStatus(fragment)} className="btn-text">
                  {fragment.status === 'ACTIVE' ? 'Active' : 'Suspended'}
                </button>
              ),
            },
          ]}
        />
      </div>

      <h3 className="eyebrow mb-3 mt-8">Register a fragment</h3>
      <div className="grid gap-3 fold:grid-cols-2">
        <label className="block">
          <span className="field-label">Key</span>
          <input
            value={newFragment.key}
            onChange={(event) => setNewFragment({ ...newFragment, key: event.target.value })}
            placeholder="predictive-analytics-widget"
            className="field-input"
          />
        </label>
        <label className="block">
          <span className="field-label">Label</span>
          <input
            value={newFragment.label}
            onChange={(event) => setNewFragment({ ...newFragment, label: event.target.value })}
            placeholder="Predictive analytics"
            className="field-input"
          />
        </label>
        <label className="block fold:col-span-2">
          <span className="field-label">Remote URL</span>
          <input
            value={newFragment.remoteUrl}
            onChange={(event) => setNewFragment({ ...newFragment, remoteUrl: event.target.value })}
            placeholder="https://vendor.example/fragment"
            className="field-input"
          />
        </label>
        <label className="block fold:col-span-2">
          <span className="field-label">Mount points</span>
          <input
            value={newFragment.mountPoints}
            onChange={(event) => setNewFragment({ ...newFragment, mountPoints: event.target.value })}
            placeholder="supplier-detail, order-detail"
            className="field-input"
          />
        </label>
      </div>
      <label className="mt-4 flex items-start gap-2">
        <input type="checkbox" checked={attested} onChange={(event) => setAttested(event.target.checked)} className="field-check mt-0.5" />
        <span className="text-sm text-neutral-900">
          I confirm this fragment&rsquo;s own remote deployment has been checked against the seven
          screen widths for overflow and contrast before being registered — this repository&rsquo;s
          own automated checks cannot reach across a fragment&rsquo;s own deployment boundary.
        </span>
      </label>
      <button
        type="button"
        onClick={() => void registerFragment()}
        disabled={saving || !newFragment.key || !newFragment.label || !newFragment.remoteUrl || !newFragment.mountPoints || !attested}
        className="btn-primary mt-4"
      >
        {saving ? 'Registering…' : 'Register fragment'}
      </button>
    </section>
  );
}

const FIELD_VALUE_TYPES: FieldMetadataValueType[] = ['TEXT', 'NUMBER', 'BOOLEAN', 'DATE', 'SELECT'];
const EMPTY_FIELD: FieldMetadata = { key: '', label: '', valueType: 'TEXT', isRequired: false };

/**
 * architecture-patterns/141-general-metadata-driven-ui-engine.md (WO-141.1)
 * — the admin editor for a `FormMetadata` definition's own field shape.
 * `MetadataDrivenEntityForm` (on the Supplier detail screen) is what
 * actually renders whatever is saved here, with no frontend deploy.
 */
function MetadataFormsSettingsPanel() {
  const { can } = useAdminSession();
  const canManage = can('settings.metadata-forms.manage');

  const [entityType, setEntityType] = useState('Supplier');
  const [fields, setFields] = useState<FieldMetadata[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function load() {
    setLoaded(false);
    setError(null);
    try {
      const form = await adminFetch<FormMetadata | null>(`/admin/metadata-forms/${entityType}`);
      setFields(form?.fields ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the form definition');
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    if (!canManage || !entityType) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage, entityType]);

  function updateField(index: number, patch: Partial<FieldMetadata>) {
    setFields((prev) => prev.map((field, i) => (i === index ? { ...field, ...patch } : field)));
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await adminFetch(`/admin/metadata-forms/${entityType}`, { method: 'PUT', body: { fields } });
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the form definition');
    } finally {
      setSaving(false);
    }
  }

  if (!canManage) {
    return (
      <EmptyState
        title="Metadata forms are set up by an administrator"
        description="Defining a metadata-driven form needs the settings.metadata-forms.manage permission. Ask an administrator who holds it."
      />
    );
  }

  return (
    <section className="max-w-prose">
      <p className="mb-4 text-sm text-neutral-900/60">
        Define which fields render on a metadata-driven screen, with no frontend deploy. Today
        this reaches the Supplier detail screen&rsquo;s own &ldquo;Additional details&rdquo; section;
        values are stored as ordinary entity attributes.
      </p>

      <label className="mb-4 block max-w-xs">
        <span className="field-label">Entity type</span>
        <input value={entityType} onChange={(event) => setEntityType(event.target.value)} placeholder="Supplier" className="field-input" />
      </label>

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      {!loaded ? (
        <Loading />
      ) : (
        <>
          <div className="space-y-4">
            {fields.map((field, index) => (
              <div key={index} className="grid gap-3 fold:grid-cols-[1fr_1fr_auto_auto_auto]">
                <label className="block">
                  <span className="field-label">Key</span>
                  <input value={field.key} onChange={(event) => updateField(index, { key: event.target.value })} className="field-input" />
                </label>
                <label className="block">
                  <span className="field-label">Label</span>
                  <input value={field.label} onChange={(event) => updateField(index, { label: event.target.value })} className="field-input" />
                </label>
                <label className="block">
                  <span className="field-label">Type</span>
                  <select
                    value={field.valueType}
                    onChange={(event) => updateField(index, { valueType: event.target.value as FieldMetadataValueType })}
                    className="field-input"
                  >
                    {FIELD_VALUE_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-2 self-end pb-2">
                  <input type="checkbox" checked={field.isRequired ?? false} onChange={(event) => updateField(index, { isRequired: event.target.checked })} className="field-check" />
                  <span className="text-sm text-neutral-900">Required</span>
                </label>
                <button
                  type="button"
                  onClick={() => setFields((prev) => prev.filter((_, i) => i !== index))}
                  className="btn-text self-end pb-2 text-feedback-negative"
                >
                  Remove
                </button>
                {field.valueType === 'SELECT' ? (
                  <label className="block fold:col-span-5">
                    <span className="field-label">Options (comma-separated)</span>
                    <input
                      value={(field.options ?? []).join(', ')}
                      onChange={(event) =>
                        updateField(index, {
                          options: event.target.value
                            .split(',')
                            .map((option) => option.trim())
                            .filter(Boolean),
                        })
                      }
                      className="field-input"
                    />
                  </label>
                ) : null}
              </div>
            ))}
          </div>

          <button type="button" onClick={() => setFields((prev) => [...prev, { ...EMPTY_FIELD }])} className="btn-secondary mt-4">
            Add field
          </button>

          <div className="mt-6 flex items-center gap-3 border-t border-neutral-100 pt-4">
            <button type="button" onClick={() => void save()} disabled={saving} className="btn-primary">
              {saving ? 'Saving…' : 'Save form definition'}
            </button>
            {saved ? <span className="text-sm text-green-700">Saved.</span> : null}
          </div>
        </>
      )}
    </section>
  );
}

const APPROVAL_SUBJECT_TYPES: Array<{ value: ApprovalSubjectType; label: string }> = [
  { value: 'PURCHASE_REQUISITION', label: 'Purchase requisitions' },
  { value: 'WALLET_ADJUSTMENT', label: 'Wallet adjustments' },
];

/**
 * architecture-patterns/142-bpmn-visual-workflow-engine.md (WO-142.2) — the
 * BPMN diagram IS the editor for `ApprovalChain`'s own existing steps;
 * saving compiles it into the identical rows a form-based admin screen
 * would produce (`ApprovalService` remains the only thing that executes
 * one). Name each task node after the approver's own permission key, or
 * "user:<userId>" for a specific approver.
 */
function BpmnWorkflowsSettingsPanel() {
  const { can } = useAdminSession();
  const canManage = can('settings.bpmn-workflows.manage');

  const [subjectType, setSubjectType] = useState<ApprovalSubjectType>('PURCHASE_REQUISITION');
  const [definition, setDefinition] = useState<BpmnWorkflowDefinition | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canManage) return;
    setDefinition(undefined);
    setError(null);
    adminFetch<BpmnWorkflowDefinition | null>(`/admin/bpmn-workflows/${subjectType}`)
      .then(setDefinition)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not load the workflow'));
  }, [canManage, subjectType]);

  async function save(diagramXml: string) {
    const saved = await adminFetch<BpmnWorkflowDefinition>(`/admin/bpmn-workflows/${subjectType}`, { method: 'PUT', body: { diagramXml } });
    setDefinition(saved);
  }

  if (!canManage) {
    return (
      <EmptyState
        title="Approval workflows are set up by an administrator"
        description="Redrawing an approval workflow needs the settings.bpmn-workflows.manage permission. Ask an administrator who holds it."
      />
    );
  }

  return (
    <section>
      <p className="mb-4 max-w-prose text-sm text-neutral-900/60">
        Redraw an approval chain&rsquo;s own shape — add a tier, change who approves a
        step — with no engineering deploy. This compiles into the same rows the
        typed approval engine already executes; it never runs the diagram itself.
      </p>

      <label className="mb-4 block max-w-xs">
        <span className="field-label">Subject type</span>
        <select value={subjectType} onChange={(event) => setSubjectType(event.target.value as ApprovalSubjectType)} className="field-input">
          {APPROVAL_SUBJECT_TYPES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      {definition === undefined ? (
        <Loading />
      ) : (
        <BpmnEditor key={subjectType} initialXml={definition?.diagramXml ?? null} onSave={save} />
      )}
    </section>
  );
}
