import { DynamicModule, Logger, Module, type Type } from '@nestjs/common';
import { AddressesModule } from './addresses/addresses.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { CartModule } from './cart/cart.module';
import { CatalogModule } from './catalog/catalog.module';
import { CrmModule } from './crm/crm.module';
import { InventoryModule } from './inventory/inventory.module';
import { MarketingModule } from './marketing/marketing.module';
import { MeasurementsModule } from './measurements/measurements.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { ProductionModule } from './production/production.module';
import { PurchasingModule } from './purchasing/purchasing.module';
import { ReportsModule } from './reports/reports.module';
import { SettingsAdminModule } from './settings/settings-admin.module';
import { StitchingModule } from './stitching/stitching.module';
import { TaxModule } from './tax/tax.module';
import { TrackingModule } from './tracking/tracking.module';
import { UsersAdminModule } from './users/users-admin.module';

export interface FeatureModuleEntry {
  /** Matches an entry in the MODULES env allowlist. */
  name: string;
  module: Type<unknown>;
  /** Ignores the allowlist; use only for modules the store cannot run without. */
  alwaysOn?: boolean;
}

/**
 * The registry of feature modules.
 *
 * ADDING A MODULE IS ONE LINE HERE. Nothing else in the API changes: the module
 * owns its controllers, services and its own prisma/schema/<name>.prisma file,
 * and it reaches other modules through domain events rather than imports.
 * See CONTRIBUTING.md.
 */
export const FEATURE_MODULES: FeatureModuleEntry[] = [
  { name: 'catalog', module: CatalogModule },
  { name: 'measurements', module: MeasurementsModule },
  { name: 'cart', module: CartModule },
  { name: 'stitching', module: StitchingModule },
  { name: 'inventory', module: InventoryModule },
  { name: 'purchasing', module: PurchasingModule },
  { name: 'production', module: ProductionModule },
  { name: 'payments', module: PaymentsModule },
  { name: 'orders', module: OrdersModule },
  { name: 'crm', module: CrmModule },
  { name: 'marketing', module: MarketingModule },
  { name: 'analytics', module: AnalyticsModule },
  { name: 'reports', module: ReportsModule },
  { name: 'tax', module: TaxModule },
  { name: 'tracking', module: TrackingModule },
  // Account administration — not togglable business features.
  { name: 'settings', module: SettingsAdminModule, alwaysOn: true },
  { name: 'users', module: UsersAdminModule, alwaysOn: true },
  { name: 'addresses', module: AddressesModule, alwaysOn: true },
];

/**
 * Composes the enabled modules into one import.
 *
 * The allowlist is read from process.env rather than ConfigService because
 * module composition happens before the DI container exists. env.validation.ts
 * still validates the same variable at boot.
 */
@Module({})
export class FeatureModulesModule {
  static register(): DynamicModule {
    const logger = new Logger('FeatureModules');
    const allowlist = (process.env.MODULES ?? '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);

    const enabled = FEATURE_MODULES.filter(
      (entry) => entry.alwaysOn || allowlist.includes(entry.name),
    );

    const skipped = FEATURE_MODULES.filter((entry) => !enabled.includes(entry));
    logger.log(`Enabled modules: ${enabled.map((e) => e.name).join(', ') || 'none'}`);
    if (skipped.length > 0) {
      logger.log(`Disabled by MODULES allowlist: ${skipped.map((e) => e.name).join(', ')}`);
    }

    return {
      module: FeatureModulesModule,
      imports: enabled.map((entry) => entry.module),
    };
  }
}
