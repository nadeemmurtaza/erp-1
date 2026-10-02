'use client';

import { useState } from 'react';
import { Badge, Button, DataTable, Disclosure } from '@/components/ui';
import { cn } from '@/utils/cn';
import { ChoiceCards } from './choice-cards';
import { Group } from './foundations';

/**
 * Admin patterns, composed from primitives and nothing else.
 *
 * `docs/implementation/admin-platform/220-admin-ui-gemini-ideas-design-spec.md`
 * plans a dozen admin screens. Each one is a WO of its own; what this file does
 * is prove the system they will be built from already holds them, in both
 * themes and at all seven widths. There is no component here that a screen
 * would import — a pattern that shows up a third time is promoted into `ui/`
 * (`03-components.md`), and until then it is written out from primitives.
 *
 * The frosted overlay and the choice cards come from the same transcript the
 * spec was written from (the "Modern ERP UX Design Blueprint"): its glass
 * overlay, its selectable cards and its live-status dot, re-expressed in this
 * system's tokens rather than its grey, blue and 2xl-radius literals.
 */

type ImportState = 'valid' | 'error' | 'duplicate';

const IMPORT_ROWS: { id: string; name: string; email: string; role: string; state: ImportState; problem?: string }[] = [
  { id: '1', name: 'Amna Khan', email: 'amna@example.com', role: 'Cashier', state: 'valid' },
  { id: '2', name: 'Bilal Ahmed', email: 'bilal@', role: 'Cashier', state: 'error', problem: 'The email is missing its domain. Add one, like name@example.com.' },
  { id: '3', name: 'Chand Bibi', email: 'chand@example.com', role: 'Branch manager', state: 'valid' },
  { id: '4', name: 'Danish Raza', email: 'amna@example.com', role: 'Cashier', state: 'duplicate', problem: 'Amna Khan already uses this email. Change it or drop this row.' },
  { id: '5', name: 'Erum Zafar', email: 'erum@example.com', role: 'Accountant', state: 'valid' },
];

const STATE_TONE = { valid: 'success', error: 'danger', duplicate: 'warning' } as const;
const STATE_LABEL = { valid: 'Valid', error: 'Error', duplicate: 'Duplicate' } as const;

const STAFF = [
  { id: 'a', name: 'Fatima Noor', scope: 'Lahore' },
  { id: 'b', name: 'Ghazi Malik', scope: 'Lahore' },
  { id: 'c', name: 'Hina Shah', scope: 'Karachi' },
];

const VISIBILITY = [
  { key: 'internal', label: 'Internal', hint: 'Only people signed in to the admin.' },
  { key: 'unlisted', label: 'Unlisted', hint: 'Anyone with the link, until you revoke it.' },
  { key: 'public', label: 'Public', hint: 'Listed on the storefront and in search.' },
] as const;

/**
 * Frosted: 85% of the overlay surface over a blur. 85 is the lowest of the
 * steps tried that holds 4.5:1 for primary and secondary text over a flat black
 * and a flat white backdrop in both themes (`theme-contrast.spec.ts`); 70 fails
 * the secondary ramp in dark. Where transparency is switched off in the OS the
 * surface goes solid.
 */
export const FROSTED =
  'bg-overlay/85 shadow-overlay backdrop-blur-md [@media(prefers-reduced-transparency:reduce)]:bg-overlay [@media(prefers-reduced-transparency:reduce)]:backdrop-blur-none';

type CardKey = 'legal' | 'address' | 'contact';

const PROFILE: { key: CardKey; title: string; fields: { label: string; value: string }[] }[] = [
  { key: 'legal', title: 'Legal and tax', fields: [{ label: 'Legal name', value: 'Amna Traders Pvt Ltd' }, { label: 'Tax number', value: '1234567-8' }] },
  { key: 'address', title: 'Address', fields: [{ label: 'Street', value: '12 Mall Road' }, { label: 'City', value: 'Lahore' }] },
  { key: 'contact', title: 'Contact', fields: [{ label: 'Email', value: 'accounts@example.com' }, { label: 'Phone', value: '042 111 000 000' }] },
];

