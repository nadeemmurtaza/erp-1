'use client';

import { useCallback, useEffect, useState } from 'react';
import { Wizard, type WizardStep } from '@/components/common/wizard';
import { adminFetch } from '@/lib/admin-client';
import type { EmailAccount, EmailAccountPurpose } from '@/lib/api-types';

const PURPOSES: { value: EmailAccountPurpose; label: string; hint: string }[] = [
  { value: 'TRANSACTIONAL', label: 'Transactional', hint: 'Orders, payments, password resets — the fallback every other purpose can use.' },
  { value: 'MARKETING', label: 'Marketing', hint: 'Campaign sends: sales, launches, flash offers.' },
  { value: 'SUPPORT', label: 'Support', hint: 'Customer-service correspondence. Nothing sends here automatically yet — no support-mail template exists.' },
];

interface FormState {
  label: string;
  purpose: EmailAccountPurpose;
  isActive: boolean;
  isDefault: boolean;
  fromName: string;
  fromEmail: string;
  replyTo: string;
  smtpHost: string;
  smtpPort: string;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPassword: string;
  includeImap: boolean;
  imapHost: string;
  imapPort: string;
  imapSecure: boolean;
  imapUser: string;
  imapPassword: string;
}

const EMPTY_FORM: FormState = {
  label: '',
  purpose: 'TRANSACTIONAL',
  isActive: true,
  isDefault: false,
  fromName: '',
  fromEmail: '',
  replyTo: '',
  smtpHost: '',
  smtpPort: '587',
  smtpSecure: false,
  smtpUser: '',
  smtpPassword: '',
  includeImap: false,
  imapHost: '',
  imapPort: '993',
  imapSecure: true,
  imapUser: '',
  imapPassword: '',
};

function formFromAccount(account: EmailAccount): FormState {
  return {
    label: account.label,
    purpose: account.purpose,
    isActive: account.isActive,
    isDefault: account.isDefault,
    fromName: account.fromName,
    fromEmail: account.fromEmail,
    replyTo: account.replyTo ?? '',
    smtpHost: account.smtpHost,
    smtpPort: String(account.smtpPort),
    smtpSecure: account.smtpSecure,
    smtpUser: account.smtpUser,
    smtpPassword: '',
    includeImap: Boolean(account.imapHost),
    imapHost: account.imapHost ?? '',
    imapPort: String(account.imapPort ?? 993),
    imapSecure: account.imapSecure,
    imapUser: account.imapUser ?? '',
    imapPassword: '',
  };
}

/**
 * Connect mailboxes for outgoing mail — SMTP always, IMAP optional. Multiple
 * accounts can be connected, each tagged with a purpose (transactional,
 * marketing, support); EmailChannel routes each outgoing email to the active
 * account for its template's purpose, falling back to the plain SMTP_* env
 * config when nothing is connected for that purpose.
 *
 * IMAP here is connection-tested only — there is no inbox-reading feature in
 * this codebase yet, so a successful IMAP test proves the mailbox is
 * reachable and nothing more.
 */
