import Link from 'next/link';
import { Badge } from '@/components/ui';
import { LAUNCHPAD_ICONS } from './app-icons';
import { entryPreview, type LaunchpadTileData } from './launchpad';

/**
 * One app on the launchpad. The whole tile is the link to the app's front door
 * (its first reachable entry), so there is one target to hit, 44 px or taller
 * at every width. The preview line is a hint of what is inside, never a menu:
 * the full list lives in the sidebar, one level down (`HIE-1`, Law 7).
 */
export function AppTile({ tile }: { tile: LaunchpadTileData }) {
  const { app, entries } = tile;
  const Icon = LAUNCHPAD_ICONS[app.iconKey];
  const front = entries[0]!;

  return (
    <Link
      href={front.href}
      data-reveal-item=""
      className="card lift flex min-h-touch min-w-0 flex-col gap-3 p-5 focus-frame"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-neutral-100 text-neutral-900">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        {app.stage === 'BETA' ? <Badge tone="info">Beta</Badge> : null}
      </div>
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-neutral-900">{app.label}</h2>
        <p className="mt-1 text-sm text-neutral-900/70">{app.description}</p>
      </div>
      <p className="mt-auto truncate text-xs text-neutral-900/60" title={entries.map((e) => e.label).join(', ')}>
        {entryPreview(entries)}
      </p>
    </Link>
  );
}
