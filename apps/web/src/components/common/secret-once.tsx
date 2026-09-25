'use client';

import { useId, useRef, useState } from 'react';

/**
 * A credential shown exactly once — a personal API key's secret, in the one
 * response that created or rotated it (163-personal-api-keys.md). The server
 * keeps only its hash, so this is the only copy anyone will ever see.
 *
 * Shared by the admin and the storefront; the wording is the caller's,
 * because the storefront's comes from messages/*.json and the admin's is
 * English (House Rule 6).
 *
 * Inline rather than a modal, on purpose: a stray Escape or backdrop click
 * must not throw away the only copy of the secret. It stays on the page
 * until the reader says they have it.
 */
export function SecretOnce({
  title,
  warning,
  secret,
  usage,
  copyLabel,
  copiedLabel,
  copyFailedLabel,
  dismissLabel,
  onDismiss,
}: {
  title: string;
  /** That it will not be shown again, and what to do if it is lost. */
  warning: string;
  secret: string;
  /** How to send it, e.g. the Authorization header — optional. */
  usage?: string;
  copyLabel: string;
  copiedLabel: string;
  /** Shown when the browser refuses clipboard access; the text is selected for a manual copy instead. */
  copyFailedLabel: string;
  dismissLabel: string;
  onDismiss: () => void;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  async function copy() {
    try {
      await navigator.clipboard.writeText(secret);
      setCopyState('copied');
    } catch {
      // No clipboard permission, or not a secure origin: select it so it can
      // be copied by hand, and say so.
      input.current?.select();
      setCopyState('failed');
    }
  }

  return (
    <section aria-labelledby={`${id}-title`} className="notice notice-info mb-6 space-y-3">
      <h2 id={`${id}-title`} className="text-sm font-semibold text-neutral-900">
        {title}
      </h2>
      <p className="max-w-prose">{warning}</p>

      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`${id}-secret`} className="sr-only">
          {title}
        </label>
        <input
          ref={input}
          id={`${id}-secret`}
          readOnly
          value={secret}
          dir="ltr"
          spellCheck={false}
          onFocus={(event) => event.currentTarget.select()}
          className="field-input min-w-0 flex-1 font-mono text-xs"
        />
        <button type="button" className="btn-secondary" onClick={() => void copy()}>
          {copyState === 'copied' ? copiedLabel : copyLabel}
        </button>
      </div>

      <p aria-live="polite" className="text-xs">
        {copyState === 'failed' ? copyFailedLabel : ''}
      </p>

      {usage ? (
        <p dir="ltr" className="font-mono text-xs text-neutral-900/70">
          {usage}
        </p>
      ) : null}

      <button type="button" className="btn-primary" onClick={onDismiss}>
        {dismissLabel}
      </button>
    </section>
  );
}
