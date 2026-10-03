'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatDateTime } from '@newax/shared';
import { adminFetch } from '@/lib/admin-client';
import { ConfirmDialog, DataTable, EmptyState, Loading, PageHeader, Pagination, Section } from '@/components/ui';
import { StatusBadge } from '@/components/common/status-badge';
import { useAdminSession } from '@/components/admin/session';
import { ROUTES } from '@/constants/routes';
import type {
  PaginatedResult,
  SsoAccount,
  SsoConnection,
  SsoConnectionList,
  SsoDefaultRoleOption,
} from '@/types/api';

interface FormState {
  label: string;
  issuerUrl: string;
  clientId: string;
  /** Write-only. Blank on an existing connection means "keep the stored secret". */
  credential: string;
  /** As typed — comma- or space-separated. */
  domains: string;
  defaultRoleName: string;
}

const EMPTY_FORM: FormState = { label: '', issuerUrl: '', clientId: '', credential: '', domains: '', defaultRoleName: '' };

const ACCOUNTS_PAGE_SIZE = 20;

function formFrom(connection: SsoConnection): FormState {
  return {
    label: connection.label,
    issuerUrl: connection.issuerUrl,
    clientId: connection.clientId,
    credential: '',
    domains: connection.allowedEmailDomains.join(', '),
    defaultRoleName: connection.defaultRoleName,
  };
}

function domainsFrom(text: string): string[] {
  return text
    .split(/[\s,]+/)
    .map((domain) => domain.trim())
    .filter(Boolean);
}

function accountName(account: SsoAccount): string {
  return [account.firstName, account.lastName].filter(Boolean).join(' ') || account.email || 'An erased account';
}

/**
 * One single sign-on connection — or a new one
 * (access-control-identity/161-sso-identity-federation.md, WO-161.4).
 *
 * `new` is handled by this same route, as the email-accounts editor does: the
 * two differ by a heading and whether the client secret is required.
 *
 * An existing connection shows, beneath its settings, its status and the
 * accounts that came in through it — each one's audit trail, so "who did
 * this let in" is answered on the page that let them in (doc 161, "Click the
 * number"), and a link that should not have happened can be undone there.
 */
