'use client';

import { useEffect, useState } from 'react';
import { adminFetch } from '@/lib/admin-client';
import { DataTable, EmptyState, PageHeader, Dialog, Section, Disclosure } from '@/components/ui';
import { useAdminSession } from '@/components/admin/session';
import { Select } from '@/components/ui/select';

interface PostingView {
  id: string;
  userId: string;
  positionId: string;
  positionTitle: string;
  rankLevel: number;
  rankLabel: string;
  isPrimary: boolean;
  startedOn: string;
  endedOn: string | null;
}

interface PersonRow {
  userId: string;
  name: string;
  email: string | null;
  primaryPosting: PostingView | null;
}

interface Rank {
  id: string;
  key: string;
  label: string;
  level: number;
}

interface Position {
  id: string;
  title: string;
  orgUnitId: string;
  rankId: string;
}

interface OrgUnitOption {
  id: string;
  name: string;
  depth: number;
  closedAt: string | null;
}

/**
 * hr-people-org/20-people-positions-ranks.md WO-20.5 — the people list, one
 * nav entry. No `Employee` model (ADR-044): every row here is a `User` who
 * holds at least one posting.
 */
export default function PeoplePage() {
  const { can } = useAdminSession();
  const canManage = can('hr.people.manage');

  const [people, setPeople] = useState<PersonRow[] | null>(null);
  const [ranks, setRanks] = useState<Rank[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [orgUnits, setOrgUnits] = useState<OrgUnitOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [newPositionOpen, setNewPositionOpen] = useState(false);
  const [positionTitle, setPositionTitle] = useState('');
  const [positionOrgUnitId, setPositionOrgUnitId] = useState('');
  const [positionRankId, setPositionRankId] = useState('');

  const [assigning, setAssigning] = useState<PersonRow | null>(null);
  const [positionId, setPositionId] = useState('');
  const [isPrimary, setIsPrimary] = useState(true);
  const [blockedBy, setBlockedBy] = useState<{ postingId: string; positionTitle: string } | null>(null);

  const [newRankOpen, setNewRankOpen] = useState(false);
  const [rankKey, setRankKey] = useState('');
  const [rankLabel, setRankLabel] = useState('');
  const [rankLevel, setRankLevel] = useState('');

  const load = () => {
    adminFetch<PersonRow[]>('/admin/people')
      .then(setPeople)
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load people'));
  };

  const loadPositions = () => adminFetch<Position[]>('/admin/people/positions').then(setPositions).catch(() => undefined);

  useEffect(load, []);
  useEffect(() => {
    adminFetch<Rank[]>('/admin/people/ranks').then(setRanks).catch(() => undefined);
    loadPositions();
    adminFetch<OrgUnitOption[]>('/admin/org-structure/tree')
      .then((tree) => setOrgUnits(tree.filter((u) => !u.closedAt)))
      .catch(() => undefined);
  }, []);

  const openAssign = (person: PersonRow) => {
    setAssigning(person);
    setPositionId('');
    setIsPrimary(true);
    setBlockedBy(null);
  };

  useEffect(() => {
    if (!assigning || !positionId) {
      setBlockedBy(null);
      return;
    }
    adminFetch<{ blockedBy: { postingId: string; positionTitle: string } | null }>('/admin/people/postings/assign/preview', {
      method: 'POST',
      body: { userId: assigning.userId, positionId, isPrimary },
    })
      .then((res) => setBlockedBy(res.blockedBy))
      .catch(() => setBlockedBy(null));
  }, [assigning, positionId, isPrimary]);

  const assign = async () => {
    if (!assigning) return;
    setBusy(true);
    setError(null);
    try {
      await adminFetch('/admin/people/postings/assign', {
        method: 'POST',
        body: { userId: assigning.userId, positionId, isPrimary },
      });
      setAssigning(null);
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not assign this posting');
    } finally {
      setBusy(false);
    }
  };

  const endPosting = async (postingId: string) => {
    setBusy(true);
    setError(null);
    try {
      await adminFetch(`/admin/people/postings/${postingId}/end`, { method: 'POST' });
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not end this posting');
    } finally {
      setBusy(false);
    }
  };

  const createPosition = async () => {
    setBusy(true);
    setError(null);
    try {
      await adminFetch('/admin/people/positions', {
        method: 'POST',
        body: { title: positionTitle, orgUnitId: positionOrgUnitId, rankId: positionRankId },
      });
      setNewPositionOpen(false);
      setPositionTitle('');
      setPositionOrgUnitId('');
      setPositionRankId('');
      loadPositions();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create this position');
    } finally {
      setBusy(false);
    }
  };

  const createRank = async () => {
    setBusy(true);
    setError(null);
    try {
      await adminFetch('/admin/people/ranks', {
        method: 'POST',
        body: { key: rankKey, label: rankLabel, level: Number(rankLevel) },
      });
      setNewRankOpen(false);
      setRankKey('');
      setRankLabel('');
      setRankLevel('');
      adminFetch<Rank[]>('/admin/people/ranks').then(setRanks).catch(() => undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create this rank');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="People"
        description="Everyone who holds a posting — a position at a rank, in a unit of the org tree."
      />

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      <div className="overflow-hidden">
        {people && people.length === 0 ? (
          <EmptyState title="No one has been posted yet" description="Assign a first posting once positions exist." />
        ) : (
          <DataTable
            rows={people}
            loading={!people}
            emptyLabel="No one found."
            rowKey={(p) => p.userId}
            columns={[
              { header: 'Name', cell: (p) => <span className="font-medium text-neutral-900">{p.name}</span> },
              { header: 'Email', muted: true, cell: (p) => p.email ?? '—' },
              { header: 'Primary posting', cell: (p) => p.primaryPosting?.positionTitle ?? '— none —' },
              { header: 'Rank', muted: true, cell: (p) => p.primaryPosting?.rankLabel ?? '—' },
              {
                header: <span className="sr-only">Actions</span>,
                align: 'end',
                cell: (p) =>
                  canManage ? (
                    <div className="flex justify-end gap-3 text-xs">
                      <button className="btn-text" onClick={() => openAssign(p)}>
                        Assign posting
                      </button>
                      {p.primaryPosting ? (
                        <button className="btn-text text-red-700" onClick={() => endPosting(p.primaryPosting!.id)}>
                          End posting
                        </button>
                      ) : null}
                    </div>
                  ) : null,
              },
            ]}
          />
        )}
      </div>

      {canManage ? (
        <>
          <Section
            className="mt-8"
            title="Positions"
            description="A post in the org chart — the rank and unit it carries; who occupies it is a posting."
            action={
              <button className="btn-secondary" onClick={() => setNewPositionOpen(true)}>
                Add position
              </button>
            }
          >
            <Disclosure label={`${positions.length} position(s)`}>
              <div className="table-flat">
                {positions.map((p) => (
                  <div key={p.id} className="flex justify-between py-2 text-sm">
                    <span>{p.title}</span>
                  </div>
                ))}
              </div>
            </Disclosure>
          </Section>

          <Section
            className="mt-8"
            title="Rank ladder"
            action={
              <button className="btn-secondary" onClick={() => setNewRankOpen(true)}>
                Add rank
              </button>
            }
          >
            <Disclosure label={`${ranks.length} rank(s)`}>
              <div className="table-flat">
                {ranks.map((r) => (
                  <div key={r.id} className="flex justify-between py-2 text-sm">
                    <span>{r.label}</span>
                    <span className="tabular-nums text-neutral-900/60">Level {r.level}</span>
                  </div>
                ))}
              </div>
            </Disclosure>
          </Section>
        </>
      ) : null}

      <Dialog open={assigning !== null} onClose={busy ? () => {} : () => setAssigning(null)} title={`Assign a posting to ${assigning?.name ?? ''}`}>
        <div className="space-y-3">
          <div>
            <label htmlFor="assign-position" className="field-label">
              Position
            </label>
            <Select
              id="assign-position"
              label="Position"
              placeholder="Choose a position…"
              value={positionId}
              onChange={setPositionId}
              options={positions.map((pos) => ({ value: pos.id, label: pos.title }))}
            />
          </div>
          <label className="field-check">
            <input type="checkbox" checked={isPrimary} onChange={(e) => setIsPrimary(e.target.checked)} />
            <span>Primary posting</span>
          </label>
          {blockedBy ? (
            <p className="notice notice-error">
              This person already holds an open primary posting ({blockedBy.positionTitle}). End it first before assigning a new
              primary posting.
            </p>
          ) : null}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-secondary" disabled={busy} onClick={() => setAssigning(null)}>
            Cancel
          </button>
          <button className="btn-primary" disabled={busy || !positionId || !!blockedBy} onClick={assign}>
            Assign
          </button>
        </div>
      </Dialog>

      <Dialog open={newPositionOpen} onClose={busy ? () => {} : () => setNewPositionOpen(false)} title="Add a position">
        <div className="space-y-3">
          <label className="block">
            <span className="field-label">Title</span>
            <input
              className="field-input w-full"
              value={positionTitle}
              onChange={(e) => setPositionTitle(e.target.value)}
              placeholder="Finance Manager"
            />
          </label>
          <div>
            <label htmlFor="position-org-unit" className="field-label">
              Org unit
            </label>
            <Select
              id="position-org-unit"
              label="Org unit"
              placeholder="Choose a unit…"
              value={positionOrgUnitId}
              onChange={setPositionOrgUnitId}
              options={orgUnits.map((u) => ({ value: u.id, label: `${'—'.repeat(u.depth)} ${u.name}` }))}
            />
          </div>
          <div>
            <label htmlFor="position-rank" className="field-label">
              Rank
            </label>
            <Select
              id="position-rank"
              label="Rank"
              placeholder="Choose a rank…"
              value={positionRankId}
              onChange={setPositionRankId}
              options={ranks.map((r) => ({ value: r.id, label: r.label }))}
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-secondary" disabled={busy} onClick={() => setNewPositionOpen(false)}>
            Cancel
          </button>
          <button
            className="btn-primary"
            disabled={busy || !positionTitle.trim() || !positionOrgUnitId || !positionRankId}
            onClick={createPosition}
          >
            Create
          </button>
        </div>
      </Dialog>

      <Dialog open={newRankOpen} onClose={busy ? () => {} : () => setNewRankOpen(false)} title="Add a rank">
        <div className="space-y-3">
          <label className="block">
            <span className="field-label">Key</span>
            <input className="field-input w-full" value={rankKey} onChange={(e) => setRankKey(e.target.value)} placeholder="manager" />
          </label>
          <label className="block">
            <span className="field-label">Label</span>
            <input className="field-input w-full" value={rankLabel} onChange={(e) => setRankLabel(e.target.value)} placeholder="Manager" />
          </label>
          <label className="block">
            <span className="field-label">Level — higher outranks lower; leave gaps (10, 20, 30)</span>
            <input
              className="field-input w-full"
              type="number"
              value={rankLevel}
              onChange={(e) => setRankLevel(e.target.value)}
              placeholder="30"
            />
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-secondary" disabled={busy} onClick={() => setNewRankOpen(false)}>
            Cancel
          </button>
          <button className="btn-primary" disabled={busy || !rankKey.trim() || !rankLabel.trim() || !rankLevel} onClick={createRank}>
            Create
          </button>
        </div>
      </Dialog>
    </>
  );
}
