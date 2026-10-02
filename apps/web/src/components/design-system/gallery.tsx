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
import {
  ChartRuleSpecimen,
  ForecastSpecimen,
  FunnelSpecimen,
  GaugeSpecimen,
  HeatmapSpecimen,
  PointLineSpecimen,
  RadarSpecimen,
  RangeSpecimen,
  SalesComparisonSpecimen,
  StackedAreaSpecimen,
} from './chart-concepts';
import { ColumnManagerSpecimen, RegionalPerformanceSpecimen, ShareSpecimen } from './data-concepts';
import { DepartmentPageSpecimen } from './department-page';
import { DispatchFlowSpecimen } from './dispatch-flow';
import { JourneyTiersSpecimen, RoutingCanvasSpecimen } from './flow-concepts';
import { BentoSpecimen, SkeletonSpecimen } from './layout-loading';
import { LayeringSpecimen } from './layering';
import { PageStructureSpecimens } from './page-structure-specimens';
import { MotionSpecimens } from './motion-specimens';
import { PeopleAccessSpecimen } from './people-access';
import { PublishAudienceSpecimen } from './publish-audience';
import { ScopedBentoSpecimen } from './scoped-bento';
import { AdminPatterns } from './patterns';
import { ComponentSpecimens } from './specimens';
import { CardRecipeSpecimen, CopySpecimens, DangerSpecimens, FormRecipeSpecimen, SuccessSpecimens } from './controls-specimens';
import { MenuSpecimens } from './menu-specimens';
import { UploadSpecimens } from './upload-specimens';

