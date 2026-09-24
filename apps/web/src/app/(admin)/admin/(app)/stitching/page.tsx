'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { cn } from '@/utils/cn';
import { STITCHING_STAGES, formatDate, type StitchingStage } from '@newax/shared';
import { adminFetch } from '@/lib/admin-client';
import { ROUTES } from '@/constants/routes';
import { StageBadge } from '@/components/admin/stage-badge';
import { DataTable, FilterBar, useFilterParam, useSetFilterParam } from '@/components/ui';
import { useAdminSession } from '@/components/admin/session';
import {
  jobCustomer,
  STAGE_LABELS,
  type StitchingJob,
  type Workload,
} from '@/types/stitching';

/**
 * The tailor queue.
 *
 * One list for every job, whether it arrived with fabric the shop sold or with
 * cloth the customer sent in. Sorted by the API oldest-due-first, because this
 * is a to-do list rather than a log.
 */
export default function TailorQueuePage() {
  const [jobs, setJobs] = useState<StitchingJob[] | null>(null);
  const [workload, setWorkload] = useState<Workload | null>(null);
  const stage = useFilterParam('stage') as StitchingStage | '';
  const setStage = useSetFilterParam('stage');
  const tailorId = useFilterParam('tailorId');
  const mine = useFilterParam('mine') === 'true';
  const overdue = useFilterParam('overdue') === 'true';
  const [error, setError] = useState<string | null>(null);

  const { can } = useAdminSession();
  const canManageAssignments = can('stitching.jobs.assign');

  const load = useCallback(async () => {
    setError(null);
    try {
      const [queue, load_] = await Promise.all([
        adminFetch<StitchingJob[]>('/admin/stitching/jobs', {
          query: {
            stage: stage || undefined,
            tailorId: tailorId || undefined,
            mine: mine ? 'true' : undefined,
            overdue: overdue ? 'true' : undefined,
          },
        }),
        adminFetch<Workload>('/admin/stitching/jobs/workload'),
      ]);
      setJobs(queue);
      setWorkload(load_);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the queue');
    }
  }, [stage, tailorId, mine, overdue]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-1 text-xl font-semibold text-neutral-900">Tailor queue</h1>
          <p className="text-sm text-neutral-900/60">
            Every garment in the workshop, soonest due first. A job moves one stage at a
            time; sending one back needs a reason.
          </p>
        </div>
        <Link href={ROUTES.admin.workshopInsights} className="btn-secondary">
          Insights
        </Link>
      </div>

      {workload ? (
        <div className="mb-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {workload.byStage.map((entry) => (
            <button
              key={entry.stage}
              type="button"
              onClick={() => setStage(stage === entry.stage ? null : entry.stage)}
              aria-pressed={stage === entry.stage}
              className={cn(
                'card p-3 text-start transition',
                stage === entry.stage ? 'ring-2 ring-accent' : 'hover:bg-neutral-50',
              )}
            >
              <p className="text-xs uppercase tracking-wide text-neutral-900/60">
                {STAGE_LABELS[entry.stage]}
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-neutral-900">
                {entry.count}
              </p>
            </button>
          ))}
        </div>
      ) : null}

      <FilterBar
        filters={[
          {
            key: 'stage',
            type: 'select',
            placeholder: 'All stages',
            options: STITCHING_STAGES.map((option) => ({
              value: option,
              label: STAGE_LABELS[option],
            })),
          },
          ...(canManageAssignments
            ? [
                {
                  key: 'tailorId',
                  type: 'select' as const,
                  placeholder: 'Any tailor',
                  options: (workload?.tailors ?? []).map((tailor) => ({
                    value: tailor.id,
                    label: `${tailor.name} (${tailor.openJobs} open)`,
                  })),
                },
              ]
            : []),
          { key: 'mine', type: 'toggle', label: 'Only mine' },
          { key: 'overdue', type: 'toggle', label: 'Overdue only' },
        ]}
        trailing={
          workload && canManageAssignments ? (
            <span className="ms-auto text-sm text-neutral-900/60">
              {workload.unassigned} unassigned
            </span>
          ) : null
        }
      />

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      <div className="overflow-hidden">
        <DataTable
          rows={jobs}
          loading={!jobs}
          emptyLabel="Nothing in the queue matches those filters."
          rowKey={(job) => job.id}
          columns={[
            {
              header: 'Job',
              cell: (job) => (
                <Link
                  href={`/admin/stitching/jobs/${job.id}`}
                  className="font-medium text-neutral-900 hover:text-accent-hover"
                >
                  {job.number}
                </Link>
              ),
            },
            {
              header: 'Garment',
              muted: true,
              cell: (job) => job.garmentType.labelEn,
            },
            {
              header: 'Customer',
              cell: (job) => {
                const customer = jobCustomer(job);
                return (
                  <>
                    <p className="text-neutral-900">{customer.name}</p>
                    <p className="text-xs text-neutral-900/60">{customer.reference}</p>
                  </>
                );
              },
            },
            {
              header: 'Stage',
              cell: (job) => <StageBadge stage={job.stage} />,
            },
            {
              header: 'Due',
              muted: true,
              cell: (job) => (
                <>
                  {job.dueAt ? formatDate(job.dueAt) : '—'}
                  {isOverdue(job) ? (
                    // Marked with a word as well as a colour: colour alone
                    // is not a label.
                    <span className="ms-2 rounded bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-700">
                      ⚠ Overdue
                    </span>
                  ) : null}
                </>
              ),
            },
            {
              header: 'Tailor',
              muted: true,
              cell: (job) => (job.assignedTailor ? (job.assignedTailor.firstName ?? 'Assigned') : '—'),
            },
          ]}
        />
      </div>

      {workload && workload.tailors.length > 0 && canManageAssignments ? (
        <section className="card mt-6 p-4">
          <h2 className="mb-3 text-sm font-semibold text-neutral-900">Tailor load</h2>
          <ul className="space-y-2">
            {workload.tailors.map((tailor) => (
              <li key={tailor.id} className="flex items-center gap-3 text-sm">
                <span className="w-20 shrink-0 truncate xs:w-40 text-neutral-900/80">{tailor.name}</span>
                <span className="h-2 flex-1 overflow-hidden rounded bg-white">
                  <span
                    className="block h-full rounded bg-accent"
                    style={{
                      width: `${Math.min(
                        100,
                        tailor.capacityPerWeek > 0
                          ? (tailor.openJobs / tailor.capacityPerWeek) * 100
                          : 0,
                      )}%`,
                    }}
                  />
                </span>
                <span className="w-14 shrink-0 text-end tabular-nums text-neutral-900/60 xs:w-28">
                  {tailor.openJobs} / {tailor.capacityPerWeek}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

function isOverdue(job: StitchingJob): boolean {
  if (!job.dueAt) return false;
  if (job.stage === 'READY' || job.stage === 'DISPATCHED') return false;
  return new Date(job.dueAt).getTime() < Date.now();
}
