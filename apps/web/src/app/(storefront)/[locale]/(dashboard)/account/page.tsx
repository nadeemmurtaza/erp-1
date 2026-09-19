'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { AuthUser } from '@/types/api';
import { customerFetch } from '@/lib/customer-client';
import { useCustomerSession } from '@/components/storefront/customer-session';
import { Disclosure, PageHeader, Section } from '@/components/ui';

/**
 * The shopper's own details.
 *
 * Two forms sat side by side here as equal peers, which read as two jobs of
 * equal weight. They are not: a customer opens this page to correct a phone
 * number, and changes a password rarely and deliberately. So the profile is
 * the page and the password is behind a disclosure — the rare, consequential
 * thing is one click away rather than sharing the fold with the common one.
 */
export default function AccountProfilePage() {
  const { user, setUser } = useCustomerSession();
  const t = useTranslations('account');

  const [profileDraft, setProfileDraft] = useState({
    firstName: user?.firstName ?? '',
    lastName: user?.lastName ?? '',
    email: user?.email ?? '',
    phone: user?.phone ?? '',
  });
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordSaving, setPasswordSaving] = useState(false);

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    setProfileError(null);
    setProfileMessage(null);
    setProfileSaving(true);

    try {
      const updated = await customerFetch<AuthUser>('/auth/me', {
        method: 'PATCH',
        body: {
          firstName: profileDraft.firstName || undefined,
          lastName: profileDraft.lastName || undefined,
          email: profileDraft.email || undefined,
          phone: profileDraft.phone,
        },
      });
      setUser(updated);
      setProfileMessage(t('profile.saved'));
    } catch (cause) {
      setProfileError(cause instanceof Error ? cause.message : t('profile.failed'));
    } finally {
      setProfileSaving(false);
    }
  }

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    setPasswordError(null);
    setPasswordMessage(null);
    setPasswordSaving(true);

    try {
      await customerFetch('/auth/change-password', {
        method: 'POST',
        body: { currentPassword, newPassword },
      });
      setCurrentPassword('');
      setNewPassword('');
      setPasswordMessage(t('password.changed'));
    } catch (cause) {
      setPasswordError(cause instanceof Error ? cause.message : t('password.failed'));
    } finally {
      setPasswordSaving(false);
    }
  }

  return (
    <>
      <PageHeader title={t('profile.title')} description={t('profile.body')} />

      <Section>
        <form onSubmit={saveProfile} className="max-w-xl space-y-4">
          <div className="grid gap-4 xs:grid-cols-2">
            <div>
              <label className="field-label" htmlFor="firstName">
                {t('profile.firstName')}
              </label>
              <input
                id="firstName"
                className="field-input"
                autoComplete="given-name"
                value={profileDraft.firstName}
                onChange={(event) =>
                  setProfileDraft({
                    ...profileDraft,
                    firstName: event.target.value,
                  })
                }
              />
            </div>
            <div>
              <label className="field-label" htmlFor="lastName">
                {t('profile.lastName')}
              </label>
              <input
                id="lastName"
                className="field-input"
                autoComplete="family-name"
                value={profileDraft.lastName}
                onChange={(event) =>
                  setProfileDraft({
                    ...profileDraft,
                    lastName: event.target.value,
                  })
                }
              />
            </div>
          </div>

          <div>
            <label className="field-label" htmlFor="email">
              {t('profile.email')}
            </label>
            <input
              id="email"
              type="email"
              className="field-input"
              autoComplete="email"
              value={profileDraft.email}
              onChange={(event) => setProfileDraft({ ...profileDraft, email: event.target.value })}
            />
          </div>

          <div>
            <label className="field-label" htmlFor="phone">
              {t('profile.phone')}
            </label>
            <input
              id="phone"
              className="field-input"
              inputMode="tel"
              autoComplete="tel"
              value={profileDraft.phone}
              onChange={(event) => setProfileDraft({ ...profileDraft, phone: event.target.value })}
            />
          </div>

          {profileError ? (
            <p role="alert" className="text-sm text-red-700">
              {profileError}
            </p>
          ) : null}
          {profileMessage ? <p className="text-sm text-green-700">{profileMessage}</p> : null}

          <button type="submit" disabled={profileSaving} className="btn-primary">
            {profileSaving ? t('profile.saving') : t('profile.save')}
          </button>
        </form>
      </Section>

      <Disclosure label={t('password.title')}>
        <form onSubmit={changePassword} className="max-w-sm space-y-4">
          <p className="text-sm text-neutral-900/60">{t('password.body')}</p>

          <div>
            <label className="field-label" htmlFor="currentPassword">
              {t('password.current')}
            </label>
            <input
              id="currentPassword"
              type="password"
              className="field-input"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
            />
          </div>

          <div>
            <label className="field-label" htmlFor="newPassword">
              {t('password.new')}
            </label>
            <input
              id="newPassword"
              type="password"
              className="field-input"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              required
              minLength={8}
            />
          </div>

          {passwordError ? (
            <p role="alert" className="text-sm text-red-700">
              {passwordError}
            </p>
          ) : null}
          {passwordMessage ? <p className="text-sm text-green-700">{passwordMessage}</p> : null}

          <button type="submit" disabled={passwordSaving} className="btn-primary">
            {passwordSaving ? t('password.submitting') : t('password.submit')}
          </button>
        </form>
      </Disclosure>
    </>
  );
}
