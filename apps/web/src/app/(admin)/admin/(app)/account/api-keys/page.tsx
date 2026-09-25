'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatDate, formatDateTime } from '@newax/shared';
import {
  API_KEY_DEFAULT_LIFETIME_DAYS,
  API_KEY_LIFETIME_OPTIONS_DAYS,
  NON_DELEGATABLE_PERMISSIONS,
  PERMISSION_CATALOG,
  PERMISSION_GROUPS,
  delegatablePermissionsOf,
} from '@/constants/permissions';
import { adminFetch } from '@/lib/admin-client';
import { useAdminSession } from '@/components/admin/session';
import { SecretOnce } from '@/components/common/secret-once';
import { StatusBadge } from '@/components/common/status-badge';
import { Button, ConfirmDialog, DataTable, Dialog, Disclosure, PageHeader, Pagination } from '@/components/ui';
import type { ApiKeyView, IssuedApiKey, PaginatedResponse } from '@/types/api';

const PAGE_SIZE = 20;
const LABEL_BY_KEY = new Map(PERMISSION_CATALOG.map((permission) => [permission.key as string, permission.label]));

type FormState = { mode: 'create' } | { mode: 'edit'; key: ApiKeyView };

/**
 * My API keys — a staff member gives a script, an integration or an AI agent
 * a slice of their own admin access (163-personal-api-keys.md).
 *
 * One job: manage your own keys. The list is the overview; a row opens to
 * the permissions it carries. A key never does more than its owner can right
 * now, so the picker offers only what this person holds and may delegate —
 * and says, one level down, what they hold but can never put in a key, and
 * why (PRM-2).
 */
