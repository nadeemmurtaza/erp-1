'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button, Field, FormStack } from '@/components/ui';
import { useDoneBeat } from '@/hooks/use-done-beat';
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
  const { done, finish } = useDoneBeat();
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
      await finish();
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
         * The sign-in recipe (FRM-1 to FRM-6): labels above, example
         * placeholders, 16px between fields and 32px before the one filled
         * button, and a lit surface. The surface is here, against the usual
         * "no box" rule, because this page has a backdrop behind it: the card is
         * what separates the form from `neutral-50`, and in the dark theme it is
         * the elevation cue. The storefront sign-in has no backdrop and no card.
         */}
        <div className="card-lit mt-6 p-6">
          <FormStack
            onSubmit={onSubmit}
            actions={
              <Button
                type="submit"
                loading={busy}
                loadingLabel="Signing in…"
                done={done}
                doneLabel="Signed in"
                className="w-full"
              >
                Sign in
              </Button>
            }
          >
            <Field label="Email or phone">
              {(control) => (
                <input
                  {...control}
                  className="field-input field-xl"
                  autoComplete="username"
                  placeholder="you@example.com"
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  required
                />
              )}
            </Field>

            <Field label="Password">
              {(control) => (
                <input
                  {...control}
                  type="password"
                  className="field-input field-xl"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              )}
            </Field>

            {error ? (
              <p role="alert" className="notice notice-error">
                {error}
              </p>
            ) : null}
          </FormStack>
        </div>

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
