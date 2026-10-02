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
export { SuccessState, type SuccessAction, type SuccessStep, type SuccessStateProps } from './success-state';
export { ThemeToggle, type ThemeToggleLabels } from './theme-toggle';
export { ListPageSkeleton } from './list-page-skeleton';
export { Skeleton, SkeletonText, SkeletonRegion, type SkeletonShape } from './skeleton';
export { Switch } from './switch';
export { Segmented, type SegmentedOption } from './segmented';

// Forms and safeguards — the form recipe (FRM-1..6) and the danger controls (DNG-1..6).
export { Field, FormStack, type FieldControlProps } from './field';
export { HoldToConfirm } from './hold-to-confirm';
export { DangerZone, type DangerAction } from './danger-zone';
export { CooldownBanner } from './cooldown-banner';

// Uploads — the drop zone and the lanes it feeds (UPL-1..6). The queue is `useUploadQueue`; the admin's shared one is `useUploads`.
export { Dropzone } from './dropzone';
export { UploadTray } from './upload-tray';

// Choosing from a list, and dates (MNU-1..6). `Select` picks segmented, menu or menu-with-search from the option count.
export { Menu, type MenuOption, type OptionBlocker } from './menu';
export { Select, type SelectOption } from './select';
export { MultiSelect, type MultiSelectOption } from './multi-select';
export { DateField } from './date-field';

// Motion — the expressive tier. Functional motion (press, arrive, focus, error)
// needs no import: it is the shared classes. See `docs/design/motion/05-motion.md`.
export { PageEnter } from './page-enter';
export { CountUp } from './count-up';
export { ProgressRing } from './progress-ring';
export { ProgressBar } from './progress-bar';
export { RevealScope } from './reveal-scope';
export { ScrambleText, TypeText } from './text-motion';
export { SwapText } from './swap-text';
export { DrawIcon } from './draw-icon';
export { TruncateReveal } from './truncate-reveal';

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
