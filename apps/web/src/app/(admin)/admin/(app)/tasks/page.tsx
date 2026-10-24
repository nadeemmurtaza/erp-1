'use client';

import { useEffect, useState } from 'react';
import { adminFetch } from '@/lib/admin-client';
import { formatDate, formatDateTime } from '@newax/shared';
import { PageHeader, EmptyState, Loading, Dialog, Disclosure } from '@/components/ui';
import { StatusBadge } from '@/components/common/status-badge';
import { useAdminSession } from '@/components/admin/session';

type TaskState = 'OPEN' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE' | 'CANCELLED';

interface TaskView {
  id: string;
  reference: string;
  title: string;
  detail: string | null;
  positionId: string;
  positionTitle: string;
  assigneeUserId: string | null;
  state: TaskState;
  priority: number;
  dueAt: string | null;
  createdAt: string;
  allowedTransitions: TaskState[];
}

interface TaskTransitionRow {
  id: string;
  fromState: TaskState | null;
  toState: TaskState;
  byUserId: string | null;
  reason: string | null;
  occurredAt: string;
}

interface TaskStageRow {
  id: string;
  key: string;
  label: string;
  order: number;
}

const NON_TERMINAL: TaskState[] = ['OPEN', 'IN_PROGRESS', 'BLOCKED'];

/**
 * tasks-notifications-support/23-tasks-allotment-tracking.md WO-23.6 — the
 * post queue, and one task detail drawer showing the full TaskTransition
 * history. There is no dedicated Position picker anywhere in this codebase
 * yet, so the queue is looked up by pasting a position id — the same
 * pragmatic pattern `my-attendance`'s own org-unit-id field already uses
 * where no picker exists.
 */
