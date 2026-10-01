'use client';

import { useId, useState, type FormEvent, type ReactNode } from 'react';
import Image from 'next/image';
import { CircleCheck, Eye, EyeOff, Lock, MapPin, Pencil } from 'lucide-react';
import { BRAND } from '@newax/shared';
import type { PermissionKey } from '@/constants/permissions';
import { Badge, Bento, BentoTile, Button, Disclosure, type BentoSize } from '@/components/ui';
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
 * Two more things come from the architecture drawing this board was refined
 * against. A tile may open with a lead: the identity tile leads with the logo and
 * the master state (Active), the address tile with a media slot. A slot reserves
 * its size, so a missing or late picture moves nothing, and it has a designed
 * state for having no picture (the location has no source here, and says so
 * instead of drawing a fake map). And the grid map under the board writes the
 * layout out as columns, following the viewer: the row closing over a hidden tile
 * can be read off it.
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
  /** Shown in the tile's lead instead of the list; still edited with the rest. */
  inHeader?: boolean;
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
  /** What opens the tile before its fields. */
  lead?: (values: Record<string, string>) => ReactNode;
  /** Put the lead beside the fields from `sm`, instead of above them. */
  leadAside?: boolean;
}

const EVERYONE: Scope = { min: 'public', who: 'Public, all roles' };
const STAFF_READ: Scope = { min: 'staff', who: 'Staff and admin', key: 'organization.view' };
const ADMIN_WRITE: Scope = { min: 'admin', who: 'Master admin', key: 'settings.manage' };

const TILES: ProfileTile[] = [
  {
    id: 'identity',
    title: 'Identity',
    size: 'wide',
    read: EVERYONE,
    write: ADMIN_WRITE,
    lead: (values) => <IdentityLead name={values['identity.name'] ?? ''} />,
    fields: [
      { key: 'name', label: 'Company name', value: BRAND.identity.name, inHeader: true },
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
    lead: () => <LocationSlot />,
    leadAside: true,
    fields: [
      { key: 'street', label: 'Registered address', value: BRAND.contact.address },
      { key: 'city', label: 'City', value: BRAND.contact.city },
      { key: 'country', label: 'Country', value: BRAND.contact.country },
    ],
  },
];

const initialValues = () =>
  Object.fromEntries(TILES.flatMap((t) => t.fields.map((f) => [`${t.id}.${f.key}`, f.value])));

const monogram = (name: string) =>
  name
    .split(/\s+/)
    .map((word) => word[0])
    .filter((letter) => letter && /[\p{L}\p{N}]/u.test(letter))
    .slice(0, 2)
    .join('')
    .toUpperCase();

/**
 * The logo, in a box of its own size. If the file is missing the box shows the
 * name's initials instead, so the tile never collapses or shows a broken image.
 * The picture is decorative (`alt=""`) because the company name sits beside it.
 */
function LogoSlot({ name }: { name: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md bg-neutral-100">
      {failed ? (
        <span
          aria-hidden="true"
          className="grid h-full w-full place-items-center text-lg font-semibold text-neutral-900"
        >
          {monogram(name)}
        </span>
      ) : (
        <Image
          src={BRAND.assets.logoRaster}
          alt=""
          width={56}
          height={56}
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      )}
    </div>
  );
}

/** The master state of the profile, with the logo and the name: what this board is about, before any field. */
function IdentityLead({ name }: { name: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <LogoSlot name={name} />
      <div className="min-w-0">
        <p className="break-words text-lg font-semibold leading-tight text-neutral-900">{name}</p>
        <Badge tone="success" className="mt-1">
          <CircleCheck aria-hidden="true" className="h-3 w-3" />
          Active
        </Badge>
      </div>
    </div>
  );
}

/**
 * The slot for a map preview. No static-map source exists in this deployment, so
 * the slot shows that, in words, at the size a map would take. When a source is
 * added the picture replaces the contents and nothing around it moves.
 */
function LocationSlot() {
  return (
    <div className="grid h-24 place-items-center rounded-md bg-neutral-100 text-neutral-900/70 sm:h-full sm:min-h-24">
      <span className="flex flex-col items-center gap-1 text-xs">
        <MapPin aria-hidden="true" className="h-5 w-5" />
        No map preview
      </span>
    </div>
  );
}

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
        <div className={cn('grid min-w-0 gap-4', tile.lead && tile.leadAside && 'sm:grid-cols-[8rem_minmax(0,1fr)]')}>
          {tile.lead?.(values)}
          <dl className="m-0 grid gap-3">
            {tile.fields
              .filter((f) => !f.inHeader)
              .map((f) => (
                <div key={f.key} className="min-w-0">
                  <dt className="text-xs text-neutral-900/70">{f.label}</dt>
                  <dd className="m-0 break-words text-sm font-medium">{values[`${tile.id}.${f.key}`]}</dd>
                </div>
              ))}
          </dl>
        </div>
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

interface MapBlock {
  id: string;
  title: string;
  span: 1 | 2;
  /** Omitted for the access tile, which is neither read nor written. */
  write?: boolean;
}

/**
 * The board as columns. It shows what the grid is doing, not a second copy of the
 * content: each block is a tile, as wide as the columns it takes, with an icon for
 * what this viewer can do to it (in words for a screen reader).
 */
function GridMap({ blocks, hidden }: { blocks: MapBlock[]; hidden: ProfileTile[] }) {
  return (
    <div className="grid gap-3">
      <p className="max-w-prose text-sm text-neutral-900/70">
        Four columns from xl, two from md, one below. A tile the viewer cannot read is left out and its neighbour
        widens, so the row still closes.
      </p>
      <ol
        aria-label="Tiles and the columns they take"
        className="m-0 grid list-none grid-flow-dense grid-cols-4 gap-2 p-0"
      >
        {blocks.map((block) => (
          <li
            key={block.id}
            className={cn(
              'flex min-h-14 min-w-0 flex-col justify-between gap-1 rounded-md bg-neutral-100 p-2',
              block.span === 2 ? 'col-span-2' : 'col-span-1',
            )}
          >
            <span className="truncate text-xs font-medium text-neutral-900">{block.title}</span>
            <span className="flex items-center justify-between gap-1 text-2xs tabular-nums text-neutral-900/70">
              {block.span} of 4
              {block.write === undefined ? null : (
                <span className="flex items-center gap-1">
                  <Eye aria-hidden="true" className="h-3 w-3" />
                  <span className="sr-only">Can read.</span>
                  {block.write ? (
                    <>
                      <Pencil aria-hidden="true" className="h-3 w-3" />
                      <span className="sr-only">Can edit.</span>
                    </>
                  ) : null}
                </span>
              )}
            </span>
          </li>
        ))}
      </ol>
      {hidden.length > 0 ? (
        <p className="text-sm text-neutral-900/70">
          Left out for this viewer:{' '}
          {hidden
            .map((tile) => `${tile.title} (needs ${tile.read.who}${tile.read.key ? `, ${tile.read.key}` : ''})`)
            .join('; ')}
          .
        </p>
      ) : null}
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

      <Disclosure label="Grid map" className="mt-0">
        <GridMap
          blocks={[
            ...visible.map((tile) => ({
              id: tile.id,
              title: tile.title,
              span: (sizeOf(tile) === 'wide' ? 2 : 1) as 1 | 2,
              write: canWrite(tile),
            })),
            { id: 'access', title: 'Your access', span: 2 },
          ]}
          hidden={TILES.filter((tile) => !canRead(tile))}
        />
      </Disclosure>

      <p role="status" className="sr-only">
        {announce}
      </p>
    </div>
  );
}
