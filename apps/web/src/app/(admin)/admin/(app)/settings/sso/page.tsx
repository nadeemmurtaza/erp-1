'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adminFetch } from '@/lib/admin-client';
import { DataTable, EmptyState, PageHeader, Section } from '@/components/ui';
import { StatusBadge } from '@/components/common/status-badge';
import { useAdminSession } from '@/components/admin/session';
import { ROUTES } from '@/constants/routes';
import type { SsoConnectionList } from '@/types/api';

/**
 * Single sign-on connections (access-control-identity/161-sso-identity-federation.md,
 * WO-161.4) — which identity providers may sign staff in.
 *
 * Overview only: each connection opens on its own page, where it is edited,
 * suspended, and where the accounts that came in through it are listed.
 * With no connection, staff sign in with a password and the sign-in screen
 * is unchanged.
 */
export default function SsoConnectionsPage() {
  const { can } = useAdminSession();
  const canManage = can('settings.sso.manage');

  const [list, setList] = useState<SsoConnectionList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    if (!canManage) return;
    adminFetch<SsoConnectionList>('/admin/sso/connections')
      .then(setList)
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load single sign-on connections'))
      .finally(() => setBusy(false));
  }, [canManage]);

  if (!canManage) {
    return (
      <>
        <PageHeader title="Single sign-on" />
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

  return (
    <>
      <PageHeader
        title="Single sign-on"
        description="Let staff sign in through your organization's identity provider — Google Workspace, Microsoft Entra ID, Okta, or any other OpenID Connect provider."
        action={
          <Link href={ROUTES.admin.ssoConnection('new')} className="btn-primary">
            Add a connection
          </Link>
        }
      />

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      <DataTable
        rows={list?.connections}
        loading={busy && !list}
        emptyLabel="No connections yet. Until one is added, staff sign in with a password and the sign-in screen is unchanged."
        rowKey={(connection) => connection.id}
        columns={[
          {
            header: 'Connection',
            cell: (connection) => (
              <>
                <Link
                  href={ROUTES.admin.ssoConnection(connection.id)}
                  className="font-medium text-neutral-900 hover:text-accent-hover"
                >
                  {connection.label}
                </Link>
                <span className="mt-0.5 block break-all text-xs text-neutral-900/60">{connection.issuerUrl}</span>
              </>
            ),
          },
          {
            header: 'Allowed email domains',
            muted: true,
            cell: (connection) => connection.allowedEmailDomains.join(', '),
          },
          { header: 'New sign-ins get', muted: true, cell: (connection) => connection.defaultRoleName },
          { header: 'State', cell: (connection) => <StatusBadge status={connection.status} /> },
        ]}
      />

      {list ? (
        <Section
          className="mt-8"
          title="Callback URL"
          description="Register this exact address as the redirect URI when you create the client at your identity provider. Every connection uses the same one."
        >
          {list.redirectUri ? (
            <p className="max-w-prose break-all font-mono text-sm text-neutral-900">{list.redirectUri}</p>
          ) : (
            <p className="notice notice-info max-w-prose">
              Single sign-on stays off on this server until API_PUBLIC_URL is set — it is the public address your
              identity provider sends people back to. Connections can be added now; their buttons appear on the
              sign-in screen once it is set.
            </p>
          )}
        </Section>
      ) : null}
    </>
  );
}
