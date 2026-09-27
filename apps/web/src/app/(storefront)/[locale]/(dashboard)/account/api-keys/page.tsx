'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { DEFAULT_LOCALE, formatDate, isLocale, type Locale } from '@newax/shared';
import {
  API_KEY_DEFAULT_LIFETIME_DAYS,
  API_KEY_LIFETIME_OPTIONS_DAYS,
  CUSTOMER_SCOPE_CATALOG,
  CUSTOMER_SCOPE_RESOURCES,
  type CustomerScopeResource,
} from '@/constants/permissions';
import { customerFetch } from '@/lib/customer-client';
import { request } from '@/lib/api-client';
import { isModuleEnabled } from '@/utils/module-gate';
import { SecretOnce } from '@/components/common/secret-once';
import { StatusBadge } from '@/components/common/status-badge';
import { Button, Dialog, EmptyState, Loading, PageHeader } from '@/components/ui';
import type { ApiKeyView, DeploymentMeta, IssuedApiKey, PaginatedResponse } from '@/types/api';

type Access = 'none' | 'read' | 'write';

/** The message key for each resource — `store-credit` cannot be a message key as-is. */
const RESOURCE_MESSAGE: Record<CustomerScopeResource, string> = {
  profile: 'resource_profile',
  orders: 'resource_orders',
  addresses: 'resource_addresses',
  measurements: 'resource_measurements',
  wishlist: 'resource_wishlist',
  reviews: 'resource_reviews',
  returns: 'resource_returns',
  loyalty: 'resource_loyalty',
  'store-credit': 'resource_storeCredit',
  'b2b-account': 'resource_b2bAccount',
  support: 'resource_support',
};

/** Whether a resource offers a write scope at all — profile, orders, loyalty and store credit are read-only. */
const WRITABLE = new Set<CustomerScopeResource>(
  CUSTOMER_SCOPE_CATALOG.filter((scope) => scope.access === 'write').map((scope) => scope.resource),
);

/** The module whose routes a resource reaches, to hide what this deployment does not run (MOD-1). */
const MODULE_OF = new Map<CustomerScopeResource, string | undefined>(
  CUSTOMER_SCOPE_CATALOG.map((scope): [CustomerScopeResource, string | undefined] => [
    scope.resource,
    'module' in scope ? scope.module : undefined,
  ]),
);

/** A key's stored scopes, read back as one access level per resource. */
function accessOf(scopes: readonly string[]): Map<CustomerScopeResource, Access> {
  const access = new Map<CustomerScopeResource, Access>();
  for (const scope of CUSTOMER_SCOPE_CATALOG) {
    if (!scopes.includes(scope.key)) continue;
    if (scope.access === 'write' || !access.has(scope.resource)) access.set(scope.resource, scope.access);
  }
  return access;
}

/** One access level per resource, back into the fewest scopes that grant it (write implies read on the server). */
function scopesOf(access: Map<CustomerScopeResource, Access>): string[] {
  return [...access.entries()]
    .filter(([, level]) => level !== 'none')
    .map(([resource, level]) => `${resource}:${level}`);
}

type FormState = { mode: 'create' } | { mode: 'edit'; key: ApiKeyView };

/**
 * A customer's own personal API keys (163-personal-api-keys.md) — for an
 * app, a script or an AI assistant acting on their account. One job:
 * manage your keys. Each key reaches only the parts of the account it was
 * given, never the password, email or phone, and nothing any other
 * customer owns.
 */
