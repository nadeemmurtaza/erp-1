'use client';

import { useId, useState, type FormEvent } from 'react';
import { Eye, EyeOff, Lock, Pencil } from 'lucide-react';
import { BRAND } from '@newax/shared';
import type { PermissionKey } from '@/constants/permissions';
import { Badge, Bento, BentoTile, Button, type BentoSize } from '@/components/ui';
import { cn } from '@/utils/cn';

/**
 * A profile board where every tile states who can read it and who can write it,
 * and the board closes over whatever the viewer may not see.
 *
 * The rules are the ones `design.md` already binds (`PRM-2`, `PRM-5`): a tile the
 * viewer cannot read is left out, not blanked, so the grid reflows with no hole
 * and the page never looks as if something is broken; a tile the viewer can read
 * but not change keeps its Edit button, disabled, with the reason written next
 * to it and named by the permission, never "denied"; and the "Your access" tile
 * lists every tile with what this viewer can do to it, including the ones that
 * are hidden, so an absence is explained.
 *
 * Read and write are separate scopes on purpose. Public contact details are read
 * by everyone and written by one role; the legal identifiers are read by staff
 * and written by the same one role. The check that matters is the server's
 * (`PermissionsGuard`); this board only mirrors it, and the keys here are real
 * catalogue entries (`PermissionKey`), not strings.
 *
 * The "view as" switch is the specimen's own device. A real screen has one viewer.
 */

type Viewer = 'public' | 'staff' | 'admin';

const VIEWERS: { key: Viewer; label: string; rank: number }[] = [
  { key: 'public', label: 'Public visitor', rank: 0 },
  { key: 'staff', label: 'Staff', rank: 1 },
  { key: 'admin', label: 'Master admin', rank: 2 },
];

const rankOf = (viewer: Viewer) => VIEWERS.find((v) => v.key === viewer)!.rank;

interface Scope {
  /** The lowest viewer who holds it. */
  min: Viewer;
  who: string;
  /** The catalogue key the server checks, where the scope is a permission. */
  key?: PermissionKey;
}

interface Field {
  key: string;
  label: string;
  value: string;
}

interface ProfileTile {
  id: string;
  title: string;
  size: BentoSize;
  /**
   * The tile whose absence this one widens to cover. Four columns of two-wide and
   * one-wide tiles tile exactly only while a pair stays together; when Legal is
   * hidden its neighbour takes its width, so the row still closes (`PRM-5`).
   */
  widenWhenHidden?: string;
  fields: Field[];
  read: Scope;
  write: Scope;
}

const EVERYONE: Scope = { min: 'public', who: 'Public, all roles' };
const STAFF_READ: Scope = { min: 'staff', who: 'Staff and admin', key: 'organization.view' };
const ADMIN_WRITE: Scope = { min: 'admin', who: 'Master admin', key: 'settings.manage' };

const TILES: ProfileTile[] = [
  {
    id: 'banner',
    title: 'Banner',
    size: 'wide',
    read: EVERYONE,
    write: ADMIN_WRITE,
    fields: [
      { key: 'name', label: 'Company name', value: BRAND.identity.name },
      { key: 'tagline', label: 'Tagline', value: BRAND.identity.tagline },
      { key: 'domain', label: 'Website', value: BRAND.identity.domain },
    ],
  },
  {
    id: 'legal',
    title: 'Legal',
    size: 'sm',
    read: STAFF_READ,
    write: ADMIN_WRITE,
    fields: [
      { key: 'tax', label: `${BRAND.legal.taxLabel} number`, value: BRAND.legal.taxNumber },
      { key: 'reg', label: `${BRAND.legal.registrationLabel} registration`, value: BRAND.legal.registrationNumber },
    ],
  },
  {
    id: 'contact',
    title: 'Contact',
    size: 'sm',
    widenWhenHidden: 'legal',
    read: EVERYONE,
    write: ADMIN_WRITE,
    fields: [
      { key: 'email', label: 'Support email', value: BRAND.contact.email },
      { key: 'phone', label: 'Phone', value: BRAND.contact.phone },
      { key: 'hours', label: 'Hours', value: BRAND.contact.workingHours },
    ],
  },
  {
    id: 'address',
    title: 'Address',
    size: 'wide',
    read: EVERYONE,
    write: ADMIN_WRITE,
    fields: [
      { key: 'street', label: 'Registered address', value: BRAND.contact.address },
      { key: 'city', label: 'City', value: BRAND.contact.city },
      { key: 'country', label: 'Country', value: BRAND.contact.country },
    ],
  },
];

const initialValues = () =>
  Object.fromEntries(TILES.flatMap((t) => t.fields.map((f) => [`${t.id}.${f.key}`, f.value])));

function ScopeChips({ tile }: { tile: ProfileTile }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Badge tone="neutral">
        <Eye aria-hidden="true" className="h-3 w-3" />
        Read: {tile.read.who}
      </Badge>
      <Badge tone="info">
        <Pencil aria-hidden="true" className="h-3 w-3" />
        Write: {tile.write.who}
      </Badge>
    </div>
  );
}

