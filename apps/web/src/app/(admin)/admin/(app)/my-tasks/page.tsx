'use client';

import { useEffect, useState } from 'react';
import { adminFetch } from '@/lib/admin-client';
import { formatDate } from '@newax/shared';
import { PageHeader, EmptyState, Loading } from '@/components/ui';
import { StatusBadge } from '@/components/common/status-badge';

interface TaskView {
  id: string;
  reference: string;
  title: string;
  detail: string | null;
  positionTitle: string;
  state: 'OPEN' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE' | 'CANCELLED';
  priority: number;
  dueAt: string | null;
}

/**
 * tasks-notifications-support/23-tasks-allotment-tracking.md WO-23.6 —
 * "my-work list." No permission beyond being signed in (nav-registry.ts's
 * own `my-tasks` entry, the same shape as `my-attendance`): GET
 * /admin/tasks/my is @AuthenticatedOnly.
 */
export default function MyTasksPage() {
  const [tasks, setTasks] = useState<TaskView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminFetch<TaskView[]>('/admin/tasks/my')
      .then(setTasks)
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load your tasks'));
  }, []);

  if (!tasks) {
    return error ? (
      <p role="alert" className="notice notice-error">
        {error}
      </p>
    ) : (
      <Loading label="Loading your tasks" />
    );
  }

  return (
    <>
      <PageHeader title="My tasks" description="Work currently assigned to you." />

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      {tasks.length === 0 ? (
        <EmptyState title="Nothing assigned to you" description="Work you pick up from a post queue will show up here." />
      ) : (
        <div className="table-flat">
          {tasks.map((task) => (
            <div key={task.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <div>
                <span className="font-medium text-neutral-900">{task.title}</span>{' '}
                <span className="text-xs text-neutral-900/60">{task.positionTitle}</span>
              </div>
              <div className="flex items-center gap-3">
                {task.dueAt ? (
                  <span className="text-xs tabular-nums text-neutral-900/60">{formatDate(new Date(task.dueAt))}</span>
                ) : null}
                <StatusBadge status={task.state} />
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