export default function MyApiKeysPage() {
  const session = useAdminSession();
  const [keys, setKeys] = useState<PaginatedResponse<ApiKeyView> | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<IssuedApiKey | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [rotating, setRotating] = useState<ApiKeyView | null>(null);
  const [revoking, setRevoking] = useState<ApiKeyView | null>(null);
  const [busy, setBusy] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const delegatable = useMemo(() => delegatablePermissionsOf(session.permissions), [session.permissions]);
  const heldButLocked = useMemo(
    () => NON_DELEGATABLE_PERMISSIONS.filter((entry) => session.can(entry.key)),
    [session],
  );

  const load = useCallback(async () => {
    try {
      setKeys(
        await adminFetch<PaginatedResponse<ApiKeyView>>('/api-keys', {
          query: { surface: 'ADMIN', page, pageSize: PAGE_SIZE },
        }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load your API keys.');
    }
  }, [page]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That did not work. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const canCreate = delegatable.length > 0;

  return (
    <>
      <PageHeader
        title="My API keys"
        description="Give a script, an integration or an AI agent part of your access — never more than you hold yourself. A key stops working the moment you revoke it, and shrinks if your own access does."
        action={
          <div className="flex flex-col items-end gap-1">
            <Button
              onClick={() => setForm({ mode: 'create' })}
              disabled={!canCreate}
              aria-describedby={canCreate ? undefined : 'create-key-reason'}
            >
              Create key
            </Button>
            {canCreate ? null : (
              <p id="create-key-reason" className="max-w-xs text-end text-xs text-neutral-900/60">
                You hold no permission that may be put in a key.
              </p>
            )}
          </div>
        }
      />

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}{' '}
          {keys === null ? (
            <button type="button" className="btn-text" onClick={() => void load()}>
              Try again
            </button>
          ) : null}
        </p>
      ) : null}

      {issued ? (
        <SecretOnce
          title={`Your new key — ${issued.key.name}`}
          warning="Copy it now. This is the only time it is shown: we keep only a fingerprint of it. If you lose it, rotate the key to get a new one."
          secret={issued.secret}
          usage={`Authorization: Bearer ${issued.key.prefix}…`}
          copyLabel="Copy"
          copiedLabel="Copied"
          copyFailedLabel="Your browser blocked copying — the key is selected; copy it by hand."
          dismissLabel="I have copied it"
          onDismiss={() => setIssued(null)}
        />
      ) : null}

      <DataTable
        rows={keys?.data}
        loading={keys === null && !error}
        emptyLabel="No keys yet. Create one to connect a script, an integration or an AI agent."
        rowKey={(key) => key.id}
        onRowClick={(key) => setExpandedId(expandedId === key.id ? null : key.id)}
        isRowExpanded={(key) => key.id === expandedId}
        expandedContent={(key) => <KeyScopes apiKey={key} />}
        columns={[
          {
            header: 'Key',
            cell: (key) => (
              <>
                {/* The keyboard path to the detail — the row's own click is a mouse convenience. */}
                <button
                  type="button"
                  aria-expanded={expandedId === key.id}
                  onClick={(event) => {
                    event.stopPropagation();
                    setExpandedId(expandedId === key.id ? null : key.id);
                  }}
                  className="text-start font-medium text-neutral-900 hover:text-accent-hover"
                >
                  {key.name}
                </button>
                <p className="font-mono text-xs text-neutral-900/60" dir="ltr">
                  {key.prefix}…{key.lastFour}
                </p>
              </>
            ),
          },
          { header: 'Access', cell: (key) => accessSummary(key), muted: true },
          { header: 'Status', cell: (key) => <StatusBadge status={key.status} /> },
          {
            header: 'Last used',
            cell: (key) => (key.lastUsedAt ? formatDateTime(key.lastUsedAt) : 'Never'),
            muted: true,
          },
          {
            header: 'Expires',
            cell: (key) => (key.status === 'REVOKED' ? '—' : formatDate(key.expiresAt)),
            muted: true,
          },
          {
            header: '',
            align: 'end',
            cell: (key) =>
              key.status === 'REVOKED' ? null : (
                <div className="flex justify-end gap-1">
                  <RowAction label="Edit" onClick={() => setForm({ mode: 'edit', key })} />
                  <RowAction label="Rotate" onClick={() => setRotating(key)} />
                  <RowAction label="Revoke" destructive onClick={() => setRevoking(key)} />
                </div>
              ),
          },
        ]}
      />
      {keys ? <Pagination meta={keys.meta} onChange={setPage} itemLabel="keys" /> : null}

      {heldButLocked.length > 0 ? (
        <Disclosure label="Why some of your permissions can never be put in a key">
          <ul className="max-w-prose space-y-2 text-sm text-neutral-900/70">
            {heldButLocked.map((entry) => (
              <li key={entry.key}>
                <span className="font-medium text-neutral-900">{LABEL_BY_KEY.get(entry.key) ?? entry.key}</span>
                {' — '}
                {entry.reason}
              </li>
            ))}
          </ul>
        </Disclosure>
      ) : null}

      {form ? (
        <KeyForm
          state={form}
          delegatable={delegatable}
          busy={busy}
          onCancel={() => setForm(null)}
          onSubmit={(input) =>
            run(async () => {
              if (form.mode === 'create') {
                const created = await adminFetch<IssuedApiKey>('/api-keys', {
                  method: 'POST',
                  body: { surface: 'ADMIN', ...input },
                });
                setIssued(created);
              } else {
                await adminFetch(`/api-keys/${form.key.id}`, {
                  method: 'PATCH',
                  body: { name: input.name, permissionKeys: input.permissionKeys },
                });
              }
              setForm(null);
            })
          }
        />
      ) : null}

      {rotating ? (
        <RotateDialog
          apiKey={rotating}
          busy={busy}
          onCancel={() => setRotating(null)}
          onConfirm={(expiresInDays) =>
            run(async () => {
              const rotated = await adminFetch<IssuedApiKey>(`/api-keys/${rotating.id}/rotate`, {
                method: 'POST',
                body: { expiresInDays },
              });
              setIssued(rotated);
              setRotating(null);
            })
          }
        />
      ) : null}

      <ConfirmDialog
        open={revoking !== null}
        onClose={() => setRevoking(null)}
        busy={busy}
        title={revoking ? `Revoke "${revoking.name}"?` : 'Revoke this key?'}
        description="Anything using it is refused from its very next request. This cannot be undone — create a new key if you need one again."
        confirmLabel="Revoke key"
        onConfirm={() =>
          run(async () => {
            if (!revoking) return;
            await adminFetch(`/api-keys/${revoking.id}/revoke`, { method: 'POST' });
            setRevoking(null);
          })
        }
      />
    </>
  );
}

/** An action inside a row that itself opens on click — the click must not reach the row. */
function RowAction({ label, onClick, destructive = false }: { label: string; onClick: () => void; destructive?: boolean }) {
  return (
    <button
      type="button"
      className={destructive ? 'btn-text text-xs text-feedback-negative' : 'btn-text text-xs'}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      {label}
    </button>
  );
}

function accessSummary(key: ApiKeyView): string {
  if (key.status !== 'ACTIVE') return `${key.permissionKeys.length} permission${key.permissionKeys.length === 1 ? '' : 's'}`;
  const live = `${key.effectiveScopes.length} permission${key.effectiveScopes.length === 1 ? '' : 's'}`;
  return key.pausedScopes.length > 0 ? `${live} · ${key.pausedScopes.length} paused` : live;
}

