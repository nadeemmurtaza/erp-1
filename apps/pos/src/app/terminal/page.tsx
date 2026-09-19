'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { listTerminals, type PosTerminal } from '@/lib/pos-client';
import { ApiError } from '@/lib/api-client';
import { STORAGE_KEYS } from '@/constants/storage';
import { ROUTES } from '@/constants/routes';

/**
 * One-time-per-device setup: which registered terminal this browser IS.
 * `GET admin/pos/terminals` needs `pos.manage` (an admin-tier permission),
 * so this screen only works for whoever provisions the till — a plain
 * cashier signing into an already-configured device never sees it again,
 * since terminalId persists in localStorage after this runs once.
 */
export default function SelectTerminalPage() {
  const router = useRouter();
  const [terminals, setTerminals] = useState<PosTerminal[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listTerminals()
      .then((res) => setTerminals(res.data.filter((t) => t.status === 'ACTIVE')))
      .catch((cause) =>
        setError(
          cause instanceof ApiError
            ? cause.status === 403
              ? 'Ask a manager to set up this till — your account can’t list terminals.'
              : cause.message
            : 'Could not load terminals',
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  function choose(terminal: PosTerminal) {
    localStorage.setItem(STORAGE_KEYS.terminalId, terminal.id);
    router.replace(ROUTES.openShift);
  }

  return (
    <main className="mx-auto max-w-lg p-6">
      <h1 className="mb-4 text-2xl font-semibold text-neutral-900">Which terminal is this?</h1>

      {loading && <p className="text-neutral-500">Loading…</p>}
      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-red-700">{error}</p>}

      <ul className="space-y-3">
        {terminals.map((terminal) => (
          <li key={terminal.id}>
            <button className="tap-btn-secondary justify-between" onClick={() => choose(terminal)}>
              <span>{terminal.label}</span>
              <span className="text-neutral-500">{terminal.code}</span>
            </button>
          </li>
        ))}
      </ul>

      {!loading && !error && terminals.length === 0 && (
        <p className="text-neutral-500">No active terminals — register one first.</p>
      )}
    </main>
  );
}
