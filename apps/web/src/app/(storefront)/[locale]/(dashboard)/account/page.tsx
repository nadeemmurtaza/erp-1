'use client';

import { useState } from 'react';
import type { AuthUser } from '@/types/api';
import { customerFetch } from '@/lib/customer-client';
import { useCustomerSession } from '@/components/storefront/customer-session';

export default function AccountProfilePage() {
  const { user, setUser } = useCustomerSession();

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
      setProfileMessage('Profile updated.');
    } catch (cause) {
      setProfileError(cause instanceof Error ? cause.message : 'Could not update your profile');
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
      setPasswordMessage('Password changed. You have been signed out of every other device.');
    } catch (cause) {
      setPasswordError(cause instanceof Error ? cause.message : 'Could not change your password');
    } finally {
      setPasswordSaving(false);
    }
  }

  return (
    <div className="grid gap-6 fold:grid-cols-2">
      <form onSubmit={saveProfile} className="card space-y-4 p-6">
        <h2 className="text-lg font-semibold text-neutral-900">Profile details</h2>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="field-label" htmlFor="firstName">
              First name
            </label>
            <input
              id="firstName"
              className="field-input"
              value={profileDraft.firstName}
              onChange={(event) => setProfileDraft({ ...profileDraft, firstName: event.target.value })}
            />
          </div>
          <div>
            <label className="field-label" htmlFor="lastName">
              Last name
            </label>
            <input
              id="lastName"
              className="field-input"
              value={profileDraft.lastName}
              onChange={(event) => setProfileDraft({ ...profileDraft, lastName: event.target.value })}
            />
          </div>
        </div>

        <div>
          <label className="field-label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            className="field-input"
            value={profileDraft.email}
            onChange={(event) => setProfileDraft({ ...profileDraft, email: event.target.value })}
          />
        </div>

        <div>
          <label className="field-label" htmlFor="phone">
            Phone
          </label>
          <input
            id="phone"
            className="field-input"
            value={profileDraft.phone}
            onChange={(event) => setProfileDraft({ ...profileDraft, phone: event.target.value })}
          />
        </div>

        {profileError ? (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {profileError}
          </p>
        ) : null}
        {profileMessage ? <p className="text-sm text-green-700">{profileMessage}</p> : null}

        <button type="submit" disabled={profileSaving} className="btn-primary">
          {profileSaving ? 'Saving…' : 'Save profile'}
        </button>
      </form>

      <form onSubmit={changePassword} className="card space-y-4 p-6">
        <h2 className="text-lg font-semibold text-neutral-900">Change password</h2>

        <div>
          <label className="field-label" htmlFor="currentPassword">
            Current password
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
            New password
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
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {passwordError}
          </p>
        ) : null}
        {passwordMessage ? <p className="text-sm text-green-700">{passwordMessage}</p> : null}

        <button type="submit" disabled={passwordSaving} className="btn-primary">
          {passwordSaving ? 'Changing…' : 'Change password'}
        </button>
      </form>
    </div>
  );
}