export default function TasksPage() {
  const { can } = useAdminSession();
  const canAssign = can('tasks.assign');
  const canClose = can('tasks.close');
  const canAdmin = can('tasks.admin');

  const [stages, setStages] = useState<TaskStageRow[] | null>(null);
  const [newStageKey, setNewStageKey] = useState('');
  const [newStageLabel, setNewStageLabel] = useState('');

  useEffect(() => {
    if (!canAdmin) return;
    adminFetch<TaskStageRow[]>('/admin/tasks/stages').then(setStages).catch(() => undefined);
  }, [canAdmin]);

  const addStage = async () => {
    if (!newStageKey.trim() || !newStageLabel.trim()) return;
    try {
      await adminFetch('/admin/tasks/stages', { method: 'POST', body: { key: newStageKey.trim(), label: newStageLabel.trim() } });
      setNewStageKey('');
      setNewStageLabel('');
      adminFetch<TaskStageRow[]>('/admin/tasks/stages').then(setStages).catch(() => undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not add this stage');
    }
  };

  const [positionId, setPositionId] = useState('');
  const [tasks, setTasks] = useState<TaskView[] | null>(null);
  const [unclaimedForReports, setUnclaimedForReports] = useState<TaskView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDetail, setNewDetail] = useState('');

  const [selected, setSelected] = useState<TaskView | null>(null);
  const [history, setHistory] = useState<TaskTransitionRow[] | null>(null);

  const load = () => {
    if (!positionId.trim()) {
      setTasks([]);
      setUnclaimedForReports(null);
      return;
    }
    const id = positionId.trim();
    adminFetch<TaskView[]>(`/admin/tasks/post/${encodeURIComponent(id)}`)
      .then(setTasks)
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load this post queue'));
    // WO-23.4 — "surfaced on a named screen to the post's reportsTo": treat
    // the entered post as the manager's own, and show what is unclaimed at
    // every post reporting to it (a leaver's tasks land here, never
    // auto-reassigned).
    adminFetch<TaskView[]>(`/admin/tasks/reports/${encodeURIComponent(id)}/unclaimed`)
      .then(setUnclaimedForReports)
      .catch(() => setUnclaimedForReports(null));
  };

  const openTask = async (task: TaskView) => {
    setSelected(task);
    setHistory(null);
    try {
      const detail = await adminFetch<{ task: TaskView; transitions: TaskTransitionRow[] }>(`/admin/tasks/${task.id}`);
      setSelected(detail.task);
      setHistory(detail.transitions);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load this task');
    }
  };

  const submitCreate = async () => {
    if (!newTitle.trim() || !positionId.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await adminFetch('/admin/tasks', { method: 'POST', body: { title: newTitle, detail: newDetail || undefined, positionId: positionId.trim() } });
      setCreating(false);
      setNewTitle('');
      setNewDetail('');
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create this task');
    } finally {
      setBusy(false);
    }
  };

  const [assigneeInput, setAssigneeInput] = useState('');

  const submitAssign = async (assigneeUserId: string | null) => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await adminFetch(`/admin/tasks/${selected.id}/assign`, { method: 'POST', body: { assigneeUserId } });
      setAssigneeInput('');
      setSelected(null);
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not assign this task');
    } finally {
      setBusy(false);
    }
  };

  const moveTo = async (to: TaskState) => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      if (to === 'DONE' || to === 'CANCELLED') {
        await adminFetch(`/admin/tasks/${selected.id}/close`, { method: 'POST', body: { to } });
      } else {
        await adminFetch(`/admin/tasks/${selected.id}/transition`, { method: 'POST', body: { to } });
      }
      setSelected(null);
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Could not move this task to ${to}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Tasks"
        description="Work assigned to a post — the durable address; a person currently holds it, or nobody does yet."
        action={
          canAssign ? (
            <button className="btn-primary" onClick={() => setCreating(true)} disabled={!positionId.trim()}>
              New task
            </button>
          ) : undefined
        }
      />

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      <label className="mb-4 block max-w-sm">
        <span className="field-label">Post (position id)</span>
        <div className="mt-1 flex gap-2">
          <input
            className="field-input w-full"
            value={positionId}
            onChange={(e) => setPositionId(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load()}
            placeholder="position id"
          />
          <button className="btn-secondary" onClick={load}>
            Load
          </button>
        </div>
      </label>

      {tasks === null ? null : tasks.length === 0 ? (
        <EmptyState
          title={positionId.trim() ? 'No open tasks at this post' : 'Enter a post to see its queue'}
          description={positionId.trim() ? 'Everything here is done, cancelled, or nothing was ever raised.' : undefined}
        />
      ) : (
        <div className="table-flat">
          {tasks.map((task) => (
            <button
              key={task.id}
              className="flex w-full items-center justify-between gap-3 py-2.5 text-left text-sm"
              onClick={() => openTask(task)}
            >
              <div>
                <span className="font-medium text-neutral-900">{task.title}</span>{' '}
                <span className="text-xs text-neutral-900/60">{task.reference}</span>
                {task.assigneeUserId ? null : <span className="chip ml-2">Unclaimed</span>}
              </div>
              <div className="flex items-center gap-3">
                {task.dueAt ? <span className="text-xs tabular-nums text-neutral-900/60">{formatDate(new Date(task.dueAt))}</span> : null}
                <StatusBadge status={task.state} />
              </div>
            </button>
          ))}
        </div>
      )}

      {unclaimedForReports && unclaimedForReports.length > 0 ? (
        <Disclosure label={`Unclaimed at your reports' posts · ${unclaimedForReports.length}`} className="mt-6">
          <p className="mb-2 text-sm text-neutral-900/60">
            Left at the post when a posting ended — nobody was reassigned automatically. Assign one from its detail.
          </p>
          <div className="table-flat">
            {unclaimedForReports.map((task) => (
              <button
                key={task.id}
                className="flex w-full items-center justify-between gap-3 py-2 text-left text-sm"
                onClick={() => openTask(task)}
              >
                <span>
                  {task.title} <span className="text-xs text-neutral-900/60">({task.positionTitle})</span>
                </span>
                <StatusBadge status={task.state} />
              </button>
            ))}
          </div>
        </Disclosure>
      ) : null}

      {canAdmin ? (
        <Disclosure label="Workflow stages" className="mt-6">
          <p className="mb-2 text-sm text-neutral-900/60">
            A stage inside IN_PROGRESS — added here, never a migration. Reordering does not rewrite an already-recorded task&rsquo;s history.
          </p>
          {stages && stages.length > 0 ? (
            <div className="table-flat mb-3">
              {stages.map((stage) => (
                <div key={stage.id} className="flex items-center justify-between py-2 text-sm">
                  <span>{stage.label}</span>
                  <span className="text-xs text-neutral-900/60">{stage.key}</span>
                </div>
              ))}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <input className="field-input" value={newStageKey} onChange={(e) => setNewStageKey(e.target.value)} placeholder="key (e.g. cutting)" />
            <input className="field-input" value={newStageLabel} onChange={(e) => setNewStageLabel(e.target.value)} placeholder="label (e.g. Cutting)" />
            <button className="btn-secondary" disabled={!newStageKey.trim() || !newStageLabel.trim()} onClick={addStage}>
              Add stage
            </button>
          </div>
        </Disclosure>
      ) : null}

      <Dialog open={creating} onClose={busy ? () => {} : () => setCreating(false)} title="New task">
        <label className="block">
          <span className="field-label">Title</span>
          <input className="field-input w-full" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
        </label>
        <label className="mt-3 block">
          <span className="field-label">Detail (optional)</span>
          <input className="field-input w-full" value={newDetail} onChange={(e) => setNewDetail(e.target.value)} />
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-secondary" disabled={busy} onClick={() => setCreating(false)}>
            Cancel
          </button>
          <button className="btn-primary" disabled={busy || !newTitle.trim()} onClick={submitCreate}>
            Create
          </button>
        </div>
      </Dialog>

      <Dialog open={selected !== null} onClose={busy ? () => {} : () => setSelected(null)} title={selected?.title ?? 'Task'}>
        {selected ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <StatusBadge status={selected.state} />
              <span className="text-xs text-neutral-900/60">{selected.reference}</span>
            </div>
            {selected.detail ? <p className="text-sm text-neutral-900/70">{selected.detail}</p> : null}

            {canAssign ? (
              <div>
                <span className="field-label">
                  {selected.assigneeUserId ? `Assigned to ${selected.assigneeUserId}` : 'Unclaimed'}
                </span>
                <div className="mt-1 flex gap-2">
                  <input
                    className="field-input w-full"
                    value={assigneeInput}
                    onChange={(e) => setAssigneeInput(e.target.value)}
                    placeholder="user id to assign"
                  />
                  <button className="btn-secondary" disabled={busy || !assigneeInput.trim()} onClick={() => submitAssign(assigneeInput.trim())}>
                    Assign
                  </button>
                  {selected.assigneeUserId ? (
                    <button className="btn-text" disabled={busy} onClick={() => submitAssign(null)}>
                      Unclaim
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}

            {NON_TERMINAL.filter((s) => selected.allowedTransitions.includes(s)).length > 0 || canClose ? (
              <div className="flex flex-wrap gap-2">
                {NON_TERMINAL.filter((s) => selected.allowedTransitions.includes(s)).map((s) => (
                  <button key={s} className="btn-secondary" disabled={busy || !canAssign} onClick={() => moveTo(s)}>
                    Move to {s.replace('_', ' ')}
                  </button>
                ))}
                {selected.allowedTransitions.includes('DONE') ? (
                  <button className="btn-primary" disabled={busy || !canClose} onClick={() => moveTo('DONE')}>
                    Mark done
                  </button>
                ) : null}
                {selected.allowedTransitions.includes('CANCELLED') ? (
                  <button className="btn-danger" disabled={busy || !canClose} onClick={() => moveTo('CANCELLED')}>
                    Cancel
                  </button>
                ) : null}
              </div>
            ) : null}

            <div>
              <h3 className="eyebrow">History</h3>
              {history === null ? (
                <Loading label="Loading history" />
              ) : (
                <div className="table-flat mt-2">
                  {history.map((t) => (
                    <div key={t.id} className="flex items-center justify-between py-2 text-xs text-neutral-900/70">
                      <span>
                        {t.fromState ?? '—'} → {t.toState}
                        {t.reason ? ` (${t.reason})` : ''}
                      </span>
                      <span className="tabular-nums">{formatDateTime(new Date(t.occurredAt))}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </Dialog>
    </>
  );
}