export default function SsoConnectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const isNew = id === 'new';
  const router = useRouter();
  const { can } = useAdminSession();
  const canManage = can('settings.sso.manage');
  const canOpenAccounts = can('users.manage');

  const [connection, setConnection] = useState<SsoConnection | null>(null);
  const [redirectUri, setRedirectUri] = useState<string | null>(null);
  const [roles, setRoles] = useState<SsoDefaultRoleOption[] | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(!isNew);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmingSuspend, setConfirmingSuspend] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [enforceBusy, setEnforceBusy] = useState(false);

  const [accounts, setAccounts] = useState<PaginatedResult<SsoAccount> | null>(null);
  const [accountsPage, setAccountsPage] = useState(1);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [unlinking, setUnlinking] = useState<SsoAccount | null>(null);
  const [unlinkBusy, setUnlinkBusy] = useState(false);

  useEffect(() => {
    if (!canManage) return;

    adminFetch<SsoDefaultRoleOption[]>('/admin/sso/roles')
      .then(setRoles)
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load the roles to choose from'));

    if (isNew) {
      // The callback URL is needed before the first connection exists.
      adminFetch<SsoConnectionList>('/admin/sso/connections')
        .then((list) => setRedirectUri(list.redirectUri))
        .catch(() => undefined);
      return;
    }

    adminFetch<SsoConnection>(`/admin/sso/connections/${id}`)
      .then((found) => {
        setConnection(found);
        setRedirectUri(found.redirectUri);
        setForm(formFrom(found));
      })
      .catch((cause) => setLoadError(cause instanceof Error ? cause.message : 'Could not load this connection'))
      .finally(() => setLoading(false));
  }, [canManage, id, isNew]);

  const loadAccounts = useCallback(() => {
    if (!canManage || isNew) return;
    setAccountsError(null);
    adminFetch<PaginatedResult<SsoAccount>>(`/admin/sso/connections/${id}/accounts`, {
      query: { page: accountsPage, pageSize: ACCOUNTS_PAGE_SIZE },
    })
      .then(setAccounts)
      .catch((cause) => setAccountsError(cause instanceof Error ? cause.message : 'Could not load the sign-ins'));
  }, [accountsPage, canManage, id, isNew]);

  useEffect(loadAccounts, [loadAccounts]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setSaved(false);
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);

    const body = {
      label: form.label,
      issuerUrl: form.issuerUrl,
      clientId: form.clientId,
      allowedEmailDomains: domainsFrom(form.domains),
      defaultRoleName: form.defaultRoleName,
      // Only when typed: a blank box on an existing connection keeps the stored secret.
      ...(form.credential ? { credential: form.credential } : {}),
    };

    try {
      if (isNew) {
        const created = await adminFetch<SsoConnection>('/admin/sso/connections', {
          method: 'POST',
          body: { protocol: 'OIDC', ...body },
        });
        router.replace(ROUTES.admin.ssoConnection(created.id));
      } else {
        const updated = await adminFetch<SsoConnection>(`/admin/sso/connections/${id}`, { method: 'PATCH', body });
        setConnection(updated);
        setForm(formFrom(updated));
        setSaved(true);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save this connection');
    } finally {
      setSaving(false);
    }
  }

  async function suspend() {
    setStatusBusy(true);
    setError(null);
    try {
      setConnection(await adminFetch<SsoConnection>(`/admin/sso/connections/${id}/suspend`, { method: 'POST' }));
      setConfirmingSuspend(false);
    } catch (cause) {
      setConfirmingSuspend(false);
      setError(cause instanceof Error ? cause.message : 'Could not suspend this connection');
    } finally {
      setStatusBusy(false);
    }
  }

  async function resume() {
    setStatusBusy(true);
    setError(null);
    try {
      setConnection(
        await adminFetch<SsoConnection>(`/admin/sso/connections/${id}`, { method: 'PATCH', body: { status: 'ACTIVE' } }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not resume this connection');
    } finally {
      setStatusBusy(false);
    }
  }

  async function toggleEnforceSso() {
    if (!connection) return;
    setEnforceBusy(true);
    setError(null);
    try {
      setConnection(
        await adminFetch<SsoConnection>(`/admin/sso/connections/${id}`, {
          method: 'PATCH',
          body: { enforceSso: !connection.enforceSso },
        }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not change this setting');
    } finally {
      setEnforceBusy(false);
    }
  }

  async function unlink() {
    if (!unlinking) return;
    setUnlinkBusy(true);
    try {
      await adminFetch(`/admin/sso/connections/${id}/accounts/${unlinking.userId}/unlink`, { method: 'POST' });
      setUnlinking(null);
      loadAccounts();
    } catch (cause) {
      setUnlinking(null);
      setAccountsError(cause instanceof Error ? cause.message : 'Could not unlink this account');
    } finally {
      setUnlinkBusy(false);
    }
  }

  const backLink = (
    <Link href={ROUTES.admin.ssoConnections} className="hover:underline">
      ← Single sign-on
    </Link>
  );

  if (!canManage) {
    return (
      <>
        <PageHeader context={backLink} title="Single sign-on connection" />
        <EmptyState
          title="Single sign-on is set up by an administrator"
          description="Changing how staff sign in needs the settings.sso.manage permission. Ask an administrator who holds it."
          action={
            <Link href={ROUTES.admin.dashboard} className="btn-secondary">
              Back to the dashboard
            </Link>
          }
        />
      </>
    );
  }

  if (!isNew && loading) {
    return (
      <>
        <PageHeader context={backLink} title="Single sign-on connection" />
        <Loading label="Loading this connection" />
      </>
    );
  }

  if (!isNew && !connection) {
    return (
      <>
        <PageHeader context={backLink} title="Single sign-on connection" />
        <EmptyState
          title="This connection could not be loaded"
          description={loadError ?? 'It may have been removed.'}
          action={
            <Link href={ROUTES.admin.ssoConnections} className="btn-secondary">
              Back to single sign-on
            </Link>
          }
        />
      </>
    );
  }

  // A default role that has since been renamed or removed still shows as
  // the current value, so the form never silently picks another.
  const roleOptions =
    roles && form.defaultRoleName && !roles.some((role) => role.name === form.defaultRoleName)
      ? [...roles, { name: form.defaultRoleName, accessWidening: [], missing: true }]
      : (roles ?? []);

  return (
    <>
      <PageHeader
        context={backLink}
        title={isNew ? 'Add a connection' : connection!.label}
        description={isNew ? 'An OpenID Connect identity provider your staff sign in through.' : undefined}
        action={
          <button type="button" onClick={() => void save()} disabled={saving} className="btn-primary">
            {saving ? 'Saving…' : isNew ? 'Add connection' : 'Save changes'}
          </button>
        }
      />

      {error ? (
        <p role="alert" className="notice notice-error mb-6">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p role="status" className="notice notice-success mb-6">
          Single sign-on connection saved.
        </p>
      ) : null}

      <Section title="Connection">
        <div className="grid max-w-3xl grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label className="field-label" htmlFor="sso-label">
              Label
            </label>
            <input
              id="sso-label"
              className="field-input"
              placeholder="Head office Google Workspace"
              value={form.label}
              onChange={(event) => update('label', event.target.value)}
              required
            />
            <p className="mt-1 text-xs text-neutral-900/60">The sign-in button reads “Sign in with {form.label || '…'}”.</p>
          </div>

          <div>
            <label className="field-label" htmlFor="sso-issuer">
              Issuer URL
            </label>
            <input
              id="sso-issuer"
              type="url"
              className="field-input"
              placeholder="https://accounts.google.com"
              value={form.issuerUrl}
              onChange={(event) => update('issuerUrl', event.target.value)}
              required
            />
            <p className="mt-1 text-xs text-neutral-900/60">
              For Microsoft Entra ID, your own tenant&apos;s: https://login.microsoftonline.com/&lt;tenant ID&gt;/v2.0.
            </p>
          </div>

          <div>
            <label className="field-label" htmlFor="sso-client-id">
              Client ID
            </label>
            <input
              id="sso-client-id"
              className="field-input"
              value={form.clientId}
              onChange={(event) => update('clientId', event.target.value)}
              required
            />
          </div>

          <div>
            <label className="field-label" htmlFor="sso-secret">
              Client secret
            </label>
            <input
              id="sso-secret"
              type="password"
              autoComplete="new-password"
              className="field-input"
              value={form.credential}
              onChange={(event) => update('credential', event.target.value)}
              required={isNew}
            />
            <p className="mt-1 text-xs text-neutral-900/60">
              {isNew
                ? 'Stored encrypted and never shown again.'
                : 'Leave blank to keep the stored secret. It is never shown again.'}
            </p>
          </div>

          <div className="sm:col-span-2">
            <label className="field-label" htmlFor="sso-domains">
              Allowed email domains
            </label>
            <input
              id="sso-domains"
              className="field-input"
              placeholder="example.com"
              value={form.domains}
              onChange={(event) => update('domains', event.target.value)}
              required
            />
            <p className="mt-1 max-w-prose text-xs text-neutral-900/60">
              Separated by commas. Anyone the provider confirms at one of these domains can sign in: a new address
              gets an account with the role below, and an existing account at that address is linked — its owner is
              emailed. A subdomain is not included.
            </p>
          </div>

          <div>
            <label className="field-label" htmlFor="sso-role">
              Role for new sign-ins
            </label>
            <select
              id="sso-role"
              className="field-input"
              value={form.defaultRoleName}
              onChange={(event) => update('defaultRoleName', event.target.value)}
              disabled={!roles}
              required
            >
              <option value="">{roles ? 'Choose a role…' : 'Loading roles…'}</option>
              {roleOptions.map((role) => (
                <option key={role.name} value={role.name} disabled={role.accessWidening.length > 0}>
                  {role.name}
                  {role.accessWidening.length > 0 ? ` — can change others' access (${role.accessWidening.join(', ')})` : ''}
                  {'missing' in role ? ' — no longer exists' : ''}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-neutral-900/60">
              A role that can change other people&apos;s access cannot be chosen. Give more by hand after someone
              first signs in.
            </p>
          </div>

          <div className="sm:col-span-2">
            <p className="field-label">Callback URL</p>
            {redirectUri ? (
              <>
                <p className="break-all font-mono text-sm text-neutral-900">{redirectUri}</p>
                <p className="mt-1 text-xs text-neutral-900/60">
                  Register this exact address as the redirect URI when you create the client at the provider.
                </p>
              </>
            ) : (
              <p className="notice notice-info max-w-prose">
                Single sign-on stays off on this server until API_PUBLIC_URL is set — it is the public address the
                provider sends people back to. You can add the connection now.
              </p>
            )}
          </div>
        </div>
      </Section>

      {!isNew && connection ? (
        <>
          <Section
            className="mt-10"
            title="Status"
            description={
              connection.status === 'ACTIVE'
                ? 'Staff can sign in through this connection.'
                : 'New sign-ins through this connection are refused. Accounts it created or linked are unchanged.'
            }
            action={<StatusBadge status={connection.status} />}
          >
            {connection.status === 'ACTIVE' ? (
              <button
                type="button"
                className="btn-danger"
                onClick={() => setConfirmingSuspend(true)}
                disabled={statusBusy}
              >
                Suspend this connection
              </button>
            ) : (
              <button type="button" className="btn-secondary" onClick={() => void resume()} disabled={statusBusy}>
                {statusBusy ? 'Resuming…' : 'Resume sign-ins'}
              </button>
            )}
          </Section>

          {connection.status === 'ACTIVE' ? (
            <Section
              className="mt-10"
              title="Require single sign-on"
              description={
                connection.enforceSso
                  ? `Staff must sign in with "${connection.label}". Password sign-in is refused for every staff account except the one that turned this on.`
                  : 'Staff can still sign in with a password alongside this button. Turn this on only after confirming sign-in through it already works.'
              }
              action={<StatusBadge status={connection.enforceSso ? 'ACTIVE' : 'INACTIVE'} label={connection.enforceSso ? 'Required' : 'Optional'} />}
            >
              <button type="button" className={connection.enforceSso ? 'btn-secondary' : 'btn-danger'} onClick={() => void toggleEnforceSso()} disabled={enforceBusy}>
                {enforceBusy ? 'Saving…' : connection.enforceSso ? 'Allow password sign-in again' : 'Require this connection for staff sign-in'}
              </button>
            </Section>
          ) : null}

          <Section
            className="mt-10"
            title="Sign-ins through this connection"
            description="Every account this connection created or linked, newest first."
          >
            {accountsError ? (
              <p role="alert" className="notice notice-error mb-4">
                {accountsError}
              </p>
            ) : null}

            <DataTable
              rows={accounts?.data}
              loading={!accounts && !accountsError}
              emptyLabel="Nobody has signed in through this connection yet."
              rowKey={(account, index) => `${account.userId}-${account.at}-${index}`}
              columns={[
                {
                  header: 'Account',
                  cell: (account) => (
                    <>
                      {canOpenAccounts && account.email ? (
                        <Link
                          href={ROUTES.admin.user(account.userId)}
                          className="font-medium text-neutral-900 hover:text-accent-hover"
                        >
                          {accountName(account)}
                        </Link>
                      ) : (
                        <span className="font-medium text-neutral-900">{accountName(account)}</span>
                      )}
                      {account.email && accountName(account) !== account.email ? (
                        <span className="mt-0.5 block text-xs text-neutral-900/60">{account.email}</span>
                      ) : null}
                    </>
                  ),
                },
                {
                  header: 'How',
                  muted: true,
                  cell: (account) => (account.how === 'PROVISIONED' ? 'Created at first sign-in' : 'Existing account linked'),
                },
                { header: 'When', muted: true, cell: (account) => formatDateTime(account.at) },
                {
                  header: 'Now',
                  muted: true,
                  cell: (account) =>
                    account.isActive === false ? 'Deactivated' : account.linked ? 'Linked' : 'No longer linked',
                },
                {
                  header: <span className="sr-only">Actions</span>,
                  align: 'end',
                  cell: (account) =>
                    account.linked ? (
                      <button type="button" className="btn-text" onClick={() => setUnlinking(account)}>
                        Unlink
                      </button>
                    ) : null,
                },
              ]}
            />

            {accounts && accounts.meta.totalPages > 1 ? (
              <Pagination className="mt-4" meta={accounts.meta} onChange={setAccountsPage} itemLabel="sign-ins" />
            ) : null}
          </Section>

          <ConfirmDialog
            open={confirmingSuspend}
            onClose={() => setConfirmingSuspend(false)}
            onConfirm={suspend}
            title={`Suspend ${connection.label}?`}
            description="New sign-ins through it stop at once. Accounts it created or linked are not changed, and anyone already signed in stays signed in until their session ends. You can resume it later."
            confirmLabel="Suspend connection"
            variant="danger"
            busy={statusBusy}
          />

          <ConfirmDialog
            open={unlinking !== null}
            onClose={() => setUnlinking(null)}
            onConfirm={unlink}
            title={unlinking ? `Unlink ${accountName(unlinking)}?` : 'Unlink this account?'}
            description="They are signed out everywhere, and the link to their sign-in identity is removed. If they sign in through single sign-on again they are linked again — to keep someone out, deactivate their account in Team & Access or suspend this connection."
            confirmLabel="Unlink account"
            variant="danger"
            busy={unlinkBusy}
          />
        </>
      ) : null}
    </>
  );
}
