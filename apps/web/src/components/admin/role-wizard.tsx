'use client';

import { useState } from 'react';
import { PERMISSION_CATALOG, PERMISSION_GROUPS } from '@/constants/permissions';
import { adminFetch } from '@/lib/admin-client';
import type { RoleSummary, RoleWriteResult } from '@/types/api';
import { cn } from '@/utils/cn';

/**
 * Create-or-edit a role, one permission group per screen (owner's request):
 * name and description first, then every `PERMISSION_GROUPS` entry as its
 * own step — never all 28 permissions on one page — then a review step
 * that actually saves. Nothing reaches the API until "Create role"/"Save
 * role" on the last step; every step before that is local state, so
 * abandoning the wizard partway leaves no half-made role behind.
 *
 * Role and user are different things throughout: this component only ever
 * touches `Role`/`RoleGrant` (what a role holds) — assigning a role *to* a
 * user is the checklist on their own profile page
 * (`/admin/users/[id]`), a different screen entirely.
 */
export function RoleWizard({
  role,
  onDone,
  onCancel,
}: {
  /** Omit to create a new role; pass an existing one to edit it. */
  role?: RoleSummary;
  onDone: (role: RoleSummary) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [permissions, setPermissions] = useState<Set<string>>(new Set(role?.permissions ?? []));
  const [step, setStep] = useState(0); // 0 = details, 1..N = a PERMISSION_GROUPS index, N+1 = review
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateNotice, setDuplicateNotice] = useState<string | null>(null);

  const lastStep = PERMISSION_GROUPS.length + 1;
  const permissionByKey = new Map(PERMISSION_CATALOG.map((p) => [p.key, p]));

  function toggle(key: string) {
    const next = new Set(permissions);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setPermissions(next);
  }

  function setGroup(groupKeys: readonly string[], checked: boolean) {
    const next = new Set(permissions);
    for (const key of groupKeys) {
      if (checked) next.add(key);
      else next.delete(key);
    }
    setPermissions(next);
  }

  function countInGroup(groupKeys: readonly string[]): number {
    return groupKeys.filter((key) => permissions.has(key)).length;
  }

  async function finish() {
    setSaving(true);
    setError(null);
    try {
      const body = { name, description: description || undefined, permissions: [...permissions] };
      const result = role
        ? await adminFetch<RoleWriteResult>(`/admin/roles/${role.id}`, { method: 'PATCH', body })
        : await adminFetch<RoleWriteResult>('/admin/roles', { method: 'POST', body });

      if (result.duplicateOfRoleName) {
        setDuplicateNotice(
          `"${result.duplicateOfRoleName}" already grants exactly this set — consider assigning ` +
            'that role instead of keeping two that do the same thing. Saved anyway; nothing is blocked.',
        );
      }
      onDone(result.role);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save this role');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[14rem_1fr]">
      {/* Non-linear on purpose — "select whole group or just a few as needed"
          means an admin should be able to jump straight to the one group
          they came here for, not click Next through thirteen screens. */}
      <nav aria-label="Wizard steps" className="space-y-1">
        <StepLink label="Name & description" active={step === 0} done={name.trim().length > 0} onClick={() => setStep(0)} />
        {PERMISSION_GROUPS.map((group, index) => (
          <StepLink
            key={group.key}
            label={group.label}
            active={step === index + 1}
            done={countInGroup(group.permissions) > 0}
            badge={countInGroup(group.permissions) || undefined}
            onClick={() => setStep(index + 1)}
          />
        ))}
        <StepLink label="Review & finish" active={step === lastStep} done={false} onClick={() => setStep(lastStep)} />
      </nav>

      <div>
        {error ? (
          <p role="alert" className="notice notice-error mb-4">
            {error}
          </p>
        ) : null}
        {duplicateNotice ? <p className="notice notice-info mb-4">{duplicateNotice}</p> : null}

        {step === 0 ? (
          <DetailsStep name={name} setName={setName} description={description} setDescription={setDescription} />
        ) : step <= PERMISSION_GROUPS.length ? (
          <GroupStep
            group={PERMISSION_GROUPS[step - 1]}
            permissionByKey={permissionByKey}
            selected={permissions}
            onToggle={toggle}
            onSetGroup={setGroup}
          />
        ) : (
          <ReviewStep
            name={name}
            totalCount={permissions.size}
            permissionByKey={permissionByKey}
            selected={permissions}
          />
        )}

        <div className="mt-6 flex items-center justify-between border-t border-neutral-100 pt-4">
          <div className="flex gap-2">
            <button type="button" onClick={onCancel} className="btn-ghost">
              Cancel
            </button>
            {step > 0 ? (
              <button type="button" onClick={() => setStep(step - 1)} className="btn-secondary">
                Back
              </button>
            ) : null}
          </div>

          {step < lastStep ? (
            <button
              type="button"
              disabled={step === 0 && !name.trim()}
              onClick={() => setStep(step + 1)}
              className="btn-primary disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          ) : (
            <button type="button" disabled={saving || !name.trim()} onClick={() => void finish()} className="btn-primary">
              {saving ? 'Saving…' : role ? 'Save role' : 'Create role'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function StepLink({
  label,
  active,
  done,
  badge,
  onClick,
}: {
  label: string;
  active: boolean;
  done: boolean;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center justify-between gap-2 rounded px-2.5 py-1.5 text-start text-sm transition-colors',
        active ? 'bg-accent font-medium text-white' : 'text-neutral-900/70 hover:bg-neutral-50',
      )}
    >
      <span className="min-w-0 truncate">{label}</span>
      {badge ? (
        <span
          className={cn(
            'pill shrink-0',
            active ? 'bg-white/20 text-white' : 'bg-neutral-100 text-neutral-900/60',
          )}
        >
          {badge}
        </span>
      ) : done ? (
        <span className={cn('shrink-0 text-xs', active ? 'text-white/80' : 'text-neutral-900/60')}>✓</span>
      ) : null}
    </button>
  );
}

function DetailsStep({
  name,
  setName,
  description,
  setDescription,
}: {
  name: string;
  setName: (value: string) => void;
  description: string;
  setDescription: (value: string) => void;
}) {
  return (
    <div className="max-w-md space-y-4">
      <h2 className="eyebrow">Name &amp; description</h2>
      <label className="block">
        <span className="field-label">Name</span>
        <input value={name} onChange={(event) => setName(event.target.value)} required className="field-input" />
      </label>
      <label className="block">
        <span className="field-label">Description</span>
        <input
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="What this role is for"
          className="field-input"
        />
      </label>
    </div>
  );
}

const SENSITIVITY_LABEL: Record<string, string> = {
  medium: 'Touches money, cost, or another person’s data.',
  high: 'Grants power over other accounts or brands/branches.',
  critical: 'Can lock every admin out of the screen that would undo it.',
};

function GroupStep({
  group,
  permissionByKey,
  selected,
  onToggle,
  onSetGroup,
}: {
  group: (typeof PERMISSION_GROUPS)[number];
  permissionByKey: Map<string, (typeof PERMISSION_CATALOG)[number]>;
  selected: Set<string>;
  onToggle: (key: string) => void;
  onSetGroup: (keys: readonly string[], checked: boolean) => void;
}) {
  const allChecked = group.permissions.every((key) => selected.has(key));

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="eyebrow">{group.label}</h2>
          <p className="text-sm text-neutral-900/60">{group.description}</p>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-sm text-neutral-900/70">
          <input
            type="checkbox"
            checked={allChecked}
            onChange={(event) => onSetGroup(group.permissions, event.target.checked)}
            className="field-check"
          />
          Select all
        </label>
      </div>

      <ul className="divide-y divide-neutral-100 rounded border border-neutral-100">
        {group.permissions.map((key) => {
          const permission = permissionByKey.get(key);
          if (!permission) return null;
          const warn = permission.sensitivity !== 'low';
          return (
            <li key={key} className="flex items-start gap-3 px-3 py-2.5">
              <input
                type="checkbox"
                checked={selected.has(key)}
                onChange={() => onToggle(key)}
                className="field-check mt-0.5"
              />
              <div className="min-w-0">
                <span className="text-sm text-neutral-900">{permission.label}</span>
                <p className="text-xs text-neutral-900/60">{permission.key}</p>
                {warn ? (
                  <p
                    className={cn(
                      'mt-1 text-xs font-medium',
                      permission.sensitivity === 'critical' ? 'text-feedback-negative' : 'text-amber-700',
                    )}
                  >
                    {permission.sensitivity === 'critical' ? 'Critical — ' : permission.sensitivity === 'high' ? 'High — ' : 'Note — '}
                    {SENSITIVITY_LABEL[permission.sensitivity]}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ReviewStep({
  name,
  totalCount,
  permissionByKey,
  selected,
}: {
  name: string;
  totalCount: number;
  permissionByKey: Map<string, (typeof PERMISSION_CATALOG)[number]>;
  selected: Set<string>;
}) {
  const bySensitivity = { critical: 0, high: 0, medium: 0, low: 0 } as Record<string, number>;
  for (const key of selected) {
    const sensitivity = permissionByKey.get(key)?.sensitivity;
    if (sensitivity) bySensitivity[sensitivity] += 1;
  }

  return (
    <div>
      <h2 className="eyebrow mb-3">Review — {name || 'Untitled role'}</h2>
      <p className="mb-4 text-sm text-neutral-900/60">
        {totalCount} permission{totalCount === 1 ? '' : 's'} selected across every group.
      </p>

      {bySensitivity.critical > 0 || bySensitivity.high > 0 ? (
        <p className="notice notice-info mb-4">
          Includes {bySensitivity.critical} critical and {bySensitivity.high} high-sensitivity
          permission{bySensitivity.critical + bySensitivity.high === 1 ? '' : 's'} — double-check this
          is who should hold them before saving.
        </p>
      ) : null}

      {totalCount === 0 ? (
        <p className="text-sm text-neutral-900/60">
          Nothing selected yet — a role with no permissions is valid, but does nothing until edited.
        </p>
      ) : (
        <ul className="space-y-1 text-sm text-neutral-900/70">
          {PERMISSION_GROUPS.filter((group) => group.permissions.some((key) => selected.has(key))).map((group) => (
            <li key={group.key}>
              <span className="font-medium text-neutral-900">{group.label}:</span>{' '}
              {group.permissions.filter((key) => selected.has(key)).length} of {group.permissions.length}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