export function AdminPatterns() {
  const [filter, setFilter] = useState<'all' | ImportState>('all');
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set(['a', 'b']));
  const [editing, setEditing] = useState<CardKey | null>('address');
  const [visibility, setVisibility] = useState<(typeof VISIBILITY)[number]['key']>('unlisted');

  const attention = IMPORT_ROWS.filter((r) => r.state !== 'valid').length;
  const ready = IMPORT_ROWS.length - attention;
  const shown = IMPORT_ROWS.filter((r) => filter === 'all' || r.state === filter);

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <>
      <Group
        className="xl:col-span-2"
        title="Review before you commit"
        note="Overview first: the header counts what is ready and what needs attention, errors sort to the top, and each problem is written under the cell it belongs to. Below md every row becomes a card, because each row is read on its own."
      >
        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 p-4">
            <p className="text-sm font-semibold text-neutral-900">
              {ready} ready · {attention} need attention
            </p>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Show rows">
              {(['all', 'error', 'duplicate'] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={filter === key}
                  onClick={() => setFilter(key)}
                  className={cn('chip', filter === key ? 'chip-selected' : 'chip-unselected')}
                >
                  {key === 'all' ? 'All' : `${STATE_LABEL[key]}s`}
                </button>
              ))}
            </div>
          </div>
          <DataTable
            stacked
            rows={[...shown].sort((a, b) => Number(a.state === 'valid') - Number(b.state === 'valid'))}
            rowKey={(row) => row.id}
            emptyLabel="No rows match this filter. Choose All to see every row."
            columns={[
              { header: 'Name', cell: (row) => row.name },
              {
                header: 'Email',
                cell: (row) => (
                  <>
                    <span className={row.state === 'error' ? 'text-feedback-negative' : undefined}>{row.email}</span>
                    {row.problem ? <span className="mt-1 block text-xs text-neutral-900/70">{row.problem}</span> : null}
                  </>
                ),
              },
              { header: 'Role', muted: true, cell: (row) => row.role },
              { header: 'Status', cell: (row) => <Badge tone={STATE_TONE[row.state]}>{STATE_LABEL[row.state]}</Badge> },
            ]}
          />
          <div className="flex flex-wrap items-center justify-between gap-3 p-4">
            <p className="text-sm text-neutral-900/70">Fix or remove {attention} rows to continue.</p>
            <Button disabled>Create {ready} users</Button>
          </div>
        </div>
      </Group>

      <Group
        title="Selection bar"
        note="It appears with the first selection, states the count, and sticks to the bottom of the list while the list is on screen."
      >
        <div className="card p-4">
          <DataTable
            stacked
            rows={STAFF}
            rowKey={(row) => row.id}
            columns={[
              {
                header: 'Name',
                cell: (row) => (
                  <label className="flex items-center gap-3">
                    <input type="checkbox" className="field-check" checked={picked.has(row.id)} onChange={() => toggle(row.id)} />
                    {row.name}
                  </label>
                ),
              },
              { header: 'Branch', muted: true, cell: (row) => row.scope },
            ]}
          />
          {picked.size > 0 ? (
            <div className="sticky bottom-4 z-sticky mx-auto mt-4 flex w-fit max-w-full flex-wrap items-center gap-3 rounded-md bg-overlay px-4 py-3 shadow-overlay motion-safe:animate-slideUp">
              <p className="text-sm font-medium text-neutral-900" role="status">{picked.size} selected</p>
              <Button variant="secondary">Change branch</Button>
              <Button variant="danger">Suspend {picked.size}</Button>
              <button type="button" className="btn-text" onClick={() => setPicked(new Set())}>Clear</button>
            </div>
          ) : null}
        </div>
      </Group>

      <Group
        title="Access preview"
        note="A difference, not a dump: what changes is listed, what does not is one line. A refused combination blocks saving and says how to fix it."
      >
        <div className="card grid gap-4 p-4">
          <div>
            <h4 className="eyebrow">Gains</h4>
            <ul className="mt-2 flex flex-wrap gap-2">
              <li><Badge tone="success">+ View orders</Badge></li>
              <li><Badge tone="success">+ Edit orders</Badge></li>
              <li><Badge tone="success">+ Adjust stock</Badge></li>
            </ul>
          </div>
          <div>
            <h4 className="eyebrow">Loses</h4>
            <ul className="mt-2 flex flex-wrap gap-2">
              <li><Badge tone="danger">− Approve payments</Badge></li>
            </ul>
          </div>
          <Disclosure label="214 unchanged" className="mt-0">
            <p className="text-sm text-neutral-900/70">Everything else stays as it is. Nothing here is removed.</p>
          </Disclosure>
          <p className="notice notice-error">Issuing and approving refunds cannot be held together. Remove one to save.</p>
          <div className="flex justify-end"><Button disabled>Save access</Button></div>
        </div>
      </Group>

      <Group
        title="Access that ends"
        note="Persistent and never dismissed. It turns to warning under an hour, and the count is announced at thresholds, not every second."
      >
        <div className="card grid gap-3 p-4">
          <p role="status" className="notice notice-info">Access ends in 1 d 4 h.</p>
          <p role="status" className="notice notice-warning">Access ends in 42 min. Ask an owner to extend it before then.</p>
        </div>
      </Group>

      <Group
        title="A live count"
        note="The number is a link to the rows behind it. While it recounts it says so; if it cannot count, saving is still possible."
      >
        <div className="card grid gap-4 p-4">
          <div aria-busy="true" className="flex items-center gap-3">
            <div className="skeleton h-5 w-24 rounded" />
            <p className="text-sm text-neutral-900/70">Counting…</p>
          </div>
          <p className="text-sm text-neutral-900">
            ≈ 1,420 accounts · <a href="#patterns" className="underline underline-offset-2">View the list</a>
          </p>
          <p className="notice notice-warning">Count unavailable. You can still save this audience.</p>
        </div>
      </Group>

      <Group
        title="Frosted overlay"
        note="Text over a picture sits on a surface, never on the picture. The surface is 85% opaque with a blur, solid when the OS asks for less transparency. The picture keeps the pointer; only the controls take it back."
      >
        <div className="relative h-56 overflow-hidden rounded-lg bg-gradient-to-br from-accent/40 via-neutral-100 to-neutral-200">
          <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4">
            <p className={cn('pointer-events-auto flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium text-neutral-900', FROSTED)}>
              <span className="relative flex h-2 w-2" aria-hidden="true">
                <span className="absolute inline-flex h-full w-full rounded-full bg-feedback-positive opacity-75 motion-safe:animate-ping" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-feedback-positive" />
              </span>
              Live
            </p>
            <div className={cn('pointer-events-auto flex flex-wrap items-center justify-between gap-3 rounded-md p-4', FROSTED)}>
              <div>
                <p className="text-sm font-semibold text-neutral-900">Embroidered lawn, three piece</p>
                <p className="text-sm tabular-nums text-neutral-900/70">128 in stock</p>
              </div>
              <Button>Reserve</Button>
            </div>
          </div>
        </div>
      </Group>

      <Group
        title="Choice cards"
        note="One choice among a few that need a sentence each. A real radio group underneath, so the arrow keys move between them; the selected card has a ring, a tint and a tick, never colour alone."
      >
        <ChoiceCards
          legend="Who can see this?"
          name="ds-visibility"
          options={VISIBILITY.map((option) => ({ value: option.key, label: option.label, hint: option.hint }))}
          value={visibility}
          onChange={setVisibility}
        />
      </Group>

      <Group
        className="xl:col-span-2"
        title="Profile cards"
        note="One job, several cards, one editable at a time. One column on a phone, two at md, three from xl; beyond that the content is capped and centred, never stretched."
      >
        <div className="mx-auto grid max-w-6xl gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="card flex flex-wrap items-center justify-between gap-3 p-4 md:col-span-2 xl:col-span-3">
            <div>
              <h4 className="text-lg font-semibold text-neutral-900">Amna Traders</h4>
              <p className="text-sm text-neutral-900/70">Legal identity</p>
            </div>
            <Badge tone="success">Verified</Badge>
          </div>
          {PROFILE.map((card) => {
            const open = editing === card.key;
            return (
              <section key={card.key} aria-labelledby={`pc-${card.key}`} className="card p-4">
                <div className="flex items-center justify-between gap-3">
                  <h4 id={`pc-${card.key}`} className="eyebrow">{card.title}</h4>
                  {open ? null : (
                    <button type="button" className="btn-text" onClick={() => setEditing(card.key)}>Edit</button>
                  )}
                </div>
                {open ? (
                  <form
                    className="mt-3 grid gap-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      setEditing(null);
                    }}
                  >
                    {card.fields.map((f) => (
                      <div key={f.label}>
                        <label className="field-label" htmlFor={`pc-${card.key}-${f.label}`}>{f.label}</label>
                        <input id={`pc-${card.key}-${f.label}`} className="field-input" defaultValue={f.value} />
                      </div>
                    ))}
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                      <Button type="submit">Save</Button>
                    </div>
                  </form>
                ) : (
                  <dl className="mt-3 grid gap-2 text-sm">
                    {card.fields.map((f) => (
                      <div key={f.label}>
                        <dt className="text-xs text-neutral-900/60">{f.label}</dt>
                        <dd className="text-neutral-900">{f.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </section>
            );
          })}
        </div>
      </Group>
    </>
  );
}
