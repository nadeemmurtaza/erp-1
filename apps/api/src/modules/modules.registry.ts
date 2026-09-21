import { DynamicModule, Logger, Module, type Type } from '@nestjs/common';
import { AccountingModule } from './accounting/accounting.module';
import { AddressesModule } from './addresses/addresses.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { CartModule } from './cart/cart.module';
import { CatalogModule } from './catalog/catalog.module';
import { CrmModule } from './crm/crm.module';
import { FinanceModule } from './finance/finance.module';
import { IdentityVerificationModule } from './identity-verification/identity-verification.module';
import { InventoryModule } from './inventory/inventory.module';
import { MarketingModule } from './marketing/marketing.module';
import { MeasurementsModule } from './measurements/measurements.module';
import { OrdersModule } from './orders/orders.module';
import { OrganizationModule } from './organization/organization.module';
import { PartiesModule } from './parties/parties.module';
import { PaymentsModule } from './payments/payments.module';
import { PosModule } from './pos/pos.module';
import { ProductionModule } from './production/production.module';
import { PurchasingModule } from './purchasing/purchasing.module';
import { ReportsModule } from './reports/reports.module';
import { SettingsAdminModule } from './settings/settings-admin.module';
import { StitchingModule } from './stitching/stitching.module';
import { TaxModule } from './tax/tax.module';
import { TrackingModule } from './tracking/tracking.module';
import { TradingPartnersModule } from './tradingpartners/trading-partners.module';
import { TransfersModule } from './transfers/transfers.module';
import { UsersAdminModule } from './users/users-admin.module';

export interface FeatureModuleEntry {
  /** Matches an entry in the MODULES env allowlist. */
  name: string;
  module: Type<unknown>;
  /** Ignores the allowlist; use only for modules the store cannot run without. */
  alwaysOn?: boolean;
  /**
   * Registered, but deliberately NOT enabled in any env template.
   *
   * States in code what the comments below already said in prose, so
   * `scripts/check-env-templates.mjs` can tell "nobody has switched this on
   * yet, on purpose" apart from "somebody forgot to add it to a template" —
   * which is the drift that check exists to catch. Without the distinction it
   * can only demand every module be enabled everywhere, and satisfying it
   * would turn on the chain and GL features that RETAIL-ERP.md R14 requires
   * to stay invisible in a Solo deployment.
   *
   * A template may still list one under `# Available:` so a deployer can
   * discover it; the check requires exactly that.
   */
  offByDefault?: boolean;
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
  { name: 'parties', module: PartiesModule },
  { name: 'tradingpartners', module: TradingPartnersModule },
  { name: 'payments', module: PaymentsModule },
  { name: 'orders', module: OrdersModule },
  { name: 'crm', module: CrmModule },
  { name: 'marketing', module: MarketingModule },
  { name: 'analytics', module: AnalyticsModule },
  { name: 'reports', module: ReportsModule },
  { name: 'tax', module: TaxModule },
  { name: 'finance', module: FinanceModule },
  { name: 'tracking', module: TrackingModule },
  // Off by default for every deployment today (WO-18.3) — a chain
  // deployment switches it on when it actually has branches or brands to
  // register (RETAIL-ERP.md R14: "every tier concept must be invisible in
  // Solo").
  { name: 'organization', module: OrganizationModule, offByDefault: true },
  // Off by default — a deployment turns it on once it wants a real GL
  // instead of the sum-of-tables reports in `finance`/`reports`. Couples to
  // nothing either way (R15): no module imports AccountingModule, and its
  // posting rules (WO-19.2/19.3) reach `orders`/`payments`/`purchasing` only
  // through domain events, never a service import.
  { name: 'accounting', module: AccountingModule, offByDefault: true },
  // Off by default — see docs/implementation/18-identity-verification.md.
  // Add 'identity-verification' to MODULES once NID_API_URL/NID_API_KEY/
  // NID_WEBHOOK_SECRET are set.
  { name: 'identity-verification', module: IdentityVerificationModule, offByDefault: true },
  // Off by default — a deployment turns it on once it actually runs a
  // physical till (RETAIL-ERP.md R14: invisible until then). Terminal
  // registration, device auth, shift lifecycle, the sale path
  // (`pos -> orders`, WO-21.3) and receipts/returns (WO-21.5) are all
  // built; park/retrieve and a till-side price override are not.
  { name: 'pos', module: PosModule, offByDefault: true },
  // Off by default — a single-location deployment has nothing to transfer
  // between (RETAIL-ERP.md R14). Inter-brand transfers via the org tier
  // (R4's own note), settlement modes and InterBranchInvoice (R12) are
  // WO-22.2/22.3's, not this module's.
  { name: 'transfers', module: TransfersModule, offByDefault: true },
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