function ProfileTileBody({
  tile,
  values,
  canWrite,
  editing,
  onEdit,
  onSave,
  onCancel,
}: {
  tile: ProfileTile;
  values: Record<string, string>;
  canWrite: boolean;
  editing: boolean;
  onEdit: () => void;
  onSave: (next: Record<string, string>) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const reasonId = `${id}-reason`;
  const [draft, setDraft] = useState<Record<string, string>>({});

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSave(draft);
  };

  return (
    <div className="flex h-full min-w-0 flex-col justify-between gap-4">
      {editing ? (
        <form onSubmit={submit} className="grid gap-3" aria-label={`Edit ${tile.title}`}>
          {tile.fields.map((f) => {
            const name = `${tile.id}.${f.key}`;
            return (
              <div key={f.key}>
                <label htmlFor={`${id}-${f.key}`} className="field-label">
                  {f.label}
                </label>
                <input
                  id={`${id}-${f.key}`}
                  className="field-input"
                  value={draft[name] ?? values[name] ?? ''}
                  onChange={(event) => setDraft((prev) => ({ ...prev, [name]: event.target.value }))}
                />
              </div>
            );
          })}
          <div className="flex flex-wrap gap-2">
            <Button type="submit">Save</Button>
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <dl className="m-0 grid gap-3">
          {tile.fields.map((f) => (
            <div key={f.key} className="min-w-0">
              <dt className="text-xs text-neutral-900/70">{f.label}</dt>
              <dd className="m-0 break-words text-sm font-medium">{values[`${tile.id}.${f.key}`]}</dd>
            </div>
          ))}
        </dl>
      )}

      {editing ? null : (
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <ScopeChips tile={tile} />
            <Button
              variant="secondary"
              disabled={!canWrite}
              aria-describedby={canWrite ? undefined : reasonId}
              onClick={() => {
                setDraft({});
                onEdit();
              }}
            >
              <Pencil aria-hidden="true" className="h-4 w-4" />
              Edit
              <span className="sr-only"> {tile.title}</span>
            </Button>
          </div>
          {canWrite ? null : (
            <p id={reasonId} className="m-0 flex items-start gap-1.5 text-xs text-neutral-900/70">
              <Lock aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0" />
              Editing needs {tile.write.who}
              {tile.write.key ? ` (${tile.write.key})` : ''}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function ScopedBentoSpecimen() {
  const [viewer, setViewer] = useState<Viewer>('staff');
  const [values, setValues] = useState(initialValues);
  const [editing, setEditing] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');

  const rank = rankOf(viewer);
  const canRead = (tile: ProfileTile) => rank >= rankOf(tile.read.min);
  const canWrite = (tile: ProfileTile) => rank >= rankOf(tile.write.min);
  const visible = TILES.filter(canRead);
  const sizeOf = (tile: ProfileTile): BentoSize =>
    tile.widenWhenHidden && !canRead(TILES.find((t) => t.id === tile.widenWhenHidden)!) ? 'wide' : tile.size;

  const choose = (next: Viewer) => {
    setViewer(next);
    setEditing(null);
    setAnnounce('');
  };

  return (
    <div className="mx-auto grid max-w-6xl gap-4">
      <div role="group" aria-label="View the board as" className="flex flex-wrap gap-2">
        {VIEWERS.map((v) => (
          <button
            key={v.key}
            type="button"
            aria-pressed={viewer === v.key}
            onClick={() => choose(v.key)}
            className={cn('chip px-3 py-1.5', viewer === v.key ? 'chip-selected' : 'chip-unselected')}
          >
            {v.label}
          </button>
        ))}
      </div>

      <Bento>
        {visible.map((tile) => (
          <BentoTile key={tile.id} size={sizeOf(tile)} title={tile.title}>
            <ProfileTileBody
              tile={tile}
              values={values}
              canWrite={canWrite(tile)}
              editing={editing === tile.id}
              onEdit={() => setEditing(tile.id)}
              onCancel={() => setEditing(null)}
              onSave={(next) => {
                setValues((prev) => ({ ...prev, ...next }));
                setEditing(null);
                setAnnounce(`${tile.title} saved.`);
              }}
            />
          </BentoTile>
        ))}

        <BentoTile size="wide" tone="quiet" title="Your access">
          <ul className="m-0 grid list-none gap-2 p-0">
            {TILES.map((tile) => {
              const read = canRead(tile);
              const write = canWrite(tile);
              return (
                <li key={tile.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
                  <span className="font-medium">{tile.title}</span>
                  <span className="flex flex-wrap items-center gap-2">
                    {read ? (
                      <Badge tone="success">
                        <Eye aria-hidden="true" className="h-3 w-3" />
                        {write ? 'Read and edit' : 'Read only'}
                      </Badge>
                    ) : (
                      <Badge tone="warning">
                        <EyeOff aria-hidden="true" className="h-3 w-3" />
                        Hidden
                      </Badge>
                    )}
                    {read ? null : (
                      <span className="text-xs text-neutral-900/70">
                        Needs {tile.read.who}
                        {tile.read.key ? ` (${tile.read.key})` : ''}
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </BentoTile>
      </Bento>

      <p role="status" className="sr-only">
        {announce}
      </p>
    </div>
  );
}
