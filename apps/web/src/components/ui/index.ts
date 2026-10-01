/**
 * Design-system primitives. Import from here, not from the files directly.
 *
 * Pages compose these. A page that invents its own visual language is the
 * thing the interface rules exist to prevent — see "Interface architecture"
 * in CLAUDE.md.
 */

// Page anatomy — context, title, one action, then the workspace.
export { PageHeader } from './page-header';
export { Section } from './section';

// Progressive disclosure — the mechanism layers 3 and 4 depend on.
export { Disclosure } from './disclosure';
export { Tabs, type TabItem } from './tabs';
export { SectionRail, type RailSection } from './section-rail';

// Data display
export { DataTable, type DataTableColumn } from './data-table';
export { EmptyState } from './empty-state';
export { MetricStrip, type MetricItem } from './metric-strip';
export { Badge, type BadgeTone } from './badge';
export { Pagination, type PaginationMeta } from './pagination';

// Controls and feedback
export { Button, type ButtonProps } from './button';
export { Dialog } from './dialog';
export { ConfirmDialog } from './confirm-dialog';
export { Loading } from './loading';
export { ThemeToggle, type ThemeToggleLabels } from './theme-toggle';
export { ListPageSkeleton } from './list-page-skeleton';
export { Skeleton, SkeletonText, SkeletonRegion, type SkeletonShape } from './skeleton';
export { Switch } from './switch';
export { Segmented, type SegmentedOption } from './segmented';

// Motion — the expressive tier. Functional motion (press, arrive, focus, error)
// needs no import: it is the shared classes. See `docs/design/motion/05-motion.md`.
export { PageEnter } from './page-enter';
export { CountUp } from './count-up';
export { ProgressRing } from './progress-ring';
export { RevealScope } from './reveal-scope';
export { ScrambleText, TypeText } from './text-motion';

// Layout
export { Bento, BentoTile, type BentoSize, type BentoTone } from './bento';
export {
  FilterBar,
  useFilterParam,
  useSetFilterParam,
  useFilterPage,
  useSetFilterPage,
  type FilterDef,
} from './filter-bar';