export default function EmailAccountsPage() {
  const [accounts, setAccounts] = useState<EmailAccount[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null | 'new'>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [testing, setTesting] = useState<'smtp' | 'imap' | null>(null);
  const [testResult, setTestResult] = useState<
    { kind: 'smtp' | 'imap'; ok: boolean; message: string } | null
  >(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setAccounts(await adminFetch<EmailAccount[]>('/admin/email-accounts'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load connected mailboxes');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function selectNew() {
    setSelectedId('new');
    setForm(EMPTY_FORM);
    setSaveError(null);
    setTestResult(null);
  }

  function selectAccount(account: EmailAccount) {
    setSelectedId(account.id);
    setForm(formFromAccount(account));
    setSaveError(null);
    setTestResult(null);
  }

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
    if (!selectedId || selectedId === 'new') return;
    setTesting(kind);
    setTestResult(null);
    try {
      await adminFetch(`/admin/email-accounts/${selectedId}/test-${kind}`, { method: 'POST' });
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
      if (selectedId === 'new') {
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
        await load();
        selectAccount(created);
      } else if (selectedId) {
        const updated = await adminFetch<EmailAccount>(`/admin/email-accounts/${selectedId}`, {
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
        await load();
        selectAccount(updated);
      }
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : 'Could not save this account');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!selectedId || selectedId === 'new') return;
    if (!window.confirm(`Disconnect "${form.label}"? Mail routed to it will fall back to another account, or to SMTP_*.`)) {
      return;
    }
    setDeleting(true);
    try {
      await adminFetch(`/admin/email-accounts/${selectedId}`, { method: 'DELETE' });
      setSelectedId(null);
      await load();
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : 'Could not disconnect this account');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <h1 className="mb-1 text-xl font-semibold text-ink">Email Accounts</h1>
      <p className="mb-6 text-sm text-ink/60">
        Connect mailboxes for outgoing mail — one for transactional order mail, another for
        marketing, and so on. Each purpose falls back to the transactional account when nothing
        is connected for it, and to the server&apos;s SMTP_* config when nothing is connected at all.
      </p>

      {error ? (
        <p role="alert" className="card mb-4 p-4 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
        <div className="card max-h-[calc(100vh-14rem)] overflow-y-auto p-2">
          <button
            type="button"
            onClick={selectNew}
            className={`mb-2 flex w-full items-center justify-center rounded-md border border-dashed border-sand-300 px-2 py-2 text-sm font-medium ${
              selectedId === 'new' ? 'bg-brand-50 text-brand-800' : 'text-ink/70 hover:bg-sand-50'
            }`}
          >
            + Connect a mailbox
          </button>

          {!accounts ? (
            <p className="p-3 text-sm text-ink/50">Loading…</p>
          ) : accounts.length === 0 ? (
            <p className="p-3 text-sm text-ink/50">No mailboxes connected yet.</p>
          ) : (
            accounts.map((account) => (
              <button
                key={account.id}
                type="button"
                onClick={() => selectAccount(account)}
                className={`flex w-full flex-col gap-0.5 rounded-md px-2 py-2 text-start text-sm ${
                  account.id === selectedId ? 'bg-brand-50 text-brand-800' : 'text-ink hover:bg-sand-50'
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-medium">{account.label}</span>
                  {!account.isActive ? (
                    <span className="shrink-0 rounded-full bg-sand-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink/50">
                      Off
                    </span>
                  ) : null}
                </span>
                <span className="text-xs text-ink/50">
                  {account.purpose}
                  {account.isDefault ? ' · default' : ''} · {account.fromEmail}
                </span>
              </button>
            ))
          )}
        </div>

        <div className="min-w-0">
          {selectedId === null ? (
            <p className="card p-8 text-center text-sm text-ink/50">
              Select a mailbox, or connect a new one.
            </p>
          ) : (
            (() => {
              const basicsStep: WizardStep = {
                id: 'basics',
                label: 'Basics',
                isValid: Boolean(form.label.trim() && form.fromName.trim() && form.fromEmail.trim()),
                content: (
              <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                    onChange={(event) => update('purpose', event.target.value as EmailAccountPurpose)}
                  >
                    {PURPOSES.map((purpose) => (
                      <option key={purpose.value} value={purpose.value}>
                        {purpose.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-ink/50">
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
                  <label className="flex items-center gap-2 text-sm text-ink">
                    <input
                      type="checkbox"
                      checked={form.isActive}
                      onChange={(event) => update('isActive', event.target.checked)}
                      className="rounded border-sand-300 text-brand-600 focus:ring-brand-500"
                    />
                    Active
                  </label>
                  <label className="flex items-center gap-2 text-sm text-ink">
                    <input
                      type="checkbox"
                      checked={form.isDefault}
                      onChange={(event) => update('isDefault', event.target.checked)}
                      className="rounded border-sand-300 text-brand-600 focus:ring-brand-500"
                    />
                    Default for this purpose
                  </label>
                </div>
              </section>
                ),
              };

              const smtpStep: WizardStep = {
                id: 'smtp',
                label: 'SMTP',
                isValid: Boolean(
                  form.smtpHost.trim() &&
                    form.smtpUser.trim() &&
                    (form.smtpPassword.trim() || selectedId !== 'new'),
                ),
                content: (
              <section>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-ink">SMTP (sending)</h2>
                  {selectedId !== 'new' ? (
                    <span className="text-xs text-ink/50">
                      {accounts?.find((a) => a.id === selectedId)?.smtpVerifiedAt
                        ? `Last verified ${new Date(
                            accounts.find((a) => a.id === selectedId)!.smtpVerifiedAt!,
                          ).toLocaleString('en-PK')}`
                        : 'Never verified'}
                    </span>
                  ) : null}
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                    <label className="flex items-center gap-2 pt-6 text-sm text-ink">
                      <input
                        type="checkbox"
                        checked={form.smtpSecure}
                        onChange={(event) => update('smtpSecure', event.target.checked)}
                        className="rounded border-sand-300 text-brand-600 focus:ring-brand-500"
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
                      placeholder={
                        selectedId !== 'new' &&
                        accounts?.find((a) => a.id === selectedId)?.hasSmtpPassword
                          ? '•••••••• (unchanged)'
                          : ''
                      }
                      value={form.smtpPassword}
                      onChange={(event) => update('smtpPassword', event.target.value)}
                      required={selectedId === 'new'}
                    />
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => testDraft('smtp')}
                    disabled={testing === 'smtp' || !form.smtpHost || !form.smtpUser || !form.smtpPassword}
                    className="btn-ghost disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {testing === 'smtp' ? 'Testing…' : 'Test these values'}
                  </button>
                  {selectedId !== 'new' ? (
                    <button
                      type="button"
                      onClick={() => testSaved('smtp')}
                      disabled={testing === 'smtp'}
                      className="btn-ghost disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {testing === 'smtp' ? 'Testing…' : 'Test saved connection'}
                    </button>
                  ) : null}
                  {testResult?.kind === 'smtp' ? (
                    <span className={`text-sm ${testResult.ok ? 'text-emerald-700' : 'text-red-700'}`}>
                      {testResult.message}
                    </span>
                  ) : null}
                </div>
              </section>
                ),
              };

              const imapStep: WizardStep = {
                id: 'imap',
                label: 'IMAP',
                isValid: Boolean(
                  !form.includeImap ||
                    (form.imapHost.trim() &&
                      form.imapUser.trim() &&
                      (form.imapPassword.trim() || selectedId !== 'new')),
                ),
                content: (
              <section>
                <label className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
                  <input
                    type="checkbox"
                    checked={form.includeImap}
                    onChange={(event) => update('includeImap', event.target.checked)}
                    className="rounded border-sand-300 text-brand-600 focus:ring-brand-500"
                  />
                  IMAP (receiving) — optional
                </label>
                <p className="mb-3 text-xs text-ink/50">
                  Connection-tested only. Nothing in this store reads a mailbox yet, so IMAP does
                  not do anything beyond proving the mailbox is reachable.
                </p>

                {form.includeImap ? (
                  <>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                        <label className="flex items-center gap-2 pt-6 text-sm text-ink">
                          <input
                            type="checkbox"
                            checked={form.imapSecure}
                            onChange={(event) => update('imapSecure', event.target.checked)}
                            className="rounded border-sand-300 text-brand-600 focus:ring-brand-500"
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
                            selectedId !== 'new' &&
                            accounts?.find((a) => a.id === selectedId)?.hasImapPassword
                              ? '•••••••• (unchanged)'
                              : ''
                          }
                          value={form.imapPassword}
                          onChange={(event) => update('imapPassword', event.target.value)}
                          required={form.includeImap && selectedId === 'new'}
                        />
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => testDraft('imap')}
                        disabled={testing === 'imap' || !form.imapHost || !form.imapUser || !form.imapPassword}
                        className="btn-ghost disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {testing === 'imap' ? 'Testing…' : 'Test these values'}
                      </button>
                      {selectedId !== 'new' &&
                      accounts?.find((a) => a.id === selectedId)?.imapHost ? (
                        <button
                          type="button"
                          onClick={() => testSaved('imap')}
                          disabled={testing === 'imap'}
                          className="btn-ghost disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {testing === 'imap' ? 'Testing…' : 'Test saved connection'}
                        </button>
                      ) : null}
                      {testResult?.kind === 'imap' ? (
                        <span
                          className={`text-sm ${testResult.ok ? 'text-emerald-700' : 'text-red-700'}`}
                        >
                          {testResult.message}
                        </span>
                      ) : null}
                    </div>
                  </>
                ) : null}
              </section>
                ),
              };

              const steps: WizardStep[] = [basicsStep, smtpStep, imapStep];

              return (
                <div className="card space-y-6 p-5">
                  <Wizard
                    key={selectedId}
                    steps={steps}
                    onSubmit={save}
                    submitLabel={
                      saving ? 'Saving…' : selectedId === 'new' ? 'Connect mailbox' : 'Save changes'
                    }
                    submitBusy={saving}
                    submitDisabled={saving}
                    accentClassName="bg-brand-600 text-white"
                    error={
                      saveError ? (
                        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                          {saveError}
                        </p>
                      ) : null
                    }
                  />
                  {selectedId !== 'new' ? (
                    <button
                      type="button"
                      onClick={() => void remove()}
                      disabled={deleting}
                      className="text-sm text-red-700 hover:underline disabled:opacity-40"
                    >
                      {deleting ? 'Disconnecting…' : 'Disconnect this mailbox'}
                    </button>
                  ) : null}
                </div>
              );
            })()
          )}
        </div>
      </div>
    </>
  );
}
