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

// Controls and feedback
export { Button, type ButtonProps } from './button';
export { Dialog } from './dialog';
export { Loading } from './loading';
