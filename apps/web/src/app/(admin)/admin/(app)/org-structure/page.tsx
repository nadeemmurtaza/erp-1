'use client';

import { useEffect, useState } from 'react';
import { adminFetch } from '@/lib/admin-client';
import { PageHeader, EmptyState, Disclosure, ConfirmDialog, Dialog, Loading } from '@/components/ui';
import { useAdminSession } from '@/components/admin/session';

interface OrgUnitType {
  id: string;
  key: string;
  label: string;
}

interface OrgUnitView {
  id: string;
  code: string;
  name: string;
  typeId: string;
  typeLabel: string;
  parentId: string | null;
  depth: number;
  isActive: boolean;
  closedAt: string | null;
}

/**
 * hr-people-org/19-org-structure-offices-departments.md WO-19.4 — one tree
 * screen: the whole org chart, a create/rename/move drawer, and a
 * closed-units disclosure. Not a page suite (Law 5).
 */
export default function OrgStructurePage() {
  const { can } = useAdminSession();
  const canManage = can('org.structure.manage');

  const [units, setUnits] = useState<OrgUnitView[] | null>(null);
  const [types, setTypes] = useState<OrgUnitType[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [newParentId, setNewParentId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newTypeId, setNewTypeId] = useState('');

  const [renaming, setRenaming] = useState<OrgUnitView | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const [moving, setMoving] = useState<OrgUnitView | null>(null);
  const [moveTargetId, setMoveTargetId] = useState<string>('');

  const [closing, setClosing] = useState<OrgUnitView | null>(null);

  const load = () => {
    adminFetch<OrgUnitView[]>('/admin/org-structure/tree')
      .then(setUnits)
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load the org tree'));
  };

  useEffect(load, []);
  useEffect(() => {
    if (!canManage) return;
    adminFetch<OrgUnitType[]>('/admin/org-structure/types')
      .then(setTypes)
      .catch(() => undefined);
  }, [canManage]);

  const openUnits = units?.filter((u) => !u.closedAt) ?? [];
  const closedUnits = units?.filter((u) => u.closedAt) ?? [];

  const openNewUnitDialog = (parentId: string | null) => {
    setNewParentId(parentId);
    setNewCode('');
    setNewName('');
    setNewTypeId(types[0]?.id ?? '');
    setNewOpen(true);
  };

  const createUnit = async () => {
    setBusy(true);
    setError(null);
    try {
      await adminFetch('/admin/org-structure', {
        method: 'POST',
        body: { code: newCode, name: newName, typeId: newTypeId, parentId: newParentId ?? undefined },
      });
      setNewOpen(false);
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create this unit');
    } finally {
      setBusy(false);
    }
  };

  const rename = async () => {
    if (!renaming) return;
    setBusy(true);
    setError(null);
    try {
      await adminFetch(`/admin/org-structure/${renaming.id}/rename`, { method: 'PATCH', body: { name: renameValue } });
      setRenaming(null);
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not rename this unit');
    } finally {
      setBusy(false);
    }
  };

  const move = async () => {
    if (!moving) return;
    setBusy(true);
    setError(null);
    try {
      await adminFetch(`/admin/org-structure/${moving.id}/move`, {
        method: 'POST',
        body: { newParentId: moveTargetId || null },
      });
      setMoving(null);
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not move this unit');
    } finally {
      setBusy(false);
    }
  };

  const close = async () => {
    if (!closing) return;
    setBusy(true);
    try {
      await adminFetch(`/admin/org-structure/${closing.id}/close`, { method: 'POST' });
      setClosing(null);
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not close this unit');
      setClosing(null);
    } finally {
      setBusy(false);
    }
  };

  if (!units) {
    return error ? (
      <p role="alert" className="notice notice-error">
        {error}
      </p>
    ) : (
      <Loading label="Loading the org tree" />
    );
  }

  return (
    <>
      <PageHeader
        title="Organization structure"
        description="Offices, regions and departments — the tree attendance, tasks and access all scope to."
        action={
          canManage ? (
            <button className="btn-primary" onClick={() => openNewUnitDialog(null)}>
              New root unit
            </button>
          ) : undefined
        }
      />

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      {openUnits.length === 0 ? (
        <EmptyState
          title="No org units yet"
          description="A root unit is seeded automatically for every deployment — if none shows here, ask an administrator to check the deployment."
        />
      ) : (
        <div className="table-flat">
          {openUnits.map((unit) => (
            <div key={unit.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <div className="flex items-center gap-2" style={{ paddingInlineStart: `${unit.depth * 1.5}rem` }}>
                <span className="font-medium text-neutral-900">{unit.name}</span>
                <span className="text-xs text-neutral-900/60">{unit.code}</span>
                <span className="chip">{unit.typeLabel}</span>
              </div>
              {canManage ? (
                <div className="flex shrink-0 gap-3 text-xs">
                  <button
                    className="btn-text"
                    onClick={() => {
                      setRenaming(unit);
                      setRenameValue(unit.name);
                    }}
                  >
                    Rename
                  </button>
                  <button
                    className="btn-text"
                    onClick={() => {
                      setMoving(unit);
                      setMoveTargetId('');
                    }}
                  >
                    Move
                  </button>
                  <button className="btn-text" onClick={() => openNewUnitDialog(unit.id)}>
                    Add child
                  </button>
                  <button className="btn-text text-red-700" onClick={() => setClosing(unit)}>
                    Close
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {closedUnits.length > 0 ? (
        <Disclosure label={`Closed units · ${closedUnits.length}`} className="mt-6">
          <div className="table-flat">
            {closedUnits.map((unit) => (
              <div key={unit.id} className="flex items-center justify-between py-2 text-sm text-neutral-900/60">
                <span>
                  {unit.name} <span className="text-xs">({unit.code})</span>
                </span>
                <span className="text-xs">Closed {unit.closedAt ? new Date(unit.closedAt).toLocaleDateString() : ''}</span>
              </div>
            ))}
          </div>
        </Disclosure>
      ) : null}

      <Dialog open={newOpen} onClose={busy ? () => {} : () => setNewOpen(false)} title={newParentId ? 'Add a child unit' : 'Add a root unit'}>
        <div className="space-y-3">
          <label className="block">
            <span className="field-label">Type</span>
            <select className="field-input w-full" value={newTypeId} onChange={(e) => setNewTypeId(e.target.value)}>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="field-label">Code</span>
            <input className="field-input w-full" value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="north" />
          </label>
          <label className="block">
            <span className="field-label">Name</span>
            <input className="field-input w-full" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="North Region" />
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-secondary" disabled={busy} onClick={() => setNewOpen(false)}>
            Cancel
          </button>
          <button className="btn-primary" disabled={busy || !newCode.trim() || !newName.trim() || !newTypeId} onClick={createUnit}>
            Create
          </button>
        </div>
      </Dialog>

      <Dialog open={renaming !== null} onClose={busy ? () => {} : () => setRenaming(null)} title={`Rename ${renaming?.name ?? ''}`}>
        <input className="field-input w-full" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} />
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-secondary" disabled={busy} onClick={() => setRenaming(null)}>
            Cancel
          </button>
          <button className="btn-primary" disabled={busy || !renameValue.trim()} onClick={rename}>
            Save
          </button>
        </div>
      </Dialog>

      <Dialog open={moving !== null} onClose={busy ? () => {} : () => setMoving(null)} title={`Move ${moving?.name ?? ''}`}>
        <label className="block">
          <span className="field-label">New parent — leave blank to move to root</span>
          <select className="field-input w-full" value={moveTargetId} onChange={(e) => setMoveTargetId(e.target.value)}>
            <option value="">— Root —</option>
            {openUnits
              .filter((u) => u.id !== moving?.id)
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {'—'.repeat(u.depth)} {u.name}
                </option>
              ))}
          </select>
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-secondary" disabled={busy} onClick={() => setMoving(null)}>
            Cancel
          </button>
          <button className="btn-primary" disabled={busy} onClick={move}>
            Move
          </button>
        </div>
      </Dialog>

      <ConfirmDialog
        open={closing !== null}
        onClose={() => setClosing(null)}
        onConfirm={close}
        title={`Close ${closing?.name ?? ''}?`}
        description="Refused if this unit still has open child units or holds any positions — move or close those first. A closed unit is never deleted; attendance, journal lines and completed tasks still reference it."
        confirmLabel="Close"
        variant="danger"
        busy={busy}
      />
    </>
  );
}