/** A key's detail, opened from its row: exactly which permissions work now and which are paused. */
function KeyScopes({ apiKey }: { apiKey: ApiKeyView }) {
  const paused = new Set(apiKey.pausedScopes);
  return (
    <div className="space-y-2 px-4 py-3 text-sm">
      <ul className="flex flex-wrap gap-2">
        {apiKey.permissionKeys.map((key) => (
          <li key={key} className="chip">
            {LABEL_BY_KEY.get(key) ?? key}
            {paused.has(key) ? <span className="ms-1 text-neutral-900/60">(paused)</span> : null}
          </li>
        ))}
      </ul>
      {paused.size > 0 ? (
        <p className="max-w-prose text-xs text-neutral-900/60">
          Paused permissions are ones you no longer hold. They resume by themselves if you are granted them again.
        </p>
      ) : null}
      <p className="text-xs text-neutral-900/60">
        Created {formatDateTime(apiKey.createdAt)}
        {apiKey.rotatedAt ? ` · rotated ${formatDateTime(apiKey.rotatedAt)}` : ''}
        {apiKey.revokedAt ? ` · revoked ${formatDateTime(apiKey.revokedAt)}` : ''}
      </p>
    </div>
  );
}

function KeyForm({
  state,
  delegatable,
  busy,
  onCancel,
  onSubmit,
}: {
  state: FormState;
  delegatable: readonly string[];
  busy: boolean;
  onCancel: () => void;
  onSubmit: (input: { name: string; permissionKeys: string[]; expiresInDays: number }) => void;
}) {
  const editing = state.mode === 'edit' ? state.key : null;
  const [name, setName] = useState(editing?.name ?? '');
  const [expiresInDays, setExpiresInDays] = useState<number>(API_KEY_DEFAULT_LIFETIME_DAYS);
  const [selected, setSelected] = useState<Set<string>>(new Set(editing?.permissionKeys ?? []));

  // What may be ticked: what this person may delegate now, plus — when
  // editing — a paused permission the key already carries, which it may keep.
  const offered = new Set([...delegatable, ...(editing?.pausedScopes ?? [])]);
  const groups = PERMISSION_GROUPS.map((group) => ({
    ...group,
    permissions: group.permissions.filter((key) => offered.has(key)),
  })).filter((group) => group.permissions.length > 0);

  function toggle(key: string) {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelected(next);
  }

  const valid = name.trim().length > 0 && selected.size > 0;

  return (
    <Dialog
      open
      onClose={busy ? () => undefined : onCancel}
      title={editing ? `Edit "${editing.name}"` : 'Create an API key'}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={() => onSubmit({ name: name.trim(), permissionKeys: [...selected], expiresInDays })}
            disabled={!valid}
            loading={busy}
          >
            {editing ? 'Save' : 'Create key'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <label className="block">
          <span className="field-label">Name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={80}
            placeholder="Nightly order export"
            className="field-input"
          />
        </label>

        {editing ? null : (
          <label className="block">
            <span className="field-label">Expires after</span>
            <select
              value={expiresInDays}
              onChange={(event) => setExpiresInDays(Number(event.target.value))}
              className="field-input"
            >
              {API_KEY_LIFETIME_OPTIONS_DAYS.map((days) => (
                <option key={days} value={days}>
                  {days} days
                </option>
              ))}
            </select>
          </label>
        )}

        <fieldset className="space-y-3">
          <legend className="field-label">What it may do</legend>
          {groups.map((group) => (
            <div key={group.key}>
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-900/60">{group.label}</p>
              <ul className="mt-1 space-y-1">
                {group.permissions.map((key) => (
                  <li key={key}>
                    <label className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selected.has(key)}
                        onChange={() => toggle(key)}
                        className="field-check mt-0.5"
                      />
                      <span>
                        {LABEL_BY_KEY.get(key) ?? key}
                        {editing?.pausedScopes.includes(key) ? (
                          <span className="ms-1 text-xs text-neutral-900/60">(paused — you no longer hold it)</span>
                        ) : null}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </fieldset>
      </div>
    </Dialog>
  );
}

function RotateDialog({
  apiKey,
  busy,
  onCancel,
  onConfirm,
}: {
  apiKey: ApiKeyView;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (expiresInDays: number) => void;
}) {
  const [expiresInDays, setExpiresInDays] = useState<number>(API_KEY_DEFAULT_LIFETIME_DAYS);

  return (
    <Dialog
      open
      onClose={busy ? () => undefined : onCancel}
      title={`Rotate "${apiKey.name}"?`}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => onConfirm(expiresInDays)} loading={busy}>
            Rotate key
          </Button>
        </div>
      }
    >
      <p className="mb-4 text-sm text-neutral-900/70">
        You get a new secret with the same permissions. The current secret stops working immediately, so update
        whatever uses it.
      </p>
      <label className="block">
        <span className="field-label">New secret expires after</span>
        <select
          value={expiresInDays}
          onChange={(event) => setExpiresInDays(Number(event.target.value))}
          className="field-input"
        >
          {API_KEY_LIFETIME_OPTIONS_DAYS.map((days) => (
            <option key={days} value={days}>
              {days} days
            </option>
          ))}
        </select>
      </label>
    </Dialog>
  );
}