export default function AccountApiKeysPage() {
  const t = useTranslations('account.apiKeys');
  const tc = useTranslations('common');
  const rawLocale = useLocale();
  const locale: Locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;

  const [keys, setKeys] = useState<ApiKeyView[] | null>(null);
  const [modules, setModules] = useState<string[] | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<IssuedApiKey | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [rotating, setRotating] = useState<ApiKeyView | null>(null);
  const [revoking, setRevoking] = useState<ApiKeyView | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      // The newest hundred: a person holds at most twenty live keys per
      // surface, so this is every live key plus recent history.
      const page = await customerFetch<PaginatedResponse<ApiKeyView>>('/api-keys', {
        query: { surface: 'STOREFRONT', pageSize: 100 },
      });
      setKeys(page.data);
    } catch {
      setError(t('loadFailed'));
    }
  }, [t]);

  useEffect(() => {
    void load();
    request<DeploymentMeta>('/meta')
      .then((meta) => setModules(meta.modules))
      .catch(() => undefined);
  }, [load]);

  const resources = useMemo(
    () => CUSTOMER_SCOPE_RESOURCES.filter((resource) => isModuleEnabled(MODULE_OF.get(resource), modules)),
    [modules],
  );

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('failed'));
    } finally {
      setBusy(false);
    }
  }

  const summary = (key: ApiKeyView) =>
    [...accessOf(key.customerScopes).entries()]
      .map(([resource, level]) => `${t(RESOURCE_MESSAGE[resource])} (${t(level === 'write' ? 'accessWrite' : 'accessRead')})`)
      .join(' · ');

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('body')}
        action={
          <Button onClick={() => setForm({ mode: 'create' })}>
            {t('create')}
          </Button>
        }
      />

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      {issued ? (
        <SecretOnce
          title={t('secretTitle', { name: issued.key.name })}
          warning={t('secretWarning')}
          secret={issued.secret}
          usage={`Authorization: Bearer ${issued.key.prefix}…`}
          copyLabel={t('copy')}
          copiedLabel={t('copied')}
          copyFailedLabel={t('copyFailed')}
          dismissLabel={t('secretDone')}
          onDismiss={() => setIssued(null)}
        />
      ) : null}

      {keys === null ? (
        error ? (
          <Button
            variant="secondary"
            onClick={() => {
              setError(null);
              void load();
            }}
          >
            {tc('retry')}
          </Button>
        ) : (
          // `Loading` adds its own ellipsis; the catalogue's string carries one too.
          <Loading label={tc('loading').replace(/…$/u, '')} />
        )
      ) : keys.length === 0 ? (
        // The page's own primary action, "Create key", sits directly above.
        <EmptyState title={t('empty')} description={t('emptyBody')} />
      ) : (
        <ul className="divide-y divide-neutral-100">
          {keys.map((key) => (
            <li key={key.id} className="flex flex-wrap items-start justify-between gap-3 py-4">
              <div className="min-w-0 space-y-1">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-neutral-900">{key.name}</span>
                  <StatusBadge status={key.status} label={t(`status_${key.status}`)} />
                </p>
                <p className="font-mono text-xs text-neutral-900/60" dir="ltr">
                  {key.prefix}…{key.lastFour}
                </p>
                <p className="text-sm text-neutral-900/70">{summary(key)}</p>
                <p className="text-xs text-neutral-900/60">
                  {key.lastUsedAt ? t('lastUsed', { date: formatDate(key.lastUsedAt, locale) }) : t('neverUsed')}
                  {' · '}
                  {key.revokedAt
                    ? t('revokedOn', { date: formatDate(key.revokedAt, locale) })
                    : t('expires', { date: formatDate(key.expiresAt, locale) })}
                </p>
              </div>
              {key.status === 'REVOKED' ? null : (
                <div className="flex shrink-0 gap-1">
                  <button type="button" className="btn-text text-sm" onClick={() => setForm({ mode: 'edit', key })}>
                    {t('edit')}
                  </button>
                  <button type="button" className="btn-text text-sm" onClick={() => setRotating(key)}>
                    {t('rotate')}
                  </button>
                  <button
                    type="button"
                    className="btn-text text-sm text-feedback-negative"
                    onClick={() => setRevoking(key)}
                  >
                    {t('revoke')}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {form ? (
        <KeyForm
          state={form}
          resources={resources}
          busy={busy}
          onCancel={() => setForm(null)}
          onSubmit={(input) =>
            run(async () => {
              if (form.mode === 'create') {
                setIssued(
                  await customerFetch<IssuedApiKey>('/api-keys', {
                    method: 'POST',
                    body: { surface: 'STOREFRONT', ...input },
                  }),
                );
              } else {
                await customerFetch(`/api-keys/${form.key.id}`, {
                  method: 'PATCH',
                  body: { name: input.name, customerScopes: input.customerScopes },
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
              setIssued(
                await customerFetch<IssuedApiKey>(`/api-keys/${rotating.id}/rotate`, {
                  method: 'POST',
                  body: { expiresInDays },
                }),
              );
              setRotating(null);
            })
          }
        />
      ) : null}

      {revoking ? (
        <Dialog
          open
          onClose={busy ? () => undefined : () => setRevoking(null)}
          title={t('revokeTitle', { name: revoking.name })}
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setRevoking(null)} disabled={busy}>
                {t('cancel')}
              </Button>
              <Button
                variant="danger"
                loading={busy}
                loadingLabel={t('working')}
                onClick={() =>
                  run(async () => {
                    await customerFetch(`/api-keys/${revoking.id}/revoke`, { method: 'POST' });
                    setRevoking(null);
                  })
                }
              >
                {t('revokeConfirm')}
              </Button>
            </div>
          }
        >
          <p className="text-sm text-neutral-900/70">{t('revokeBody')}</p>
        </Dialog>
      ) : null}
    </>
  );
}

function KeyForm({
  state,
  resources,
  busy,
  onCancel,
  onSubmit,
}: {
  state: FormState;
  resources: readonly CustomerScopeResource[];
  busy: boolean;
  onCancel: () => void;
  onSubmit: (input: { name: string; customerScopes: string[]; expiresInDays: number }) => void;
}) {
  const t = useTranslations('account.apiKeys');
  const editing = state.mode === 'edit' ? state.key : null;
  const [name, setName] = useState(editing?.name ?? '');
  const [expiresInDays, setExpiresInDays] = useState<number>(API_KEY_DEFAULT_LIFETIME_DAYS);
  const [access, setAccess] = useState<Map<CustomerScopeResource, Access>>(() =>
    accessOf(editing?.customerScopes ?? []),
  );

  const scopes = scopesOf(access);
  const valid = name.trim().length > 0 && scopes.length > 0;

  function choose(resource: CustomerScopeResource, level: Access) {
    const next = new Map(access);
    next.set(resource, level);
    setAccess(next);
  }

  return (
    <Dialog
      open
      onClose={busy ? () => undefined : onCancel}
      title={editing ? t('editTitle', { name: editing.name }) : t('createTitle')}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            {t('cancel')}
          </Button>
          <Button
            onClick={() => onSubmit({ name: name.trim(), customerScopes: scopes, expiresInDays })}
            disabled={!valid}
            loading={busy}
            loadingLabel={t('working')}
            aria-describedby={scopes.length === 0 ? 'api-key-no-access' : undefined}
          >
            {editing ? t('save') : t('create')}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <label className="block">
          <span className="field-label">{t('name')}</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={80}
            placeholder={t('namePlaceholder')}
            className="field-input"
          />
        </label>

        {editing ? null : (
          <label className="block">
            <span className="field-label">{t('expiresAfter')}</span>
            <select
              value={expiresInDays}
              onChange={(event) => setExpiresInDays(Number(event.target.value))}
              className="field-input"
            >
              {API_KEY_LIFETIME_OPTIONS_DAYS.map((days) => (
                <option key={days} value={days}>
                  {t('days', { count: days })}
                </option>
              ))}
            </select>
          </label>
        )}

        <fieldset>
          <legend className="field-label">{t('access')}</legend>
          <ul className="space-y-2">
            {resources.map((resource) => (
              <li key={resource} className="flex flex-wrap items-center justify-between gap-2">
                <label htmlFor={`api-key-access-${resource}`} className="text-sm text-neutral-900">
                  {t(RESOURCE_MESSAGE[resource])}
                </label>
                <select
                  id={`api-key-access-${resource}`}
                  value={access.get(resource) ?? 'none'}
                  onChange={(event) => choose(resource, event.target.value as Access)}
                  className="field-input w-auto"
                >
                  <option value="none">{t('accessNone')}</option>
                  <option value="read">{t('accessRead')}</option>
                  {WRITABLE.has(resource) ? <option value="write">{t('accessWrite')}</option> : null}
                </select>
              </li>
            ))}
          </ul>
          {scopes.length === 0 ? (
            <p id="api-key-no-access" className="mt-2 text-xs text-neutral-900/60">
              {t('noAccessChosen')}
            </p>
          ) : null}
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
  const t = useTranslations('account.apiKeys');
  const [expiresInDays, setExpiresInDays] = useState<number>(API_KEY_DEFAULT_LIFETIME_DAYS);

  return (
    <Dialog
      open
      onClose={busy ? () => undefined : onCancel}
      title={t('rotateTitle', { name: apiKey.name })}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            {t('cancel')}
          </Button>
          <Button onClick={() => onConfirm(expiresInDays)} loading={busy} loadingLabel={t('working')}>
            {t('rotateConfirm')}
          </Button>
        </div>
      }
    >
      <p className="mb-4 text-sm text-neutral-900/70">{t('rotateBody')}</p>
      <label className="block">
        <span className="field-label">{t('rotateExpires')}</span>
        <select
          value={expiresInDays}
          onChange={(event) => setExpiresInDays(Number(event.target.value))}
          className="field-input"
        >
          {API_KEY_LIFETIME_OPTIONS_DAYS.map((days) => (
            <option key={days} value={days}>
              {t('days', { count: days })}
            </option>
          ))}
        </select>
      </label>
    </Dialog>
  );
}
