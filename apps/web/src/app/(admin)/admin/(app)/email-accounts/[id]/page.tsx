'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatDateTime } from '@newax/shared';
import { adminFetch } from '@/lib/admin-client';
import { Dialog, Disclosure, Loading, PageHeader, SectionRail } from '@/components/ui';
import { ROUTES } from '@/constants/routes';
import {
  EMPTY_FORM,
  PURPOSES,
  formFromAccount,
  type FormState,
} from '@/utils/email-account-form';
import type { EmailAccount, EmailAccountPurpose } from '@/types/api';

/**
 * One connected mailbox — or a new one.
 *
 * `new` is handled by this same route rather than a sibling `new/page.tsx`,
 * because the two differ by about six words ("Connect mailbox" versus "Save
 * changes", a required password versus an optional one) and an account id is
 * a cuid, so it can never collide with the literal. A second route would mean
 * a second copy of eighteen fields, which is the duplication these splits
 * exist to remove.
 *
 * The wizard this replaces walked Basics -> SMTP -> IMAP in order. That order
 * is real the first time and wrong every time after: the reason to reopen a
 * mailbox is almost always a password that stopped working, and that sat two
 * "next" clicks deep.
 *
 * IMAP is connection-tested only — nothing in this codebase reads a mailbox,
 * so a passing IMAP test proves reachability and nothing more.
 */
