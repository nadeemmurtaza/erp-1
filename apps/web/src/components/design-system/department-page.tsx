'use client';

import { useId, useRef, useState } from 'react';
import Link from 'next/link';
import { OctagonAlert } from 'lucide-react';
import { formatDate } from '@newax/shared';
import { ROUTES } from '@/constants/routes';
import { Badge, Button, ConfirmDialog, DataTable, Disclosure, PageHeader, Segmented, Switch } from '@/components/ui';
import {
  closeBlockers,
  departmentErrors,
  descendantIds,
  nearestOffice,
  suggestCode,
  unitPath,
  type DepartmentDraft,
  type DepartmentField,
  type Unit,
} from './department';

/**
 * A record page made of typed field blocks under one header.
 *
 * The header says what this is and holds the page's one action. Beneath it the
 * fields sit in two blocks that answer two questions (what is it, who and where),
 * one column on a phone and two from `md`. Each field says what kind of thing it
 * is, because the kind decides the control: text for a name, text with a rule for
 * a code, a choice from a tree for a parent, a derived fact for what is not the
 * page's to type.
 *
 * Three things the mockup this came from drew as fields are not fields of an
 * org unit here, and the page shows them as what they are (`department.ts`):
 * where it works is derived from where it sits, its head is a post held by a
 * person and is changed on the People screen, and it is closed rather than
 * switched off. Closing is behind a disclosure, with its refusals written in the
 * server's own words, each with the screen that fixes it.
 *
 * Needs `org.structure.view`; saving, moving and closing need
 * `org.structure.manage`. Illustrative data.
 */

const SELF = 'dept';
const UNITS: Unit[] = [
  { id: 'ho', name: 'Head office', parentId: null, office: true },
  { id: 'lhr', name: 'Lahore branch', parentId: 'ho', office: true },
  { id: 'khi', name: 'Karachi branch', parentId: 'ho', office: true },
  { id: 'mux', name: 'Multan branch', parentId: 'ho', office: true, closed: true },
  { id: 'fin', name: 'Finance', parentId: 'lhr', office: false },
  { id: 'hr', name: 'People', parentId: 'lhr', office: false },
  { id: SELF, name: 'Finance operations', parentId: 'lhr', office: false },
];
/** Codes of the other units in the brand. A unit's own code is not "taken" by itself. */
const TAKEN_CODES = ['ho', 'lhr', 'khi', 'mux', 'finance', 'hr'];

const EXISTING: DepartmentDraft = { name: 'Finance operations', code: 'finance-ops', parentId: 'lhr' };
const BLANK: DepartmentDraft = { name: '', code: '', parentId: '' };
const HOLDER = { post: 'Head of Finance operations', name: 'Fatima Noor', since: new Date('2026-03-03T09:00:00Z') };
const CLOSED_ON = new Date('2026-10-01T09:00:00Z');

const FIELD_ROWS = [
  { field: 'Name', stored: 'OrgUnit.name', who: 'org.structure.manage' },
  { field: 'Code', stored: 'OrgUnit.code, unique within the brand', who: 'org.structure.manage' },
  {
    field: 'Parent unit',
    stored: 'OrgUnit.parentId, changed only through OrgUnitService.move()',
    who: 'org.structure.manage',
  },
  { field: 'Works in', stored: 'Not stored. The nearest office above the parent.', who: 'Change the parent' },
  { field: 'Head', stored: 'A Position, held through a Posting', who: 'hr.people.manage' },
  { field: 'Closed', stored: 'OrgUnit.closedAt and isActive, with an audit row', who: 'org.structure.manage' },
];

type Mode = 'edit' | 'new';

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1 flex items-start gap-1.5 text-sm text-feedback-negative">
      <OctagonAlert aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      {message}
    </p>
  );
}