const SECTIONS = [
  ['colour', 'Colour'],
  ['type', 'Type'],
  ['space', 'Space'],
  ['depth', 'Depth and timing'],
  ['motion', 'Motion'],
  ['components', 'Components'],
  ['controls', 'Controls'],
  ['patterns', 'Admin patterns'],
  ['screens', 'Admin screens'],
  ['layout', 'Layout and loading'],
  ['data', 'Data and charts'],
  ['charts', 'Chart types'],
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
          title="Depth and timing"
          lead="Elevation, stacking order and timing are tokens too."
          columns="lg:grid-cols-2"
        >
          <ElevationFoundations />
          <Group
            className="lg:col-span-2"
            title="Stacking and pass-through"
            note="A layer of labels and controls over a surface people work on. The overlay is glass: the wrapper lets every click through, and each control on it takes its own back."
          >
            <LayeringSpecimen />
          </Group>
        </GallerySection>

        <GallerySection
          id="motion"
          title="Motion"
          lead="One language, from the same tokens as everything else: a button presses, a card arrives, a field shakes once when it is wrong, a dialog leaves as fast as it came. Movement is kept only for what it tells the reader, and everything here holds still under reduced motion without losing a fact."
        >
          <MotionSpecimens />
        </GallerySection>

        <GallerySection id="components" title="Components" lead="The shared primitives, as shipped. A page composes these; it does not invent its own.">
          <ComponentSpecimens />
        </GallerySection>

        <GallerySection
          id="controls"
          title="Controls with a contract"
          lead="Uploads, menus, danger, forms, cards, copying and the success state: seven families of laws (UPL, MNU, DNG, FRM, CRD, CPY, SUC), each as the real control. Try them: drop a file, type to filter, hold a button, submit the form empty, copy a value."
        >
          <Group
            title="Uploads"
            note="A drop zone, honest progress, a check at drop time, the limits stated first, and one lane per file so one failure never blocks the others."
          >
            <UploadSpecimens />
          </Group>
          <MenuSpecimens />
          <DangerSpecimens />
          <Group
            title="The form recipe"
            note="The sign-in form that every form is cut from: 56 px fields, 16 between them, 32 before the button, a label above and an example inside, a 2 px focus ring, a lit surface, and a ring that becomes a check."
          >
            <FormRecipeSpecimen />
          </Group>
          <Group
            title="The card recipe"
            note="Hover to lift. The card is drawn from the storefront card's own classes; the corners follow one formula, so the photograph's corner is the card's minus the gap."
          >
            <CardRecipeSpecimen />
          </Group>
          <Group
            title="Copy"
            note="One click, one proof: the icon becomes a check on the frame the copy lands, holds two seconds and fades back. The raw value is copied, a screen reader hears it, and on an insecure origin the copy command takes over. If nothing works it says so."
          >
            <CopySpecimens />
          </Group>
          <Group
            title="The success state"
            note="Specific title, the proof under it, one loud button to the thing made, an optional quiet repeat and a way back to the list. One open loop at most, and only one the system can follow. Reduced motion keeps every word and drops the burst."
          >
            <SuccessSpecimens />
          </Group>
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
          id="screens"
          title="Admin screens"
          lead="Three whole screens, each written from the components above and nothing else, with the states and refusals a picture of a screen leaves out. Each shows what its permission hides and what its refusal says."
        >
          <Group
            title="People and access"
            note="The list is the overview; changing one person's access is one level down, in a side sheet. A grant always ends, an acting grant needs a second signature, and you cannot change your own access."
          >
            <PeopleAccessSpecimen />
          </Group>
          <Group
            title="Publish and audience"
            note="Where it goes live, who is shown it, and which exactly. Steps that do not apply close up. Going public names its audience first; an unlisted link just happens."
          >
            <PublishAudienceSpecimen />
          </Group>
          <Group
            title="Department page"
            note="Typed field blocks under one header. What is not the page's to type is shown as what it is: where it works comes from where it sits, its head is a post, and closing has refusals that name their fix."
          >
            <DepartmentPageSpecimen />
          </Group>
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
          <PageStructureSpecimens />
          <Group
            title="Board with scoped tiles"
            note="Every tile says who reads it and who writes it. A tile the viewer cannot read is left out and the row closes over it; one they can read but not change keeps a disabled Edit with the permission written beside it. The grid map under it writes the layout out as columns."
          >
            <ScopedBentoSpecimen />
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
          id="charts"
          title="Chart types"
          lead="Nine forms, each for one shape of data. The shape picks the form; none is chosen because it looks rich. Every chart carries its own table, empty state and keyboard path, and the figures here are illustrative."
          columns="xl:grid-cols-2"
        >
          <Group
            title="Which form for which data"
            note="The rule the rest of this section follows. When the data does not fit a form, the form is wrong, not the data."
            className="xl:col-span-2"
          >
            <ChartRuleSpecimen />
          </Group>
          <Group
            title="Funnel"
            note="Ordered stages. One hue, because the narrowing is the message; the stage that lost the most is named, not coloured."
          >
            <FunnelSpecimen />
          </Group>
          <Group
            title="Point line"
            note="A volatile series where each reading matters. Straight between points, and any reading above the level is a diamond."
          >
            <PointLineSpecimen />
          </Group>
          <Group
            title="Range"
            note="Lowest to highest as a capsule, the average as a ringed dot. A wider week is a taller capsule."
          >
            <RangeSpecimen />
          </Group>
          <Group
            title="Projected against actual"
            note="The existing time series with two series. A dash and a marker shape separate them without colour."
          >
            <ForecastSpecimen />
          </Group>
          <Group
            title="Gauge"
            note="One value against a fixed limit, then four goals as concentric arcs. A limit says Filling up and Almost full in words and icons; a goal says Goal met."
            className="xl:col-span-2"
          >
            <GaugeSpecimen />
          </Group>
          <Group
            title="Stacked area"
            note="A total and its parts. The top edge is the total; turning a layer off restacks the rest and keeps their colours."
          >
            <StackedAreaSpecimen />
          </Group>
          <Group
            title="Radar"
            note="A profile on one scale. Shape shows which axis is weak; Compare is the same data as bars, for reading values."
          >
            <RadarSpecimen />
          </Group>
          <Group
            title="Calendar heatmap"
            note="Activity per day in five steps of one hue. Arrow keys move by day and week; the line under it names the day."
            className="xl:col-span-2"
          >
            <HeatmapSpecimen />
          </Group>
          <Group
            title="Sales by office"
            note="The same measure for four offices. Side by side shares one scale across every panel; Overlaid answers where the lines cross."
            className="xl:col-span-2"
          >
            <SalesComparisonSpecimen />
          </Group>
        </GallerySection>

        <GallerySection
          id="flows"
          title="Flows and journeys"
          lead="Three ways to show a process: who must approve something, how the shell narrows as a person goes deeper into the product, and what a send is allowed to claim while it is still happening."
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
          <Group
            title="One-click send"
            note="Answers in the same frame, stays undoable for five seconds, then hands over and says only what it knows. A failure says what happened and the one next step, and a retry cannot send twice."
          >
            <DispatchFlowSpecimen />
          </Group>
        </GallerySection>
      </main>
    </div>
  );
}
