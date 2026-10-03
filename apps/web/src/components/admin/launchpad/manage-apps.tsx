'use client';

import { useCallback, useEffect, useState } from 'react';
import { Disclosure, Switch } from '@/components/ui';
import { adminFetch } from '@/lib/admin-client';
import { HIDDEN_REASON_LABEL, type LaunchpadAppStatus } from './launchpad';

/**
 * Who may switch an app off for the whole organization (`launchpad.manage`).
 * Closed by default: most people on this screen never need it (Law 2). Turning
 * an app off hides its tile; it deletes nothing and stops no module, so the
 * switch applies now and the same switch undoes it.
 *
 * A row that is off for a reason a switch cannot fix (a module this deployment
 * has not turned on) is disabled and says why in words, not only greyed.
 */
export function ManageApps({ onChanged }: { onChanged: () => void }) {
  const [rows, setRows] = useState<LaunchpadAppStatus[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await adminFetch<{ apps: LaunchpadAppStatus[] }>('/launchpad/apps');
      setRows(response.apps);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the app list.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(key: string, enabled: boolean) {
    setSaving(key);
    setError(null);
    try {
      const response = await adminFetch<{ apps: LaunchpadAppStatus[] }>(`/launchpad/apps/${key}`, {
        method: 'PUT',
        body: JSON.stringify({ enabled }),
      });
      setRows(response.apps);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that change. Try again.');
    } finally {
      setSaving(null);
    }
  }

  return (
    <Disclosure label="Show or hide apps for your organization" className="mt-10">
      {error ? (
        <p className="notice notice-error mb-3" role="alert">
          {error}
        </p>
      ) : null}
      {!rows ? (
        error ? null : <p className="text-sm text-neutral-900/60">Loading…</p>
      ) : (
        <ul className="flex flex-col divide-y divide-neutral-100">
          {rows.map(({ app, enabled, hiddenReason }) => {
            // A module-level reason is not the tenant's to fix with this switch.
            const stuck = hiddenReason !== null && hiddenReason !== 'disabled-by-tenant';
            return (
              <li key={app.key}>
                <Switch
                  label={app.label}
                  description={stuck ? HIDDEN_REASON_LABEL[hiddenReason] : app.description}
                  checked={enabled}
                  disabled={stuck || saving === app.key}
                  onChange={(next) => void toggle(app.key, next)}
                />
              </li>
            );
          })}
        </ul>
      )}
    </Disclosure>
  );
}
