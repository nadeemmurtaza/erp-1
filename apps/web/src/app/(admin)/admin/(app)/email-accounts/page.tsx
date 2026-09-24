'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { formatDateTime } from '@newax/shared';
import { adminFetch } from '@/lib/admin-client';
import { Badge, DataTable, PageHeader } from '@/components/ui';
import { ROUTES } from '@/constants/routes';
import { purposeLabel } from '@/utils/email-account-form';
import type { EmailAccount } from '@/types/api';

/**
 * The mailboxes outgoing mail can leave from.
 *
 * Each is tagged with a purpose — transactional, marketing, support — and
 * EmailChannel routes each outgoing email to the active account for its
 * template's purpose, falling back to the transactional account, and then to
 * the server's plain SMTP_* config when nothing is connected at all.
 *
 * Verification state belongs on this page rather than buried three steps into
 * an editor, because "is our order mail actually going to send" is the
 * question somebody opens this screen to answer.
 */
export default function EmailAccountsPage() {
  const [accounts, setAccounts] = useState<EmailAccount[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setAccounts(await adminFetch<EmailAccount[]>('/admin/email-accounts'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load connected mailboxes');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <PageHeader
        title="Email accounts"
        description="Mailboxes for outgoing mail. Each purpose falls back to the transactional account, and then to the server's SMTP_* config."
        action={
          <Link href={ROUTES.admin.emailAccount('new')} className="btn-primary">
            Connect a mailbox
          </Link>
        }
      />

      {error ? (
        <p role="alert" className="text-sm text-feedback-negative">
          {error}
        </p>
      ) : null}

      <DataTable
        rows={accounts}
        loading={busy && !accounts}
        emptyLabel="No mailboxes connected. Until one is connected, mail goes out through the server's SMTP_* configuration."
        rowKey={(account) => account.id}
        columns={[
          {
            header: 'Mailbox',
            cell: (account) => (
              <>
                <Link
                  href={ROUTES.admin.emailAccount(account.id)}
                  className="font-medium text-neutral-900 hover:text-accent-hover"
                >
                  {account.label}
                </Link>
                <span className="mt-0.5 block text-xs text-neutral-900/60">{account.fromEmail}</span>
              </>
            ),
          },
          {
            header: 'Purpose',
            muted: true,
            cell: (account) => (
              <>
                {purposeLabel(account.purpose)}
                {account.isDefault ? (
                  <span className="block text-xs text-neutral-900/60">Default</span>
                ) : null}
              </>
            ),
          },
          {
            header: 'SMTP verified',
            muted: true,
            cell: (account) =>
              account.smtpVerifiedAt ? (
                formatDateTime(account.smtpVerifiedAt)
              ) : (
                <span className="text-neutral-900/60">Never</span>
              ),
          },
          {
            header: 'State',
            cell: (account) => (
              <Badge tone={account.isActive ? 'success' : 'neutral'}>
                {account.isActive ? 'Active' : 'Off'}
              </Badge>
            ),
          },
        ]}
      />
    </>
  );
}
