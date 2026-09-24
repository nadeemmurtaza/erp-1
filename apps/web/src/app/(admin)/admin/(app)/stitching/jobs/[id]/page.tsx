'use client';

import Link from 'next/link';
import { use, useCallback, useEffect, useState } from 'react';
import { formatDate, formatDateTime, nextStage, previousStage } from '@newax/shared';
import { adminFetch } from '@/lib/admin-client';
import { useAdminSession } from '@/components/admin/session';
import {
  fieldLabel,
  jobCustomer,
  measurementValues,
  STAGE_LABELS,
  type StitchingJob,
  type Workload,
} from '@/types/stitching';
import { StageBadge } from '@/components/admin/stage-badge';
import { ROUTES } from '@/constants/routes';
import { Loading } from '@/components/ui';

/**
 * One job: the tailor's worksheet.
 *
 * The stage buttons offer only the two stages the API will accept — the next
 * one, and the previous one for a rework. Anything else is not a button the
 * tailor should have to discover is refused.
 */
export default function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [job, setJob] = useState<StitchingJob | null>(null);
  const [tailors, setTailors] = useState<Workload['tailors']>([]);
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { can } = useAdminSession();
  const canAssign = can('stitching.jobs.assign');

  const load = useCallback(async () => {
    setError(null);
    try {
      setJob(await adminFetch<StitchingJob>(`/admin/stitching/jobs/${id}`));
      if (canAssign) {
        const workload = await adminFetch<Workload>('/admin/stitching/jobs/workload');
        setTailors(workload.tailors);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the job');
    }
  }, [id, canAssign]);

  useEffect(() => {
    void load();
  }, [load]);

  async function move(toStage: string, isRework: boolean) {
    if (isRework && !note.trim()) {
      setError('Say why the job is going back a stage.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      // Multipart whenever there is a photograph, plain JSON otherwise — the
      // controller accepts both.
      if (photo) {
        const form = new FormData();
        form.append('stage', toStage);
        if (note.trim()) form.append('note', note.trim());
        form.append('photo', photo);
        await adminFetch(`/admin/stitching/jobs/${id}/stage`, { method: 'POST', formData: form });
      } else {
        await adminFetch(`/admin/stitching/jobs/${id}/stage`, {
          method: 'POST',
          body: { stage: toStage, note: note.trim() || undefined },
        });
      }

      setNote('');
      setPhoto(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not move the job');
    } finally {
      setBusy(false);
    }
  }

  async function assign(tailorId: string) {
    setBusy(true);
    setError(null);
    try {
      await adminFetch(`/admin/stitching/jobs/${id}/assign`, {
        method: 'POST',
        body: { tailorId: tailorId || null },
      });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not assign the job');
    } finally {
      setBusy(false);
    }
  }

  if (!job) {
    return (
      <>
        {error ? (
          <p role="alert" className="notice notice-error">
            {error}
          </p>
        ) : (
          <Loading />
        )}
      </>
    );
  }

  const customer = jobCustomer(job);
  const forward = nextStage(job.stage);
  const back = previousStage(job.stage);
  const measurements = measurementValues(job.measurementSnapshot);

  return (
    <>
      <Link href={ROUTES.admin.stitching} className="text-sm text-accent-hover hover:underline">
        ← Back to the queue
      </Link>

      <div className="mb-6 mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold text-neutral-900">{job.number}</h1>
        <StageBadge stage={job.stage} />
        <span className="text-sm text-neutral-900/60">
          {job.garmentType.labelEn} · {customer.name} · {customer.reference}
        </span>
      </div>

      {error ? (
        <p role="alert" className="notice notice-error mb-4 whitespace-pre-line">
          {error}
        </p>
      ) : null}

      <div className="grid gap-6 fold:grid-cols-2 lg:grid-cols-3">
        <section className="card min-w-0 p-4 lg:col-span-1">
          <h2 className="mb-3 text-sm font-semibold text-neutral-900">Measurements</h2>
          {measurements.length === 0 ? (
            <p className="text-sm text-neutral-900/60">No measurements were recorded.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-neutral-100">
                  {measurements.map(([key, value]) => (
                    <tr key={key}>
                      <th scope="row" className="py-1.5 text-start font-normal text-neutral-900/60">
                        {fieldLabel(key)}
                      </th>
                      <td className="py-1.5 text-end tabular-nums text-neutral-900">{value}&quot;</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {job.optionsSnapshot?.length ? (
            <>
              <h3 className="mb-2 mt-4 text-sm font-semibold text-neutral-900">Style</h3>
              <ul className="space-y-1 text-sm text-neutral-900/70">
                {job.optionsSnapshot.map((option, index) => (
                  <li key={index}>
                    {option.groupLabelEn ? `${option.groupLabelEn}: ` : ''}
                    {option.labelEn}
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {job.instructions ? (
            <>
              <h3 className="mb-1 mt-4 text-sm font-semibold text-neutral-900">Instructions</h3>
              <p className="text-sm text-neutral-900/70">{job.instructions}</p>
            </>
          ) : null}

          <dl className="mt-4 space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-neutral-900/60">Due</dt>
              <dd className="text-neutral-900/80">
                {job.dueAt ? formatDate(job.dueAt) : '—'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-neutral-900/60">Tailor</dt>
              <dd className="text-neutral-900/80">
                {job.assignedTailor?.firstName ?? 'Unassigned'}
              </dd>
            </div>
          </dl>

          {canAssign ? (
            <label className="mt-4 block text-sm">
              <span className="mb-1 block text-neutral-900/60">Assign to</span>
              <select
                className="field-input"
                value={job.assignedTailorId ?? ''}
                disabled={busy}
                onChange={(event) => void assign(event.target.value)}
              >
                <option value="">Unassigned</option>
                {tailors.map((tailor) => (
                  <option key={tailor.id} value={tailor.id}>
                    {tailor.name} ({tailor.openJobs} open)
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </section>

        <section className="card min-w-0 p-4 lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-neutral-900">Move this job on</h2>

          <label className="block text-sm">
            <span className="mb-1 block text-neutral-900/60">
              Note {back ? '(required when sending the job back)' : '(optional)'}
            </span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={2}
              className="field-input"
              placeholder="What changed, or what needs redoing"
            />
          </label>

          <label className="mt-3 block text-sm">
            <span className="mb-1 block text-neutral-900/60">Photograph (optional)</span>
            <input
              type="file"
              accept="image/*"
              onChange={(event) => setPhoto(event.target.files?.[0] ?? null)}
              className="block w-full max-w-full text-sm text-neutral-900/70"
            />
          </label>

          <div className="mt-4 flex flex-wrap gap-2">
            {forward ? (
              <button
                type="button"
                className="btn-primary"
                disabled={busy}
                onClick={() => void move(forward, false)}
              >
                Move to {STAGE_LABELS[forward].toLowerCase()}
              </button>
            ) : null}
            {back ? (
              <button
                type="button"
                className="btn-ghost text-red-700"
                disabled={busy || !note.trim()}
                onClick={() => void move(back, true)}
              >
                Send back to {STAGE_LABELS[back].toLowerCase()}
              </button>
            ) : null}
            {!forward && !back ? (
              <p className="text-sm text-neutral-900/60">This job is finished.</p>
            ) : null}
          </div>

          <h2 className="mb-3 mt-8 text-sm font-semibold text-neutral-900">History</h2>
          <ol className="space-y-3">
            {job.events.map((event) => (
              <li key={event.id} className="border-s-2 border-neutral-100 ps-3 text-sm">
                <p className="text-neutral-900">
                  {event.fromStage ? `${STAGE_LABELS[event.fromStage]} → ` : ''}
                  {STAGE_LABELS[event.toStage]}
                  <span className="ms-2 text-xs text-neutral-900/60">
                    {formatDateTime(event.createdAt)}
                  </span>
                </p>
                {event.note ? <p className="text-neutral-900/60">{event.note}</p> : null}
                {event.actor?.firstName ? (
                  <p className="text-xs text-neutral-900/60">by {event.actor.firstName}</p>
                ) : null}
                {event.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={event.photoUrl}
                    alt={`${STAGE_LABELS[event.toStage]} photograph`}
                    className="mt-2 max-h-40 rounded border border-neutral-100"
                  />
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      </div>
    </>
  );
}
