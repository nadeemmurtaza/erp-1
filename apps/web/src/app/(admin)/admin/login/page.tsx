'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { listSsoSignInOptions, login, ssoStartUrl } from '@/lib/admin-client';
import { landingFor } from '@/components/admin/nav-registry';
import { BRAND } from '@newax/shared';
import type { SsoSignInOption } from '@/types/api';

/** What the API's single sign-on routes append when a sign-in through them failed, for any reason. */
const SSO_FAILED_PARAM = 'sso';
const SSO_FAILED_MESSAGE = 'Single sign-on did not complete. Try again, or sign in with your password.';

export default function AdminLoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Single sign-on (161-sso-identity-federation.md): one button per active
  // connection. With none configured this stays empty and the screen renders
  // exactly as it did before single sign-on existed.
  const [ssoOptions, setSsoOptions] = useState<SsoSignInOption[]>([]);

  useEffect(() => {
    // Read once, in the browser — the reason a sign-in failed is in the
    // server's log, never in the URL.
    if (new URLSearchParams(window.location.search).get(SSO_FAILED_PARAM) === 'failed') {
      setError(SSO_FAILED_MESSAGE);
    }
    let live = true;
    void listSsoSignInOptions().then((options) => {
      if (live) setSsoOptions(options);
    });
    return () => {
      live = false;
    };
  }, []);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    try {
      const user = await login(identifier, password);
      // A tailor has no dashboard to read; send them straight to their queue.
      router.replace(landingFor(user.permissions));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Sign-in failed');
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-center text-2xl font-semibold text-neutral-900">{BRAND.identity.adminName}</h1>
        <p className="mt-1 text-center text-sm text-neutral-900/60">
          Sign in to manage the catalogue and orders.
        </p>

        {/*
         * No box. A border separates one thing from another, and this form is
         * the only thing on the page — there is nothing on the other side of
         * that line. The centred column and the space around it already say
         * where the form begins.
         */}
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label className="field-label" htmlFor="identifier">
              Email or phone
            </label>
            <input
              id="identifier"
              className="field-input"
              autoComplete="username"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              required
            />
          </div>

          <div>
            <label className="field-label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              className="field-input"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>

          {error ? (
            <p role="alert" className="notice notice-error">
              {error}
            </p>
          ) : null}

          <button type="submit" disabled={busy} className="btn-primary w-full">
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        {ssoOptions.length > 0 ? (
          // Links, not buttons: each is a top-level navigation to the API,
          // which sends the browser on to the identity provider.
          <div className="mt-6 space-y-3">
            {ssoOptions.map((option) => (
              <a key={option.id} href={ssoStartUrl(option.id)} className="btn-secondary w-full">
                Sign in with {option.label}
              </a>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
