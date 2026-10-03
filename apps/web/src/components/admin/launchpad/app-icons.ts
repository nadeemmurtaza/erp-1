import {
  BarChart3,
  Boxes,
  Factory,
  Landmark,
  ListChecks,
  Scissors,
  Settings,
  ShoppingCart,
  Truck,
  UserRound,
  Users,
} from 'lucide-react';
import type { LaunchpadIconKey } from '@newax/shared';

/**
 * One glyph per `LaunchpadIconKey`. The manifest names a key, never an icon
 * component, so `@newax/shared` stays free of any UI library and a tile's
 * glyph is chosen in one place. `Record<LaunchpadIconKey, …>` makes a new key
 * without a glyph a build error.
 */
export const LAUNCHPAD_ICONS: Record<LaunchpadIconKey, typeof ShoppingCart> = {
  sales: ShoppingCart,
  inventory: Boxes,
  finance: Landmark,
  people: Users,
  tasks: ListChecks,
  customers: UserRound,
  insights: BarChart3,
  manufacturing: Factory,
  workshop: Scissors,
  fulfilment: Truck,
  settings: Settings,
};
