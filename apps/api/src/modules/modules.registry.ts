import { DynamicModule, Logger, Module, type Type } from '@nestjs/common';
import { AccountingModule } from './accounting/accounting.module';
import { AccountsModule } from './accounts/accounts.module';
import { AddressesModule } from './addresses/addresses.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { BomModule } from './bom/bom.module';
import { CartModule } from './cart/cart.module';
import { CatalogModule } from './catalog/catalog.module';
import { CollectionsModule } from './collections/collections.module';
import { ContentModule } from './content/content.module';
import { AttendanceModule } from './attendance/attendance.module';
import { CrmModule } from './crm/crm.module';
import { CustomFieldsModule } from './custom-fields/custom-fields.module';
import { EmbedsModule } from './embeds/embeds.module';
import { FinanceModule } from './finance/finance.module';
import { FulfilmentModule } from './fulfilment/fulfilment.module';
import { GiftCardsModule } from './giftcards/giftcards.module';
import { HrModule } from './hr/hr.module';
import { OrgStructureModule } from './orgstructure/orgstructure.module';
import { IdentityVerificationModule } from './identity-verification/identity-verification.module';
import { InventoryModule } from './inventory/inventory.module';
import { LoyaltyModule } from './loyalty/loyalty.module';
import { ManagedServicesModule } from './managed-services/managed-services.module';
import { MarketingModule } from './marketing/marketing.module';
import { MeasurementsModule } from './measurements/measurements.module';
import { NotificationPreferencesModule } from './notification-preferences/notification-preferences.module';
import { OnsiteMessagesModule } from './onsitemessages/onsite-messages.module';
import { OrdersModule } from './orders/orders.module';
import { OrganizationModule } from './organization/organization.module';
import { PartiesModule } from './parties/parties.module';
import { PaymentsModule } from './payments/payments.module';
import { PayrollModule } from './payroll/payroll.module';
import { PricingModule } from './pricing/pricing.module';
import { PosModule } from './pos/pos.module';
import { ProductionModule } from './production/production.module';
import { PromotionsModule } from './promotions/promotions.module';
import { PurchasingModule } from './purchasing/purchasing.module';
import { RagModule } from './rag/rag.module';
import { ReceivablesModule } from './receivables/receivables.module';
import { SettlementsModule } from './settlements/settlements.module';
import { RecommendationsModule } from './recommendations/recommendations.module';
import { ReportsModule } from './reports/reports.module';
import { ReviewsModule } from './reviews/reviews.module';
import { SearchModule } from './search/search.module';
import { SettingsAdminModule } from './settings/settings-admin.module';
import { StitchingModule } from './stitching/stitching.module';
import { TaxModule } from './tax/tax.module';
import { TrackingModule } from './tracking/tracking.module';
import { TradingPartnersModule } from './tradingpartners/trading-partners.module';
import { TransfersModule } from './transfers/transfers.module';
import { UsersAdminModule } from './users/users-admin.module';
import { WalletModule } from './wallet/wallet.module';
import { WishlistModule } from './wishlist/wishlist.module';

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
  { name: 'content', module: ContentModule },
  { name: 'collections', module: CollectionsModule },
  { name: 'search', module: SearchModule },
  { name: 'onsitemessages', module: OnsiteMessagesModule },
  { name: 'measurements', module: MeasurementsModule },
  { name: 'cart', module: CartModule },
  { name: 'stitching', module: StitchingModule },
  { name: 'inventory', module: InventoryModule },
  { name: 'purchasing', module: PurchasingModule },
  { name: 'production', module: ProductionModule },
  { name: 'bom', module: BomModule },
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
  // 145-receivables-credit-limits-dunning.md — CreditNote/DebitNote, customer
  // credit limits/holds and dunning. Posts through domain events only
  // (CreditNoteIssued/DebitNoteIssued -> posting-rules.subscriber.ts), so it
  // never imports AccountingModule directly; with `accounting` off, notes and
  // credit terms still work as records, they just post nothing (same "absent
  // collaborator" shape as every other event-only coupling in this file).
  { name: 'receivables', module: ReceivablesModule },
  // 146-wholesale-tiered-pricing.md — the pricing module MULTI-SECTOR.md
  // already named as not built. Hard-imported by cart/orders directly (same
  // shape as tax below) so checkout can always resolve PricingService; this
  // allowlist entry only gates the admin nav/UI, per pricing.module.ts's
  // own doc comment.
  { name: 'pricing', module: PricingModule },
  // 49-financial-institution-settlement-partnerships.md — off by default,
  // same tier as accounting: no real FinancialInstitutionConnector exists
  // yet, so a deployment gains nothing by enabling this until one does.
  { name: 'settlements', module: SettlementsModule, offByDefault: true },
  // Hard-imported by orders.module.ts directly (same reasoning as tax
  // above — checkout always needs ShippingService.quote()), but still
  // listed here so its own admin routes/nav follow the allowlist like
  // every other module's.
  { name: 'fulfilment', module: FulfilmentModule },
  { name: 'payroll', module: PayrollModule },
  // hr-people-org/79-employee-asset-management.md — standalone, no
  // dependency on any other optional module.
  { name: 'hr', module: HrModule },
  { name: 'orgstructure', module: OrgStructureModule },
  // attendance-workforce/22-attendance-shifts-leave.md — reads hr's
  // Posting/Rank/Position and payroll's LeaveRequest directly by Prisma
  // query, no dependency on either module being on (see AttendanceService's
  // own header comment).
  { name: 'attendance', module: AttendanceModule },
  // Same allowlist tier as payments/finance (not offByDefault): checkout
  // couples to both directly, in the same transaction as order creation
  // (`orders -> promotions`, `orders -> giftcards` in KNOWN_MODULE_COUPLINGS)
  // — see DECISIONS.md. "A shop may want one without the other" (WO-5's own
  // words) is a DATA decision (no active Discount rows, no issued
  // GiftCards), not a Nest-boot-time module toggle.
  { name: 'promotions', module: PromotionsModule },
  { name: 'giftcards', module: GiftCardsModule },
  // Phase 7 (docs/implementation/customer-portal-loyalty/07-customer-portal.md)
  // — same allowlist tier as the rest of the customer-facing core: nothing
  // else imports these directly except `loyalty -> giftcards`
  // (KNOWN_MODULE_COUPLINGS, the points-redemption same-transaction write).
  { name: 'reviews', module: ReviewsModule },
  { name: 'wishlist', module: WishlistModule },
  { name: 'loyalty', module: LoyaltyModule },
  // WO-9.6 (09-ai-layer.md) — reads ProductTranslation.embedding (WO-9.5)
  // and OrderItem directly via Prisma, never a service import, same
  // INDEPENDENCE pattern as every other cross-module read in this codebase.
  { name: 'recommendations', module: RecommendationsModule },
  { name: 'notification-preferences', module: NotificationPreferencesModule },
  { name: 'tracking', module: TrackingModule },
  // WO-35 (docs/implementation/ai-layer/35-scalable-rag-document-retrieval.md)
  // — reads AiService/StorageService directly (both core, global), never
  // another feature module. Same allowlist tier as recommendations/search:
  // not offByDefault, since the "absent collaborator" behavior (no
  // ingestion, no query UI) already comes for free from `AiService
  // .isAvailable()`, exactly like WO-9.5/9.6 — a second, module-level
  // toggle on top of that would just be a second way to express the same
  // "no provider configured" state.
  { name: 'rag', module: RagModule },
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
  // Off by default — see docs/implementation/access-control-identity/18-identity-verification.md.
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
  // Off by default — WO-155.0 (docs/implementation/commercial-licensing-agency/
  // 155-wallet-stored-value-merchant-escrow.md) has not yet had its own
  // legal confirmation recorded (DECISIONS.md). Built in full — schema,
  // both services, tests, UI — and not wired into the live checkout path;
  // see wallet.module.ts's own header comment for exactly what "off"
  // means here.
  { name: 'wallet', module: WalletModule, offByDefault: true },
  // Off by default — 149-b2b-accounts-approvals-sector-packs.md. A Solo/
  // simple deployment has no B2B buyer to open a standing account for
  // (RETAIL-ERP.md R14's own "invisible until then"); with it off, checkout
  // is byte-identical to today. Its own AccountsModule doc comment explains
  // why AccountProvider (payments) needs neither this module nor this
  // allowlist entry to keep working.
  { name: 'accounts', module: AccountsModule, offByDefault: true },
  // Off by default for EVERY deployment, always — doc 14
  // (commercial-licensing-agency/14-managed-services-module.md). Requested
  // only for an agency-managed delivery via `scripts/sync-client.mjs
  // --modules=...,managed-services`; never present in a self-hosted
  // client's own `.env.example`/MODULES allowlist (that structural
  // absence is doc 14's own "impossible for self-hosted clients" point).
  { name: 'managed-services', module: ManagedServicesModule, offByDefault: true },
  // Account administration — not togglable business features.
  { name: 'settings', module: SettingsAdminModule, alwaysOn: true },
  { name: 'users', module: UsersAdminModule, alwaysOn: true },
  { name: 'addresses', module: AddressesModule, alwaysOn: true },
  // 104-jsonb-eav-extensibility.md — a bounded custom-field overlay, not a
  // sector-specific pack.
  { name: 'custom-fields', module: CustomFieldsModule, alwaysOn: true },
  // 113-micro-frontend-embedding.md — a narrow iframe embed pattern.
  { name: 'embeds', module: EmbedsModule, alwaysOn: true },
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
