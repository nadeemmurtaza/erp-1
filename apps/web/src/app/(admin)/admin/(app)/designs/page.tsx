'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { adminFetch } from '@/lib/admin-client';
import { Badge, Dialog, EmptyState, Loading, PageHeader, Section } from '@/components/ui';
import { ROUTES } from '@/constants/routes';
import { AREAS, areaLabel, type DesignArea } from '@/utils/design-drafts';
import type { AdminStitchingOptionGroup } from '@/types/api';

interface NewGroupDraft {
  key: string;
  labelEn: string;
  labelUr: string;
}

const BLANK_NEW: NewGroupDraft = { key: '', labelEn: '', labelUr: '' };

/**
 * Every style question the stitching flow can ask.
 *
 * A group is one question ("Neckline") and its options are the answers, each
 * with a price difference against the garment's base stitching fee. Groups are
 * scoped to a garment or left open to all of them, so a shalwar kameez and a
 * kurta can share "Finishing" while keeping their own necklines.
 *
 * The picker that used to run down the left of the editor is this page now.
 * Grouping by area is the same, and it matters more here than it did in a
 * 16rem column: the question this page answers is "what does a customer get
 * asked, and in what order", which needs the whole set visible at once.
 *
 * Creating one is a three-field dialog rather than a route. It is a tiny
 * focused task and the interesting work starts immediately afterwards, on the
 * group's own page — which is where this sends you.
 */
export default function AdminDesignsPage() {
  const router = useRouter();
  const [groups, setGroups] = useState<AdminStitchingOptionGroup[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [newGroup, setNewGroup] = useState<NewGroupDraft>(BLANK_NEW);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setGroups(await adminFetch<AdminStitchingOptionGroup[]>('/admin/stitching/option-groups'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load design groups');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createGroup(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    try {
      const created = await adminFetch<AdminStitchingOptionGroup>(
        '/admin/stitching/option-groups',
        {
          method: 'POST',
          body: {
            key: newGroup.key.trim(),
            labelEn: newGroup.labelEn.trim(),
            labelUr: newGroup.labelUr.trim(),
          },
        },
      );

      setCreating(false);
      setNewGroup(BLANK_NEW);
      // Straight to the new group — the options are the point, and an empty
      // question is not useful until it has answers.
      router.push(ROUTES.admin.design(created.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create the design group');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Stitching designs"
        description="The style questions asked during stitching, and what each answer adds to the price."
        action={
          <button type="button" onClick={() => setCreating(true)} className="btn-primary">
            New design group
          </button>
        }
      />

      {error ? (
        <p role="alert" className="mb-6 whitespace-pre-line text-sm text-feedback-negative">
          {error}
        </p>
      ) : null}

      {!groups ? (
        <Loading />
      ) : groups.length === 0 ? (
        <EmptyState
          title="No design groups yet"
          description="A group is one question the stitching flow asks — a neckline, a sleeve length."
        />
      ) : (
        [...AREAS.map((area) => area.value), null].map((area) => {
          const inArea = groups.filter((group) => (group.area ?? null) === area);
          if (inArea.length === 0) return null;

          return (
            <Section key={area ?? 'anywhere'} title={areaLabel(area as DesignArea | null)}>
              <ul className="divide-y divide-neutral-100 border-y border-neutral-100">
                {inArea.map((group) => {
                  const live = group.options.filter((option) => option.isActive).length;
                  return (
                    <li key={group.id} className="flex items-center justify-between gap-4 py-2.5">
                      <span className="min-w-0">
                        <Link
                          href={ROUTES.admin.design(group.id)}
                          className="text-sm font-medium text-neutral-900 hover:text-accent-hover"
                        >
                          {group.labelEn}
                        </Link>
                        <span className="mt-0.5 block text-xs text-neutral-900/60">
                          {live} {live === 1 ? 'option' : 'options'}
                          {group.required ? ' · Required' : ''}
                          {group.selectionType === 'MULTI' ? ' · Several choices' : ''}
                        </span>
                      </span>

                      {group.isActive ? null : <Badge tone="neutral">Retired</Badge>}
                    </li>
                  );
                })}
              </ul>
            </Section>
          );
        })
      )}

      <Dialog
        open={creating}
        onClose={() => setCreating(false)}
        title="New design group"
        footer={
          <>
            <button type="button" onClick={() => setCreating(false)} className="btn-ghost">
              Cancel
            </button>
            <button type="submit" form="new-design-group" disabled={busy} className="btn-primary">
              {busy ? 'Creating…' : 'Create'}
            </button>
          </>
        }
      >
        <form id="new-design-group" onSubmit={createGroup} className="space-y-4">
          <label className="block">
            <span className="field-label">Key</span>
            <input
              value={newGroup.key}
              onChange={(event) => setNewGroup({ ...newGroup, key: event.target.value })}
              className="field-input"
              required
            />
            <span className="mt-1 block text-xs text-neutral-900/60">
              Tidied into snake_case by the server, and fixed afterwards — carts store answers
              against it.
            </span>
          </label>

          <label className="block">
            <span className="field-label">Question (English)</span>
            <input
              value={newGroup.labelEn}
              onChange={(event) => setNewGroup({ ...newGroup, labelEn: event.target.value })}
              className="field-input"
              required
            />
          </label>

          <label className="block" dir="rtl">
            <span className="field-label">سوال (اردو)</span>
            <input
              value={newGroup.labelUr}
              onChange={(event) => setNewGroup({ ...newGroup, labelUr: event.target.value })}
              className="field-input font-urdu"
              required
            />
          </label>
        </form>
      </Dialog>
    </>
  );
}