export default function EmailAccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const isNew = id === 'new';
  const router = useRouter();

  const [account, setAccount] = useState<EmailAccount | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(!isNew);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [testing, setTesting] = useState<'smtp' | 'imap' | null>(null);
  const [testResult, setTestResult] = useState<
    { kind: 'smtp' | 'imap'; ok: boolean; message: string } | null
  >(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (isNew) return;
    try {
      const all = await adminFetch<EmailAccount[]>('/admin/email-accounts');
      const found = all.find((candidate) => candidate.id === id) ?? null;
      setAccount(found);
      if (found) setForm(formFromAccount(found));
      else setError('That mailbox is no longer connected.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load this mailbox');
    } finally {
      setLoading(false);
    }
  }, [id, isNew]);

  useEffect(() => {
    void load();
  }, [load]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function buildSmtpFields() {
    return {
      host: form.smtpHost,
      port: Number(form.smtpPort),
      secure: form.smtpSecure,
      user: form.smtpUser,
      password: form.smtpPassword,
    };
  }

  function buildImapFields() {
    return {
      host: form.imapHost,
      port: Number(form.imapPort),
      secure: form.imapSecure,
      user: form.imapUser,
      password: form.imapPassword,
    };
  }

  async function testDraft(kind: 'smtp' | 'imap') {
    setTesting(kind);
    setTestResult(null);
    try {
      await adminFetch(`/admin/email-accounts/test-${kind}`, {
        method: 'POST',
        body: kind === 'smtp' ? buildSmtpFields() : buildImapFields(),
      });
      setTestResult({ kind, ok: true, message: 'Connected successfully.' });
    } catch (cause) {
      setTestResult({
        kind,
        ok: false,
        message: cause instanceof Error ? cause.message : 'Could not connect.',
      });
    } finally {
      setTesting(null);
    }
  }

  async function testSaved(kind: 'smtp' | 'imap') {
    if (isNew) return;
    setTesting(kind);
    setTestResult(null);
    try {
      await adminFetch(`/admin/email-accounts/${id}/test-${kind}`, { method: 'POST' });
      setTestResult({ kind, ok: true, message: 'Connected successfully.' });
      void load();
    } catch (cause) {
      setTestResult({
        kind,
        ok: false,
        message: cause instanceof Error ? cause.message : 'Could not connect.',
      });
    } finally {
      setTesting(null);
    }
  }

  async function save() {
    setSaving(true);
    setSaveError(null);

    try {
      if (isNew) {
        const created = await adminFetch<EmailAccount>('/admin/email-accounts', {
          method: 'POST',
          body: {
            label: form.label,
            purpose: form.purpose,
            isActive: form.isActive,
            isDefault: form.isDefault,
            fromName: form.fromName,
            fromEmail: form.fromEmail,
            replyTo: form.replyTo || undefined,
            smtp: buildSmtpFields(),
            imap: form.includeImap ? buildImapFields() : undefined,
          },
        });
        router.replace(ROUTES.admin.emailAccount(created.id));
      } else {
        const updated = await adminFetch<EmailAccount>(`/admin/email-accounts/${id}`, {
          method: 'PATCH',
          body: {
            label: form.label,
            purpose: form.purpose,
            isActive: form.isActive,
            isDefault: form.isDefault,
            fromName: form.fromName,
            fromEmail: form.fromEmail,
            replyTo: form.replyTo || undefined,
            smtp: {
              host: form.smtpHost,
              port: Number(form.smtpPort),
              secure: form.smtpSecure,
              user: form.smtpUser,
              // Only when typed: an empty box means "leave the stored one".
              ...(form.smtpPassword ? { password: form.smtpPassword } : {}),
            },
            ...(form.includeImap
              ? {
                  imap: {
                    host: form.imapHost,
                    port: Number(form.imapPort),
                    secure: form.imapSecure,
                    user: form.imapUser,
                    ...(form.imapPassword ? { password: form.imapPassword } : {}),
                  },
                }
              : { clearImap: true }),
          },
        });
        setAccount(updated);
        setForm(formFromAccount(updated));
      }
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : 'Could not save this account');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (isNew) return;
    setDeleting(true);
    try {
      await adminFetch(`/admin/email-accounts/${id}`, { method: 'DELETE' });
      router.push(ROUTES.admin.emailAccounts);
    } catch (cause) {
      setConfirmingDelete(false);
      setSaveError(cause instanceof Error ? cause.message : 'Could not disconnect this account');
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <>
        <PageHeader title="Mailbox" />
        <Loading />
      </>
    );
  }

  if (!isNew && !account) {
    return (
      <>
        <PageHeader title="Mailbox" />
        <p role="alert" className="text-sm text-feedback-negative">
          {error ?? 'That mailbox is no longer connected.'}
        </p>
      </>
    );
  }

  const testLine = (kind: 'smtp' | 'imap') =>
    testResult?.kind === kind ? (
      <span
        className={`text-sm ${testResult.ok ? 'text-feedback-positive' : 'text-feedback-negative'}`}
      >
        {testResult.message}
      </span>
    ) : null;

  return (
    <>
      <PageHeader
        title={isNew ? 'Connect a mailbox' : account!.label}
        action={
          <button type="button" onClick={() => void save()} disabled={saving} className="btn-primary">
            {saving ? 'Saving…' : isNew ? 'Connect mailbox' : 'Save changes'}
          </button>
        }
      />

      {saveError ? (
        <p role="alert" className="mb-6 text-sm text-feedback-negative">
          {saveError}
        </p>
      ) : null}

      <SectionRail
        label="Mailbox sections"
        sections={[
          {
            id: 'basics',
            label: 'Basics',
            content: (
              <div className="grid max-w-3xl grid-cols-1 gap-5 sm:grid-cols-2">
                <div>
                  <label className="field-label" htmlFor="label">
                    Label
                  </label>
                  <input
                    id="label"
                    className="field-input"
                    placeholder="Orders, Marketing PK, Support Inbox…"
                    value={form.label}
                    onChange={(event) => update('label', event.target.value)}
                    required
                  />
                </div>

                <div>
                  <label className="field-label" htmlFor="purpose">
                    Purpose
                  </label>
                  <select
                    id="purpose"
                    className="field-input"
                    value={form.purpose}
                    onChange={(event) =>
                      update('purpose', event.target.value as EmailAccountPurpose)
                    }
                  >
                    {PURPOSES.map((purpose) => (
                      <option key={purpose.value} value={purpose.value}>
                        {purpose.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-neutral-900/60">
                    {PURPOSES.find((purpose) => purpose.value === form.purpose)?.hint}
                  </p>
                </div>

                <div>
                  <label className="field-label" htmlFor="fromName">
                    From name
                  </label>
                  <input
                    id="fromName"
                    className="field-input"
                    value={form.fromName}
                    onChange={(event) => update('fromName', event.target.value)}
                    required
                  />
                </div>

                <div>
                  <label className="field-label" htmlFor="fromEmail">
                    From email
                  </label>
                  <input
                    id="fromEmail"
                    type="email"
                    className="field-input"
                    value={form.fromEmail}
                    onChange={(event) => update('fromEmail', event.target.value)}
                    required
                  />
                </div>

                <div>
                  <label className="field-label" htmlFor="replyTo">
                    Reply-to (optional)
                  </label>
                  <input
                    id="replyTo"
                    type="email"
                    className="field-input"
                    value={form.replyTo}
                    onChange={(event) => update('replyTo', event.target.value)}
                  />
                </div>

                <div className="flex items-center gap-4 pt-6">
                  <label className="flex items-center gap-2 text-sm text-neutral-900">
                    <input
                      type="checkbox"
                      checked={form.isActive}
                      onChange={(event) => update('isActive', event.target.checked)}
                      className="field-check"
                    />
                    Active
                  </label>
                  <label className="flex items-center gap-2 text-sm text-neutral-900">
                    <input
                      type="checkbox"
                      checked={form.isDefault}
                      onChange={(event) => update('isDefault', event.target.checked)}
                      className="field-check"
                    />
                    Default for this purpose
                  </label>
                </div>

                {isNew ? null : (
                  <div className="sm:col-span-2">
                    <Disclosure label="Disconnect this mailbox">
                      <p className="mb-3 max-w-prose text-sm text-neutral-900/60">
                        Mail routed here will fall back to another account for its purpose, or to
                        the server&apos;s SMTP_* config. This cannot be undone.
                      </p>
                      <button
                        type="button"
                        onClick={() => setConfirmingDelete(true)}
                        className="btn-danger"
                      >
                        Disconnect this mailbox
                      </button>
                    </Disclosure>
                  </div>
                )}
              </div>
            ),
          },
          {
            id: 'smtp',
            label: 'SMTP',
            badge: 'sending',
            content: (
              <div className="max-w-3xl">
                <p className="mb-4 text-sm text-neutral-900/60">
                  {isNew
                    ? 'Where outgoing mail is sent from.'
                    : account!.smtpVerifiedAt
                      ? `Last verified ${formatDateTime(account!.smtpVerifiedAt)}.`
                      : 'Never verified.'}
                </p>

                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <div>
                    <label className="field-label" htmlFor="smtpHost">
                      Host
                    </label>
                    <input
                      id="smtpHost"
                      className="field-input"
                      placeholder="smtp.example.com"
                      value={form.smtpHost}
                      onChange={(event) => update('smtpHost', event.target.value)}
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="field-label" htmlFor="smtpPort">
                        Port
                      </label>
                      <input
                        id="smtpPort"
                        type="number"
                        className="field-input"
                        value={form.smtpPort}
                        onChange={(event) => update('smtpPort', event.target.value)}
                        required
                      />
                    </div>
                    <label className="flex items-center gap-2 pt-6 text-sm text-neutral-900">
                      <input
                        type="checkbox"
                        checked={form.smtpSecure}
                        onChange={(event) => update('smtpSecure', event.target.checked)}
                        className="field-check"
                      />
                      TLS (465)
                    </label>
                  </div>

                  <div>
                    <label className="field-label" htmlFor="smtpUser">
                      Username
                    </label>
                    <input
                      id="smtpUser"
                      className="field-input"
                      value={form.smtpUser}
                      onChange={(event) => update('smtpUser', event.target.value)}
                      required
                    />
                  </div>

                  <div>
                    <label className="field-label" htmlFor="smtpPassword">
                      Password
                    </label>
                    <input
                      id="smtpPassword"
                      type="password"
                      className="field-input"
                      placeholder={!isNew && account!.hasSmtpPassword ? '•••••••• (unchanged)' : ''}
                      value={form.smtpPassword}
                      onChange={(event) => update('smtpPassword', event.target.value)}
                      required={isNew}
                    />
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => testDraft('smtp')}
                    disabled={
                      testing === 'smtp' || !form.smtpHost || !form.smtpUser || !form.smtpPassword
                    }
                    className="btn-secondary disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {testing === 'smtp' ? 'Testing…' : 'Test these values'}
                  </button>
                  {isNew ? null : (
                    <button
                      type="button"
                      onClick={() => testSaved('smtp')}
                      disabled={testing === 'smtp'}
                      className="btn-text disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {testing === 'smtp' ? 'Testing…' : 'Test saved connection'}
                    </button>
                  )}
                  {testLine('smtp')}
                </div>
              </div>
            ),
          },
          {
            id: 'imap',
            label: 'IMAP',
            badge: form.includeImap ? 'on' : 'off',
            content: (
              <div className="max-w-3xl">
                <label className="mb-3 flex items-center gap-2 text-sm font-medium text-neutral-900">
                  <input
                    type="checkbox"
                    checked={form.includeImap}
                    onChange={(event) => update('includeImap', event.target.checked)}
                    className="field-check"
                  />
                  Connect IMAP as well
                </label>
                <p className="mb-4 max-w-prose text-xs text-neutral-900/60">
                  Connection-tested only. Nothing in this store reads a mailbox yet, so IMAP does
                  not do anything beyond proving the mailbox is reachable.
                </p>

                {form.includeImap ? (
                  <>
                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                      <div>
                        <label className="field-label" htmlFor="imapHost">
                          Host
                        </label>
                        <input
                          id="imapHost"
                          className="field-input"
                          placeholder="imap.example.com"
                          value={form.imapHost}
                          onChange={(event) => update('imapHost', event.target.value)}
                          required={form.includeImap}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="field-label" htmlFor="imapPort">
                            Port
                          </label>
                          <input
                            id="imapPort"
                            type="number"
                            className="field-input"
                            value={form.imapPort}
                            onChange={(event) => update('imapPort', event.target.value)}
                            required={form.includeImap}
                          />
                        </div>
                        <label className="flex items-center gap-2 pt-6 text-sm text-neutral-900">
                          <input
                            type="checkbox"
                            checked={form.imapSecure}
                            onChange={(event) => update('imapSecure', event.target.checked)}
                            className="field-check"
                          />
                          TLS (993)
                        </label>
                      </div>

                      <div>
                        <label className="field-label" htmlFor="imapUser">
                          Username
                        </label>
                        <input
                          id="imapUser"
                          className="field-input"
                          value={form.imapUser}
                          onChange={(event) => update('imapUser', event.target.value)}
                          required={form.includeImap}
                        />
                      </div>

                      <div>
                        <label className="field-label" htmlFor="imapPassword">
                          Password
                        </label>
                        <input
                          id="imapPassword"
                          type="password"
                          className="field-input"
                          placeholder={
                            !isNew && account!.hasImapPassword ? '•••••••• (unchanged)' : ''
                          }
                          value={form.imapPassword}
                          onChange={(event) => update('imapPassword', event.target.value)}
                          required={form.includeImap && isNew}
                        />
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => testDraft('imap')}
                        disabled={
                          testing === 'imap' ||
                          !form.imapHost ||
                          !form.imapUser ||
                          !form.imapPassword
                        }
                        className="btn-secondary disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {testing === 'imap' ? 'Testing…' : 'Test these values'}
                      </button>
                      {!isNew && account!.imapHost ? (
                        <button
                          type="button"
                          onClick={() => testSaved('imap')}
                          disabled={testing === 'imap'}
                          className="btn-text disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {testing === 'imap' ? 'Testing…' : 'Test saved connection'}
                        </button>
                      ) : null}
                      {testLine('imap')}
                    </div>
                  </>
                ) : null}
              </div>
            ),
          },
        ]}
      />

      {/*
       * A real dialog rather than window.confirm — this is exactly the job
       * modals are for, and the native one cannot say which mailbox or what
       * happens to the mail that was routed through it.
       */}
      <Dialog
        open={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        title="Disconnect this mailbox?"
        footer={
          <>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              className="btn-ghost"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void remove()}
              disabled={deleting}
              className="btn-danger"
            >
              {deleting ? 'Disconnecting…' : 'Disconnect'}
            </button>
          </>
        }
      >
        <p className="text-sm text-neutral-900/70">
          Mail routed to <strong className="font-medium text-neutral-900">{form.label}</strong> will
          fall back to another account for its purpose, or to the server&apos;s SMTP_* config. This
          cannot be undone.
        </p>
      </Dialog>
    </>
  );
}
