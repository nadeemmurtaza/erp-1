'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Clock, Lock, X } from 'lucide-react';
import { formatDate, formatDateTime } from '@newax/shared';
import { Badge, Button, ConfirmDialog, DataTable, Dialog, PageHeader, Pagination, Segmented } from '@/components/ui';
import {
  EMPTY_GRANT,
  GRANT_PRESETS,
  MAX_GRANT_DAYS,
  countersignCandidates,
  endsSoon,
  formatRemaining,
  grantEndsAt,
  grantRefusals,
  saveBlocker,
  scopeDiff,
  type GrantDraft,
  type GrantMode,
  type Person,
} from './access-draft';
import { ScopeChipEditor } from './scope-chip-editor';

/**
 * A master list with the detail of one row in a side sheet.
 *
 * The list is the overview and says nothing it cannot say in a line: who, what
 * role, which branches. Everything about changing access is one level down, in a
 * sheet opened from the row (Law 7). The sheet is modal on purpose: a half-made
 * change to someone's access is exactly the draft you must not lose by clicking
 * another row, and a modal makes "switch person" a decision (close, then open)
 * instead of an accident. Closing a dirty sheet asks first.
 *
 * What this adds to the mockup it came from, each one a rule this repository
 * already has:
 *   - A grant always ends. "Temporary access" cannot be switched on with no end:
 *     `OrgUnitGrant.expiresAt` is NOT NULL on purpose. It needs a reason, and an
 *     acting grant needs a countersignature from someone who outranks the person.
 *   - You cannot change your own access (the toxic pair is grant-and-use by one
 *     person); your own row opens read-only with the reason written.
 *   - No branch means no branch, never every branch.
 *   - Every refusal uses the server's own words and names what to change.
 *
 * Illustrative data. The permission to open this list is `users.manage`; the
 * temporary-access section additionally needs `org.access.grant`.
 */

/** The specimen's clock: one fixed instant, so the server and the browser print the same text. */
const NOW = new Date('2026-10-01T09:00:00Z');
const DAY_MS = 86_400_000;

const BRANCHES = ['Lahore', 'Karachi', 'Multan', 'Islamabad'] as const;
const RANKS = { Administrator: 5, 'Branch manager': 3, Accountant: 2, Cashier: 1 } as const;
const ROLES = Object.keys(RANKS) as (keyof typeof RANKS)[];
const PAGE_SIZE = 4;

interface Grant {
  endsAt: Date;
  mode: GrantMode;
}

interface Row extends Person {
  grant?: Grant;
}

const person = (
  id: string,
  name: string,
  role: keyof typeof RANKS,
  scopes: readonly string[],
  extra: Partial<Row> = {},
): Row => ({
  id,
  name,
  email: `${name.split(' ')[0]!.toLowerCase()}@example.com`,
  role,
  rank: RANKS[role],
  scopes,
  ...extra,
});

const SEED: Row[] = [
  person('u1', 'Amna Khan', 'Administrator', BRANCHES, { isViewer: true }),
  person('u2', 'Bilal Ahmed', 'Branch manager', ['Lahore']),
  person('u3', 'Chand Bibi', 'Branch manager', ['Karachi']),
  person('u4', 'Danish Raza', 'Cashier', ['Lahore'], {
    grant: { endsAt: new Date(NOW.getTime() + 3 * DAY_MS + 4 * 3_600_000), mode: 'READ' },
  }),
  person('u5', 'Erum Zafar', 'Accountant', ['Lahore', 'Karachi']),
  person('u6', 'Fatima Noor', 'Cashier', ['Lahore']),
  person('u7', 'Ghazi Malik', 'Cashier', ['Multan']),
  person('u8', 'Hina Shah', 'Branch manager', ['Multan']),
  person('u9', 'Imran Qureshi', 'Accountant', ['Islamabad']),
  person('u10', 'Javeria Ali', 'Cashier', ['Islamabad']),
  person('u11', 'Kamran Butt', 'Cashier', ['Karachi']),
  person('u12', 'Laiba Sheikh', 'Cashier', []),
];

const initials = (name: string) =>
  name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('');

function Avatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden="true"
      className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-neutral-100 text-xs font-semibold text-neutral-900"
    >
      {initials(name)}
    </span>
  );
}

const branchesText = (scopes: readonly string[]) =>
  scopes.length === 0
    ? 'None'
    : scopes.length === BRANCHES.length
      ? 'All branches'
      : scopes.length <= 2
        ? scopes.join(', ')
        : `${scopes[0]} +${scopes.length - 1}`;

/* ── the sheet ─────────────────────────────────────────────────────────── */

