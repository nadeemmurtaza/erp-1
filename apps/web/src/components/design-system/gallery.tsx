'use client';

import { ThemeToggle } from '@/components/ui';
import {
  ColourFoundations,
  ContrastTable,
  ElevationFoundations,
  GallerySection,
  Group,
  SpaceFoundations,
  TypeFoundations,
} from './foundations';
import { ColumnManagerSpecimen, RegionalPerformanceSpecimen, ShareSpecimen } from './data-concepts';
import { JourneyTiersSpecimen, RoutingCanvasSpecimen } from './flow-concepts';
import { BentoSpecimen, SkeletonSpecimen } from './layout-loading';
import { AdminPatterns } from './patterns';
import { ComponentSpecimens } from './specimens';

const SECTIONS = [
  ['colour', 'Colour'],
  ['type', 'Type'],
  ['space', 'Space'],
  ['depth', 'Depth and motion'],
  ['components', 'Components'],
  ['patterns', 'Admin patterns'],
  ['layout', 'Layout and loading'],
  ['data', 'Data and charts'],
  ['flows', 'Flows and journeys'],
] as const;

/**
 * The design system, rendered by the system it describes.
 *
 * Nothing here is a screenshot or a copy: swatches are painted by the same
 * custom properties the app uses, the contrast table is measured from what the
 * browser resolved, and every specimen is the real component. If a token is
 * wrong, this page is wrong in the same way the product is — which is the point.
 */
export function DesignSystemGallery() {
  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <header className="sticky top-0 z-sticky bg-surface shadow-raised">
        <div className="container-page flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold">Design system</h1>
            <p className="text-xs text-neutral-900/60">Tokens and components, in the theme you are viewing</p>
          </div>
          <nav aria-label="Sections" className="order-last flex w-full gap-1 overflow-x-auto no-scrollbar sm:order-none sm:w-auto">
            {SECTIONS.map(([id, label]) => (
              <a key={id} href={`#${id}`} className="nav-link whitespace-nowrap">
                {label}
              </a>
            ))}
          </nav>
          <ThemeToggle />
        </div>
      </header>

      <main className="container-page grid gap-12 py-10">
        <GallerySection
          id="colour"
          title="Colour"
          lead="One palette, two themes. Components name a role (text-neutral-900, bg-surface, bg-accent) and the theme decides the value, so no component knows which theme it is in."
        >
          <ColourFoundations />
          <Group
            title="Contrast, measured"
            note="Text needs 4.5:1, a control's boundary and a chart mark need 3:1. These are computed live from the colours the browser resolved, so switching theme re-measures."
          >
            <ContrastTable />
          </Group>
        </GallerySection>

        <GallerySection
          id="type"
          title="Type"
          lead="System fonts for speed, Nastaliq for Urdu, one scale for every surface."
          columns="lg:grid-cols-3"
        >
          <TypeFoundations />
        </GallerySection>

        <GallerySection
          id="space"
          title="Space"
          lead="Space is the primary grouping device: more room around a group than inside it."
          columns="lg:grid-cols-3"
        >
          <SpaceFoundations />
        </GallerySection>

        <GallerySection
          id="depth"
          title="Depth and motion"
          lead="Elevation, stacking order and timing are tokens too."
          columns="lg:grid-cols-2"
        >
          <ElevationFoundations />
        </GallerySection>

        <GallerySection id="components" title="Components" lead="The shared primitives, as shipped. A page composes these; it does not invent its own.">
          <ComponentSpecimens />
        </GallerySection>

        <GallerySection
          id="patterns"
          title="Admin patterns"
          lead="What the planned admin screens are made of, written out from the components above. A pattern becomes a component when a third screen needs it."
          columns="xl:grid-cols-2"
        >
          <AdminPatterns />
        </GallerySection>

        <GallerySection
          id="layout"
          title="Layout and loading"
          lead="How a page is arranged and how it waits. The bento board gives a dashboard tiles of different weight on one grid; the skeleton holds the shape of content that has not arrived, once."
        >
          <Group
            title="Bento board"
            note="One main job per tile, one grid. The hero carries the figure the room asks about first; below the medium width the tiles stack in source order."
          >
            <BentoSpecimen />
          </Group>
          <Group
            title="Skeletons and the states around them"
            note="A placeholder is drawn from the content it stands in for, and it is only the first of four states. Empty and failed are designed too, and neither is ever a skeleton."
          >
            <SkeletonSpecimen />
          </Group>
        </GallerySection>

        <GallerySection
          id="data"
          title="Data and charts"
          lead="A grid you can shape, two periods side by side, and a share of a whole. Every chart has its table, every figure has a sign and an arrow as well as a colour."
        >
          <Group
            title="Column manager"
            note="Show, hide and reorder the columns of a wide grid. The first column is pinned and always shown, because it names the row; the rest scroll under it."
          >
            <ColumnManagerSpecimen />
          </Group>
          <Group
            title="Regional performance"
            note="This period against the last. The previous period is a gray, not a second colour: it is context for the one that matters."
          >
            <RegionalPerformanceSpecimen />
          </Group>
          <ShareSpecimen />
        </GallerySection>

        <GallerySection
          id="flows"
          title="Flows and journeys"
          lead="Two ways to show a process: who must approve something, and how the shell narrows as a person goes deeper into the product."
        >
          <Group
            title="Approval routing"
            note="A threshold nobody approves alone, drawn as a flow. Run the test to see which approver a given amount reaches; the result is announced and logged."
          >
            <RoutingCanvasSpecimen />
          </Group>
          <Group
            title="Journey tiers"
            note="Global, Area, Destination, View, Object: the navigation shape of the product, and the chrome each tier leaves on screen."
          >
            <JourneyTiersSpecimen />
          </Group>
        </GallerySection>
      </main>
    </div>
  );
}