export function DepartmentPageSpecimen() {
  const id = useId();
  const [mode, setMode] = useState<Mode>('edit');
  const [saved, setSaved] = useState<DepartmentDraft>(EXISTING);
  const [draft, setDraft] = useState<DepartmentDraft>(EXISTING);
  const [codeEdited, setCodeEdited] = useState(false);
  const [touched, setTouched] = useState<ReadonlySet<DepartmentField>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [closed, setClosed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [empty, setEmpty] = useState(false);
  const [fresh, setFresh] = useState(false);
  const [announce, setAnnounce] = useState('');
  const refs = {
    name: useRef<HTMLInputElement>(null),
    code: useRef<HTMLInputElement>(null),
    parent: useRef<HTMLSelectElement>(null),
  };

  const creating = mode === 'new';
  const errors = departmentErrors(draft, { takenCodes: TAKEN_CODES, units: UNITS });
  const shown = (field: DepartmentField) => (submitted || touched.has(field) ? errors[field] : undefined);
  const changed = creating || JSON.stringify(draft) !== JSON.stringify(saved);
  const locked = closed;

  const excluded = creating ? [] : descendantIds(UNITS, SELF);
  const parentOptions = UNITS.filter((unit) => !excluded.includes(unit.id))
    .map((unit) => ({ unit, label: unitPath(UNITS, unit.id).join(' › ') }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const office = draft.parentId === '' ? null : nearestOffice(UNITS, draft.parentId);
  const trail = draft.parentId === '' ? [] : unitPath(UNITS, draft.parentId);
  const blockers = closeBlockers(
    empty || fresh ? { openChildren: 0, positions: 0 } : { openChildren: 2, positions: 3 },
  );

  const touch = (field: DepartmentField) => setTouched((prev) => new Set(prev).add(field));

  const rename = (name: string) =>
    setDraft((prev) => ({ ...prev, name, code: creating && !codeEdited ? suggestCode(name) : prev.code }));

  const reset = (next: Mode) => {
    setMode(next);
    const base = next === 'new' ? BLANK : EXISTING;
    setDraft(base);
    setSaved(base);
    setCodeEdited(false);
    setTouched(new Set());
    setSubmitted(false);
    setClosed(false);
    setFresh(false);
    setAnnounce('');
  };

  const save = () => {
    setSubmitted(true);
    const broken = (['name', 'code', 'parent'] as const).filter((field) => errors[field]);
    if (broken.length > 0) {
      refs[broken[0]!].current?.focus();
      setAnnounce(
        `${broken.length} ${broken.length === 1 ? 'thing needs' : 'things need'} fixing before this can be saved.`,
      );
      return;
    }
    setSaved(draft);
    setSubmitted(false);
    setTouched(new Set());
    setAnnounce(creating ? 'Department created.' : 'Department saved.');
    if (creating) {
      setMode('edit');
      setFresh(true);
    }
  };

  const statusText = locked
    ? ''
    : changed
      ? creating
        ? 'A new department. Nothing is saved until you create it.'
        : 'Unsaved changes.'
      : 'All changes saved.';
  const brokenNow = (['name', 'code', 'parent'] as const).filter((field) => submitted && errors[field]);

  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <div>
        <PageHeader
          className="mb-2"
          headingLevel="h4"
          context={
            <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-x-1.5">
              <Link href={ROUTES.admin.orgStructure} className="underline underline-offset-2">
                Org structure
              </Link>
              {trail.map((name) => (
                <span key={name} className="flex items-center gap-1.5">
                  <span aria-hidden="true">›</span>
                  {name}
                </span>
              ))}
            </nav>
          }
          title={
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {draft.name.trim() === '' ? 'New department' : draft.name}
              {creating ? null : closed ? <Badge tone="neutral">Closed</Badge> : <Badge tone="success">Active</Badge>}
            </span>
          }
          description={draft.code === '' ? 'Department' : `Department · code ${draft.code}`}
          action={
            <Button disabled={locked || !changed} aria-describedby={`${id}-status`} onClick={save}>
              {creating ? 'Create department' : 'Save changes'}
            </Button>
          }
        />
        <p id={`${id}-status`} role="status" className="min-h-5 text-sm text-neutral-900/70">
          {statusText}
        </p>
      </div>

      {brokenNow.length > 0 ? (
        <div role="alert" className="notice notice-error grid gap-1">
          <p className="font-medium">Fix {brokenNow.length === 1 ? 'this' : 'these'} to continue:</p>
          <ul className="m-0 list-disc ps-5">
            {brokenNow.map((field) => (
              <li key={field}>{errors[field]}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {closed ? (
        <p role="status" className="notice notice-info">
          Closed on {formatDate(CLOSED_ON)}. It stays in the org chart with its history.{' '}
          <Link href={ROUTES.admin.orgStructure} className="underline underline-offset-2">
            Back to the org chart
          </Link>
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <section aria-labelledby={`${id}-core`} className="card grid min-w-0 content-start gap-4 p-5">
          <h4 id={`${id}-core`} className="eyebrow">
            Core details
          </h4>

          <div>
            <label className="field-label" htmlFor={`${id}-name`}>
              Name
            </label>
            <input
              id={`${id}-name`}
              ref={refs.name}
              className="field-input"
              value={draft.name}
              disabled={locked}
              aria-invalid={Boolean(shown('name'))}
              aria-describedby={shown('name') ? `${id}-name-err` : undefined}
              onChange={(event) => rename(event.target.value)}
              onBlur={() => touch('name')}
            />
            <FieldError id={`${id}-name-err`} message={shown('name')} />
          </div>

          <div>
            <label className="field-label" htmlFor={`${id}-code`}>
              Code
            </label>
            <input
              id={`${id}-code`}
              ref={refs.code}
              className="field-input font-mono"
              value={draft.code}
              disabled={locked}
              spellCheck={false}
              autoCapitalize="none"
              aria-invalid={Boolean(shown('code'))}
              aria-describedby={`${id}-code-hint${shown('code') ? ` ${id}-code-err` : ''}`}
              onChange={(event) => {
                setCodeEdited(true);
                setDraft((prev) => ({ ...prev, code: event.target.value }));
              }}
              onBlur={() => touch('code')}
            />
            <p id={`${id}-code-hint`} className="mt-1 text-sm text-neutral-900/70">
              {creating
                ? 'Suggested from the name until you edit it. Imports and links use it.'
                : 'Imports and links use it. Changing it breaks any import that names the old one.'}
            </p>
            <FieldError id={`${id}-code-err`} message={shown('code')} />
          </div>

          <div>
            <label className="field-label" htmlFor={`${id}-parent`}>
              Parent unit
            </label>
            <select
              id={`${id}-parent`}
              ref={refs.parent}
              className="field-input"
              value={draft.parentId}
              disabled={locked}
              aria-invalid={Boolean(shown('parent'))}
              aria-describedby={shown('parent') ? `${id}-parent-err` : undefined}
              onChange={(event) => setDraft((prev) => ({ ...prev, parentId: event.target.value }))}
              onBlur={() => touch('parent')}
            >
              {draft.parentId === '' ? <option value="">Choose where it sits…</option> : null}
              {parentOptions.map(({ unit, label }) => (
                <option key={unit.id} value={unit.id} disabled={unit.closed}>
                  {label}
                  {unit.closed ? ' (closed)' : ''}
                </option>
              ))}
            </select>
            <FieldError id={`${id}-parent-err`} message={shown('parent')} />
            <p className="mt-1 text-sm">
              <Link href={ROUTES.admin.orgStructure} className="underline underline-offset-2">
                Open the org chart
              </Link>
            </p>
          </div>
        </section>

        <section aria-labelledby={`${id}-lead`} className="card grid min-w-0 content-start gap-4 p-5">
          <h4 id={`${id}-lead`} className="eyebrow">
            Leadership and reach
          </h4>

          <div>
            <p className="field-label">Head</p>
            {creating ? (
              <p className="text-sm text-neutral-900/70">
                Leadership is a post, not a field. Create the department first, then add its head post on the People
                screen.
              </p>
            ) : (
              <>
                <p className="text-sm font-medium text-neutral-900">{HOLDER.name}</p>
                <p className="text-sm text-neutral-900/70">
                  {HOLDER.post}, since {formatDate(HOLDER.since)}
                </p>
                <p className="mt-1 text-sm text-neutral-900/70">
                  The reporting line lives on the post, so it survives a leaver.{' '}
                  <Link href={ROUTES.admin.people} className="underline underline-offset-2">
                    Change who holds it
                  </Link>
                </p>
              </>
            )}
          </div>

          <div>
            <p className="field-label">Works in</p>
            {office ? (
              <p className="inline-flex rounded bg-neutral-100 px-3 py-1 text-sm font-medium text-neutral-900">
                {office.name}
              </p>
            ) : (
              <p className="text-sm text-neutral-900/70">Choose a parent unit to see where it works.</p>
            )}
            <p className="mt-1 text-sm text-neutral-900/70">
              Set by where the department sits, so it cannot disagree with the org chart. Move it to change this.
            </p>
          </div>
        </section>
      </div>

      {creating ? null : (
        <Disclosure label="Close this department" className="mt-0">
          <div className="grid gap-3">
            <p className="max-w-prose text-sm text-neutral-900/70">
              Closing keeps its history: attendance, postings and journal lines that name it still read correctly. A
              closed unit cannot receive a new unit or be moved.
            </p>
            {blockers.length > 0 ? (
              <ul id={`${id}-blockers`} className="notice notice-warning m-0 grid list-none gap-2">
                {blockers.map((blocker) => (
                  <li key={blocker.fix}>
                    {blocker.message}{' '}
                    <Link
                      href={blocker.fix === 'units' ? ROUTES.admin.orgStructure : ROUTES.admin.people}
                      className="underline underline-offset-2"
                    >
                      {blocker.fix === 'units' ? 'Open the org chart' : 'Open People'}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
            <div>
              <Button
                variant="danger"
                disabled={blockers.length > 0 || closed}
                aria-describedby={blockers.length > 0 ? `${id}-blockers` : undefined}
                onClick={() => setConfirming(true)}
              >
                {closed ? 'Closed' : 'Close department'}
              </Button>
            </div>
          </div>
        </Disclosure>
      )}

      <Disclosure label="Where each field is stored" className="mt-0">
        <DataTable
          stacked
          rows={FIELD_ROWS}
          rowKey={(row) => row.field}
          columns={[
            { header: 'Field', cell: (row) => row.field },
            { header: 'Stored in', cell: (row) => <code className="text-xs">{row.stored}</code> },
            { header: 'Changed by', muted: true, cell: (row) => row.who },
          ]}
        />
      </Disclosure>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-neutral-100 pt-4">
        <p className="eyebrow">Specimen controls</p>
        <Segmented
          kind="choice"
          label="Show the page for"
          value={mode}
          onChange={reset}
          options={[
            { value: 'edit', label: 'An existing department' },
            { value: 'new', label: 'A new one' },
          ]}
          className="flex-wrap"
        />
        <Switch label="Pretend it is empty" checked={empty} onChange={setEmpty} className="w-60 max-w-full" />
      </div>

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => {
          setClosed(true);
          setConfirming(false);
          setAnnounce(`${saved.name} closed.`);
        }}
        title={`Close ${saved.name}?`}
        description="It has no open units and no positions. It stays in the org chart as closed, with its history, and can no longer receive a new unit or be moved."
        confirmLabel="Close department"
        variant="danger"
      />

      <p role="status" className="sr-only">
        {announce}
      </p>
    </div>
  );
}