function AccessSheet({
  target,
  everyone,
  onClose,
  onSave,
  onRevoke,
}: {
  target: Row;
  everyone: readonly Row[];
  onClose: () => void;
  onSave: (next: Row) => void;
  onRevoke: (row: Row) => void;
}) {
  const id = useId();
  const [scopes, setScopes] = useState<string[]>([...target.scopes]);
  const [grant, setGrant] = useState<GrantDraft>(EMPTY_GRANT);
  const [asking, setAsking] = useState(false);

  const selfEdit = Boolean(target.isViewer);
  const live = target.grant && target.grant.endsAt.getTime() > NOW.getTime() ? target.grant : null;

  // Revoking removes the button that had focus, and the confirmation hands focus
  // back to something that no longer exists. Without this the keyboard lands on
  // the page behind the sheet, where Escape no longer reaches it.
  const grantToggle = useRef<HTMLInputElement>(null);
  const hadGrant = useRef(live !== null);
  useEffect(() => {
    if (hadGrant.current && live === null) grantToggle.current?.focus();
    hadGrant.current = live !== null;
  }, [live]);
  const diff = scopeDiff(target.scopes, scopes);
  const changed = diff.added.length > 0 || diff.removed.length > 0 || grant.enabled;
  const refusals = grantRefusals(grant, target, everyone);
  const blocker = saveBlocker({
    selfEdit,
    refusals,
    grantEnabled: grant.enabled,
    reason: grant.reason,
    changed,
  });
  const candidates = countersignCandidates(target, everyone);
  const endsAt = grantEndsAt(NOW, grant.days);

  const requestClose = () => (changed && !selfEdit ? setAsking(true) : onClose());
  const set = (patch: Partial<GrantDraft>) => setGrant((prev) => ({ ...prev, ...patch }));

  const save = () => {
    if (blocker) return;
    onSave({
      ...target,
      scopes,
      grant: grant.enabled ? { endsAt, mode: grant.mode } : target.grant,
    });
  };

  return (
    <Dialog
      open
      align="end"
      title={`Access for ${target.name}`}
      onClose={requestClose}
      header={
        <div className="flex items-start justify-between gap-4 border-b border-neutral-100 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar name={target.name} />
            <div className="min-w-0">
              <h2 className="truncate font-display text-base font-semibold text-neutral-900">{target.name}</h2>
              <p className="truncate text-sm text-neutral-900/70">{target.email}</p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={requestClose}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-neutral-500 transition-colors hover:bg-neutral-50 hover:text-neutral-900 fold:h-9 fold:w-9"
          >
            <X aria-hidden="true" className="h-[18px] w-[18px]" />
          </button>
        </div>
      }
      footer={
        <div className="grid gap-3">
          {blocker ? (
            <p role="status" id={`${id}-why`} className="flex items-start gap-1.5 text-sm text-neutral-900/70">
              {selfEdit ? <Lock aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : null}
              {blocker}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={requestClose}>
              Cancel
            </Button>
            <Button disabled={Boolean(blocker)} aria-describedby={blocker ? `${id}-why` : undefined} onClick={save}>
              Save access
            </Button>
          </div>
        </div>
      }
    >
      <div className="grid gap-6">
        {asking ? (
          <div role="alert" className="notice notice-warning grid gap-3">
            <p className="font-medium">Discard your changes to {target.name}’s access?</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setAsking(false)}>
                Keep editing
              </Button>
              <Button variant="danger" onClick={onClose}>
                Discard
              </Button>
            </div>
          </div>
        ) : null}

        {selfEdit ? (
          <p className="notice notice-info">This is you. Ask another administrator to change your own access.</p>
        ) : null}

        <section aria-labelledby={`${id}-scope`} className="grid gap-3">
          <div>
            <h3 id={`${id}-scope`} className="eyebrow">
              Branches
            </h3>
            <p className="mt-1 text-sm text-neutral-900/70">
              {target.role}. They see orders, stock and cash for these branches and no others.
            </p>
          </div>
          <ScopeChipEditor
            label={`Branches for ${target.name}`}
            values={scopes}
            options={BRANCHES}
            onChange={setScopes}
            disabled={selfEdit}
            noun="branch"
            nounPlural="branches"
            emptyText="No branch assigned. They can sign in and see no branch data. Add one to give them work."
          />
        </section>

        <section aria-labelledby={`${id}-temp`} className="grid gap-3">
          <h3 id={`${id}-temp`} className="eyebrow">
            Temporary access
          </h3>

          {live ? (
            <>
              <p
                role="status"
                className={`notice ${endsSoon(live.endsAt.getTime() - NOW.getTime()) ? 'notice-warning' : 'notice-info'}`}
              >
                <Clock aria-hidden="true" className="me-1.5 inline h-3.5 w-3.5 align-[-2px]" />
                {live.mode === 'ACTING' ? 'Acting access' : 'View access'} ends in{' '}
                {formatRemaining(live.endsAt.getTime() - NOW.getTime())}, on {formatDateTime(live.endsAt)}.
              </p>
              <div>
                <Button variant="secondary" disabled={selfEdit} onClick={() => onRevoke(target)}>
                  Revoke access
                </Button>
              </div>
            </>
          ) : (
            <>
              <label className="flex min-h-touch items-center gap-3 text-sm font-medium text-neutral-900 fold:min-h-0">
                <input
                  ref={grantToggle}
                  type="checkbox"
                  className="field-check"
                  checked={grant.enabled}
                  disabled={selfEdit}
                  onChange={(event) => set({ enabled: event.target.checked })}
                />
                Give temporary access
              </label>

              {grant.enabled ? (
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <p className="field-label mb-0">How long</p>
                    <Segmented
                      kind="choice"
                      label="How long"
                      value={grant.days}
                      onChange={(days) => set({ days })}
                      options={GRANT_PRESETS.map((preset) => ({
                        value: preset.days,
                        label: preset.label,
                        disabled: preset.days > MAX_GRANT_DAYS,
                      }))}
                    />
                    <p className="text-sm text-neutral-900/70">
                      Ends {formatDateTime(endsAt)}. A grant always ends; the longest allowed is {MAX_GRANT_DAYS} days,
                      set in Settings.
                    </p>
                  </div>

                  <label className="flex items-start gap-3 text-sm text-neutral-900">
                    <input
                      type="checkbox"
                      className="field-check mt-0.5"
                      checked={grant.mode === 'ACTING'}
                      onChange={(event) => set({ mode: event.target.checked ? 'ACTING' : 'READ' })}
                    />
                    <span>
                      <span className="font-medium">Acting.</span> Lets them approve at their post’s rank. Needs a
                      countersignature.
                    </span>
                  </label>

                  {grant.mode === 'ACTING' ? (
                    candidates.length === 0 ? (
                      <p className="notice notice-warning">
                        Nobody outranks {target.name}, so acting access cannot be countersigned.
                      </p>
                    ) : (
                      <div>
                        <label className="field-label" htmlFor={`${id}-signer`}>
                          Countersigned by
                        </label>
                        <select
                          id={`${id}-signer`}
                          className="field-input"
                          value={grant.countersignerId}
                          onChange={(event) => set({ countersignerId: event.target.value })}
                        >
                          <option value="">Choose who outranks them</option>
                          {candidates.map((candidate) => (
                            <option key={candidate.id} value={candidate.id}>
                              {candidate.name}, {candidate.role}
                            </option>
                          ))}
                        </select>
                      </div>
                    )
                  ) : null}

                  <div>
                    <label className="field-label" htmlFor={`${id}-reason`}>
                      Reason
                    </label>
                    <input
                      id={`${id}-reason`}
                      className="field-input"
                      placeholder="Covering leave, 2 weeks"
                      value={grant.reason}
                      onChange={(event) => set({ reason: event.target.value })}
                    />
                  </div>

                  {refusals.length > 0 ? (
                    <div className="notice notice-error grid gap-1">
                      {refusals.map((message) => (
                        <p key={message}>{message}</p>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </section>

        {changed && !selfEdit ? (
          <section aria-label="What will change" className="grid gap-2">
            <h3 className="eyebrow">What changes</h3>
            <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
              {diff.added.map((scope) => (
                <li key={`+${scope}`}>
                  <Badge tone="success">+ {scope}</Badge>
                </li>
              ))}
              {diff.removed.map((scope) => (
                <li key={`-${scope}`}>
                  <Badge tone="danger">− {scope}</Badge>
                </li>
              ))}
              {grant.enabled ? (
                <li>
                  <Badge tone="info">
                    + {grant.mode === 'ACTING' ? 'Acting' : 'View'} access until {formatDate(endsAt)}
                  </Badge>
                </li>
              ) : null}
            </ul>
          </section>
        ) : null}
      </div>
    </Dialog>
  );
}

/* ── the list ──────────────────────────────────────────────────────────── */

export function PeopleAccessSpecimen() {
  const [rows, setRows] = useState<Row[]>(SEED);
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('');
  const [branch, setBranch] = useState('');
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<Row | null>(null);
  const [announce, setAnnounce] = useState('');

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter(
      (row) =>
        (needle === '' || row.name.toLowerCase().includes(needle) || row.email.toLowerCase().includes(needle)) &&
        (role === '' || row.role === role) &&
        (branch === '' || row.scopes.includes(branch)),
    );
  }, [rows, query, role, branch]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, totalPages);
  const visible = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const open = rows.find((row) => row.id === openId) ?? null;
  const filtering = query !== '' || role !== '' || branch !== '';

  const refilter = (apply: () => void) => {
    apply();
    setPage(1);
  };

  return (
    <div className="mx-auto grid max-w-6xl gap-4">
      <PageHeader
        className="mb-0"
        headingLevel="h4"
        title="People"
        description="Who can sign in, and which branches each person can reach."
        action={
          <a className="btn btn-primary" href="#patterns">
            Add users
          </a>
        }
      />

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 p-4">
          <div className="min-w-0 flex-1 basis-48">
            <label className="sr-only" htmlFor="ds-people-search">
              Search people
            </label>
            <input
              id="ds-people-search"
              type="search"
              className="field-input"
              placeholder="Search name or email"
              value={query}
              onChange={(event) => refilter(() => setQuery(event.target.value))}
            />
          </div>
          <select
            aria-label="Role"
            className="field-input w-auto max-w-full"
            value={role}
            onChange={(event) => refilter(() => setRole(event.target.value))}
          >
            <option value="">All roles</option>
            {ROLES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <select
            aria-label="Branch"
            className="field-input w-auto max-w-full"
            value={branch}
            onChange={(event) => refilter(() => setBranch(event.target.value))}
          >
            <option value="">All branches</option>
            {BRANCHES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <p role="status" className="ms-auto text-sm text-neutral-900/70">
            {filtered.length === rows.length
              ? `${rows.length} people`
              : `${filtered.length} of ${rows.length} people match`}
          </p>
        </div>

        <DataTable
          stacked
          rows={visible}
          rowKey={(row) => row.id}
          onRowClick={(row) => setOpenId(row.id)}
          emptyLabel="No one matches. Clear the search or a filter to see everyone."
          columns={[
            {
              header: 'Person',
              cell: (row) => (
                <span className="flex min-w-0 items-center gap-3">
                  <Avatar name={row.name} />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {row.name}
                      {row.isViewer ? (
                        <span className="ms-1.5 text-xs font-normal text-neutral-900/70">(you)</span>
                      ) : null}
                    </span>
                    <span className="block truncate text-xs font-normal text-neutral-900/70">{row.email}</span>
                  </span>
                </span>
              ),
            },
            {
              header: 'Role',
              cell: (row) => (
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Badge>{row.role}</Badge>
                  {row.grant && row.grant.endsAt.getTime() > NOW.getTime() ? (
                    <span className="inline-flex items-center gap-1 text-xs text-neutral-900/70">
                      <Clock aria-hidden="true" className="h-3 w-3" />
                      Until {formatDate(row.grant.endsAt)}
                    </span>
                  ) : null}
                </span>
              ),
            },
            { header: 'Branches', muted: true, cell: (row) => branchesText(row.scopes) },
            {
              header: <span className="sr-only">Action</span>,
              align: 'end',
              cell: (row) => (
                <button
                  type="button"
                  className="btn-text"
                  aria-haspopup="dialog"
                  aria-label={`Manage access for ${row.name}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    setOpenId(row.id);
                  }}
                >
                  Manage
                </button>
              ),
            },
          ]}
        />

        {visible.length === 0 && filtering ? (
          <div className="pb-6 text-center">
            <Button
              variant="secondary"
              onClick={() => {
                setQuery('');
                setRole('');
                setBranch('');
                setPage(1);
              }}
            >
              Clear filters
            </Button>
          </div>
        ) : null}

        <Pagination
          itemLabel="people"
          meta={{
            page: current,
            totalPages,
            total: filtered.length,
            hasNext: current < totalPages,
            hasPrevious: current > 1,
          }}
          onChange={setPage}
        />
      </div>

      {open ? (
        <AccessSheet
          key={open.id}
          target={open}
          everyone={rows}
          onClose={() => setOpenId(null)}
          onRevoke={(row) => setRevoking(row)}
          onSave={(next) => {
            setRows((prev) => prev.map((row) => (row.id === next.id ? next : row)));
            setAnnounce(`Access saved for ${next.name}.`);
            setOpenId(null);
          }}
        />
      ) : null}

      <ConfirmDialog
        open={revoking !== null}
        onClose={() => setRevoking(null)}
        onConfirm={() => {
          if (!revoking) return;
          setRows((prev) => prev.map((row) => (row.id === revoking.id ? { ...row, grant: undefined } : row)));
          setAnnounce(`Temporary access revoked for ${revoking.name}.`);
          setRevoking(null);
        }}
        title="Revoke temporary access?"
        description="It ends now. Anything they already exported stays as it is; this only stops further access."
        confirmLabel="Revoke temporary access"
        variant="danger"
      />

      <p role="status" className="sr-only">
        {announce}
      </p>
    </div>
  );
}
