/**
 * The permission catalog for PBAC (Permission-Based Access Control).
 *
 * Roles (@see enums.ts UserRole) stay as the job-title field on User, but no
 * longer gate anything directly — every guard and nav check tests against a
 * PermissionKey instead. What each role grants is DATA (the RolePermission
 * table, seeded from ROLE_PERMISSION_SEED below), editable from
 * /admin/settings without a code change.
 *
 * A user's effective permissions are their role's grants with their own
 * UserPermission overrides applied on top: a GRANT adds a permission their
 * role doesn't have, a REVOKE takes away one it does — @see
 * PermissionsResolverService.resolveForUser in the API.
 *
 * Any change here must be mirrored in apps/api/prisma/seed.ts's permission
 * seed, which is what actually populates the Permission/RolePermission
 * tables — this file is the compile-time catalog @RequirePermission(...)
 * call sites are checked against, not the source of truth for what's in the
 * database on a given deployment (an admin may have edited it since).
 */

import type { UserRole } from './enums';

/**
 * How much is at stake if this permission is granted to the wrong person —
 * shown as a warning in the role-creation wizard (below), never enforced by
 * itself: `critical` is exactly `ADMIN_LOCKED_PERMISSIONS`, restated here so
 * a role editor can warn *before* the save that already refuses to orphan
 * one, not only after.
 *
 *   low      — a day-to-day action, wrong only in the "oops, wrong button" sense
 *   medium   — touches money, cost, or another person's data
 *   high     — grants power over other accounts or brands/branches
 *   critical — can lock every admin out of the screen that would undo it
 */
export type PermissionSensitivity = 'low' | 'medium' | 'high' | 'critical';

export interface PermissionDefinition {
  key: string;
  label: string;
  category: string;
  sensitivity: PermissionSensitivity;
}

export const PERMISSION_CATALOG: readonly PermissionDefinition[] = [
  { key: 'analytics.view', label: 'View dashboard analytics', category: 'Dashboard', sensitivity: 'low' },
  { key: 'reports.view', label: 'Export CSV reports', category: 'Dashboard', sensitivity: 'low' },
  {
    key: 'organization.view',
    label: 'View the organization/brand/branch dashboard',
    category: 'Dashboard',
    sensitivity: 'low',
  },
  {
    key: 'organization.manage',
    label: 'Grant and revoke who is a brand or branch admin',
    category: 'Dashboard',
    sensitivity: 'high',
  },
  {
    key: 'accounting.view',
    label: 'View the general ledger and its reports (trial balance, P&L, balance sheet, cash flow, aged AR/AP)',
    category: 'Dashboard',
    sensitivity: 'medium',
  },

  { key: 'crm.manage', label: 'Manage leads, contacts and CRM', category: 'Customers', sensitivity: 'low' },

  { key: 'orders.manage', label: 'Manage orders and shipments', category: 'Sales', sensitivity: 'medium' },
  {
    // 146-wholesale-tiered-pricing.md.
    key: 'pricing.price-lists.manage',
    label: 'Create and edit wholesale price lists and quantity breaks',
    category: 'Sales',
    sensitivity: 'medium',
  },
  {
    // Deliberately seeded to no role by default — the same "threshold
    // nobody approves alone" discipline org.access.grant/hr.attendance.reconcile
    // already establish (ADR-045/046). A price-list entry meaningfully
    // below the variant's own basePrice is a real margin decision;
    // PricingService.assertEntriesNeedNoApproval() refuses the write
    // without this key.
    key: 'pricing.price-lists.approve',
    label: 'Set a wholesale price below a variant\'s own base price',
    category: 'Sales',
    sensitivity: 'high',
  },
  {
    key: 'pricing.assignments.manage',
    label: 'Assign a price list to a customer or a customer tag',
    category: 'Sales',
    sensitivity: 'medium',
  },
  {
    key: 'pos.manage',
    label: 'Register till terminals and issue their device credentials',
    category: 'Sales',
    sensitivity: 'high',
  },
  {
    key: 'pos.operate',
    label: 'Open and close till shifts, and record cash movements',
    category: 'Sales',
    sensitivity: 'medium',
  },
  {
    key: 'pos.instalments.cancel',
    label: 'Cancel a layby/instalment plan — may forfeit or refund its deposit, per policy',
    category: 'Sales',
    sensitivity: 'high',
  },
  {
    key: 'pos.instalments.default',
    label: 'Mark a layby/instalment plan defaulted — writes off the unpaid balance',
    category: 'Sales',
    sensitivity: 'high',
  },
  {
    key: 'payments.approve',
    label: 'Approve bank-transfer payments',
    category: 'Sales',
    sensitivity: 'high',
  },

  {
    key: 'stitching.jobs.view_queue',
    label: 'View the tailor job queue',
    category: 'Production',
    sensitivity: 'low',
  },
  {
    key: 'stitching.jobs.change_stage',
    label: 'Move a job to its next stage',
    category: 'Production',
    sensitivity: 'low',
  },
  {
    key: 'stitching.jobs.manage_own',
    label: 'Change stage on own assigned jobs only',
    category: 'Production',
    sensitivity: 'low',
  },
  {
    key: 'stitching.jobs.manage_all',
    label: 'Change stage on any job, regardless of assignment',
    category: 'Production',
    sensitivity: 'medium',
  },
  {
    key: 'stitching.jobs.assign',
    label: 'Assign jobs to a tailor',
    category: 'Production',
    sensitivity: 'low',
  },
  {
    key: 'stitching.bookings.manage',
    label: "Manage customer's-own-fabric stitching bookings",
    category: 'Production',
    sensitivity: 'low',
  },
  {
    key: 'stitching.designs.manage',
    label: 'Manage the stitching style/design catalogue',
    category: 'Production',
    sensitivity: 'low',
  },
  {
    key: 'production.manage',
    label: 'Manage bills of materials and work orders',
    category: 'Production',
    sensitivity: 'medium',
  },
  {
    key: 'production.view_chain',
    label: "View a SKU's full supply-chain status (stock, POs, work orders, pending orders)",
    category: 'Production',
    sensitivity: 'low',
  },

  {
    key: 'catalog.manage',
    label: 'Manage products, categories and import',
    category: 'Catalogue',
    sensitivity: 'medium',
  },
  {
    key: 'inventory.manage',
    label: 'Adjust and view stock levels',
    category: 'Catalogue',
    sensitivity: 'medium',
  },
  {
    key: 'inventory.view_cost',
    label: 'See cost prices and margins',
    category: 'Catalogue',
    sensitivity: 'medium',
  },
  { key: 'inventory.count', label: 'Run stock counts', category: 'Catalogue', sensitivity: 'low' },
  {
    key: 'transfers.manage',
    label: 'Dispatch, receive and cancel inter-branch stock transfers',
    category: 'Catalogue',
    sensitivity: 'medium',
  },
  {
    key: 'measurements.manage_blueprints',
    label: 'Manage garment types, measurement fields and size charts',
    category: 'Catalogue',
    sensitivity: 'low',
  },

  { key: 'suppliers.manage', label: 'Manage suppliers', category: 'Purchasing', sensitivity: 'medium' },
  {
    key: 'purchasing.manage',
    label: 'Create and receive purchase orders',
    category: 'Purchasing',
    sensitivity: 'medium',
  },
  {
    key: 'purchasing.requisitions.create',
    label: 'Request a purchase (not necessarily raise the PO)',
    category: 'Purchasing',
    sensitivity: 'low',
  },
  {
    key: 'purchasing.requisitions.approve',
    label: 'Approve or reject purchase requisitions',
    category: 'Purchasing',
    sensitivity: 'medium',
  },
  {
    key: 'planning.propagation.view',
    label: 'Run a supply-chain shock scenario, view ranked recovery actions, the liquidity forecast and supplier scorecards',
    category: 'Purchasing',
    sensitivity: 'medium',
  },
  {
    key: 'inventory.spot_checks.manage',
    label: 'Configure unpredictable spot-check policies',
    category: 'Catalogue',
    sensitivity: 'medium',
  },
  {
    key: 'parties.manage',
    label: 'Manage the shared counterparty (supplier/retailer/distributor/manufacturer) profile directory',
    category: 'Purchasing',
    sensitivity: 'medium',
  },

  {
    key: 'account.change_own_password',
    label: 'Change their own password',
    category: 'Account',
    sensitivity: 'low',
  },

  {
    key: 'settings.manage',
    label: 'Access the Settings screen',
    category: 'Administration',
    sensitivity: 'critical',
  },
  {
    // 161-sso-identity-federation.md — critical because a connection's
    // allowed domains and default role decide who may sign in at all: an
    // identity provider trusted for a domain signs in, and auto-links, every
    // existing account at that domain, admins included.
    key: 'settings.sso.manage',
    label: 'Register, edit and suspend single sign-on connections',
    category: 'Administration',
    sensitivity: 'critical',
  },
  {
    // 104-jsonb-eav-extensibility.md — defining what custom fields exist on
    // a wired entity (e.g. Supplier) is a settings-level action, distinct
    // from suppliers.manage's own day-to-day editing of a supplier's values.
    key: 'settings.custom-fields.manage',
    label: 'Define custom fields on Suppliers and other wired entities',
    category: 'Administration',
    sensitivity: 'medium',
  },
  {
    // 113-micro-frontend-embedding.md — which third-party tool may be
    // embedded is a settings-level decision; viewing an already-configured
    // one is analytics.view's own job (the class-level gate on the widgets
    // list/token routes).
    key: 'settings.embeds.manage',
    label: 'Register and configure embeddable third-party widgets',
    category: 'Administration',
    sensitivity: 'medium',
  },
  {
    // 143-micro-frontend-architecture.md — registering a fragment introduces
    // third-party runtime code (loaded here as an iframe + embed-token, per
    // the doc's own WO-143.4/DECISIONS.md ADR-049 substitution) into the
    // admin shell; a real trust decision, gated separately from
    // settings.embeds.manage since it carries the design-law attestation
    // requirement doc 143 names, not shared with doc 113's own widgets.
    key: 'settings.fragments.manage',
    label: 'Register and suspend micro-frontend fragments',
    category: 'Administration',
    sensitivity: 'critical',
  },
  {
    // 141-general-metadata-driven-ui-engine.md — defining a metadata-driven
    // form's own field shape is a settings-level action; reading an
    // already-defined shape is open to any authenticated admin (it grants
    // no access to any entity's own values).
    key: 'settings.metadata-forms.manage',
    label: 'Define metadata-driven form field shapes',
    category: 'Administration',
    sensitivity: 'medium',
  },
  {
    // 142-bpmn-visual-workflow-engine.md — redrawing an approval chain's own
    // shape changes who approves what for every future subject of that
    // type; a settings-level trust decision, not a day-to-day action.
    key: 'settings.bpmn-workflows.manage',
    label: 'Redraw approval workflow diagrams',
    category: 'Administration',
    sensitivity: 'critical',
  },
  {
    key: 'tax.manage',
    label: 'Manage tax classes, rates and the pricing mode',
    category: 'Administration',
    sensitivity: 'medium',
  },
  {
    key: 'finance.view',
    label: 'View expenses and finance reports',
    category: 'Finance',
    sensitivity: 'medium',
  },
  {
    key: 'finance.manage',
    label: 'Record and edit expenses',
    category: 'Finance',
    sensitivity: 'medium',
  },
  {
    key: 'finance.wallets.adjust',
    label: 'Issue a manual wallet balance correction, below the auto-approval threshold',
    category: 'Finance',
    sensitivity: 'medium',
  },
  {
    key: 'finance.wallets.adjust.approve',
    label: 'Approve a wallet adjustment at or above the auto-approval threshold — never the requester\'s own',
    category: 'Finance',
    sensitivity: 'high',
  },
  {
    key: 'finance.merchant-payables.dispute',
    label: 'Mark a merchant payable disputed (pulls it from the next payout run) or resolve one — never one they disputed themselves',
    category: 'Finance',
    sensitivity: 'high',
  },
  {
    key: 'finance.credit-notes.create',
    label: 'Issue a credit note, and apply it to an invoice',
    category: 'Finance',
    sensitivity: 'medium',
  },
  {
    key: 'finance.credit-notes.approve',
    label: 'Approve a credit note above the approval threshold, and void one',
    category: 'Finance',
    sensitivity: 'high',
  },
  {
    key: 'finance.debit-notes.manage',
    label: 'Issue and void debit notes against a supplier',
    category: 'Finance',
    sensitivity: 'medium',
  },
  {
    key: 'finance.credit-terms.manage',
    label: "Set a customer's credit limit and payment terms, apply a credit hold, and edit the dunning policy",
    category: 'Finance',
    sensitivity: 'high',
  },
  {
    key: 'finance.assets.depreciate',
    label: 'Put a company asset on a depreciation schedule — a real accounting-policy decision',
    category: 'Finance',
    sensitivity: 'medium',
  },
  {
    key: 'finance.assets.dispose',
    label: 'Dispose an asset — posts a real loss/gain to the ledger',
    category: 'Finance',
    sensitivity: 'high',
  },
  {
    key: 'finance.settlement.view',
    label: 'View settlement batches — what a bank or gateway actually paid out, reconciled against what is owed',
    category: 'Finance',
    sensitivity: 'medium',
  },
  {
    key: 'finance.settlement.reconcile',
    label: 'Register expected settlement batches, reconcile them, and request writing off a shortfall',
    category: 'Finance',
    sensitivity: 'medium',
  },
  {
    key: 'finance.settlement.approve_writeoff',
    label: 'Approve writing off a settlement shortfall above the configured threshold',
    category: 'Finance',
    sensitivity: 'high',
  },
  {
    key: 'finance.facilities.view',
    label: "View bank facilities — a term loan, running finance, overdraft or LC/guarantee limit — and each one's utilization",
    category: 'Finance',
    sensitivity: 'medium',
  },
  {
    key: 'finance.facilities.manage',
    label: 'Register banks and facilities, and record drawdowns and repayments against them',
    category: 'Finance',
    sensitivity: 'high',
  },
  {
    key: 'finance.facilities.approve_drawdown',
    label: 'Approve a bank facility drawdown above the configured threshold',
    category: 'Finance',
    sensitivity: 'high',
  },
  {
    key: 'fulfilment.view',
    label: 'View shipments, manifests, RTO and returns',
    category: 'Fulfilment',
    sensitivity: 'low',
  },
  {
    key: 'fulfilment.manage',
    label: 'Book, track and manifest shipments; decide returns',
    category: 'Fulfilment',
    sensitivity: 'medium',
  },
  {
    key: 'bom.view',
    label: 'View bills of materials and raw stock',
    category: 'Manufacturing',
    sensitivity: 'low',
  },
  {
    key: 'bom.manage',
    label: 'Create and edit raw materials and recipes',
    category: 'Manufacturing',
    sensitivity: 'medium',
  },
  {
    key: 'bom.produce',
    label: 'Record a production run',
    category: 'Manufacturing',
    sensitivity: 'low',
  },
  {
    key: 'payroll.view_own',
    label: 'View their own compensation, leave balance and payslips',
    category: 'Payroll',
    sensitivity: 'low',
  },
  {
    key: 'payroll.view',
    label: "View every employee's compensation, leave and pay-run data",
    category: 'Payroll',
    sensitivity: 'medium',
  },
  {
    key: 'payroll.manage',
    label: 'Set compensation rates, decide leave requests, and build, approve and post pay runs',
    category: 'Payroll',
    sensitivity: 'medium',
  },
  {
    key: 'hr.assets.manage',
    label: 'Issue and return company equipment (laptops, phones, uniforms) to staff',
    category: 'Human Resources',
    sensitivity: 'medium',
  },
  {
    key: 'hr.assets.writeoff',
    label: 'Mark an asset retired or lost — a real cost, separate from day-to-day issue/return',
    category: 'Human Resources',
    sensitivity: 'medium',
  },
  {
    // hr-people-org/20-people-positions-ranks.md.
    key: 'hr.people.view',
    label: 'View the people list, positions and the rank ladder',
    category: 'Human Resources',
    sensitivity: 'low',
  },
  {
    // Creating a Position at or above the creator's own rank, or ending a
    // posting, is refused server-side; raising a rank needs the second
    // signature doc 21 (once built) adds — medium here reflects a real but
    // bounded blast radius, not "high", since the org's own rank ladder
    // already caps what one holder of this key can promote someone into.
    key: 'hr.people.manage',
    label: 'Create positions, assign and end postings, manage the rank ladder',
    category: 'Human Resources',
    sensitivity: 'medium',
  },
  {
    // attendance-workforce/22-attendance-shifts-leave.md.
    key: 'hr.attendance.view',
    label: 'View attendance events, shifts and exceptions',
    category: 'Human Resources',
    sensitivity: 'low',
  },
  {
    // Recording a punch on someone else's behalf (MANAGER source) or
    // importing paper sign-in sheets (IMPORT source) — never refusing the
    // write itself, only who may perform it on another person's behalf.
    key: 'hr.attendance.record',
    label: 'Record a punch for someone else, or import paper sign-in sheets',
    category: 'Human Resources',
    sensitivity: 'medium',
  },
  {
    // Deliberately seeded to no role by default — see this key's own note
    // next to ROLE_PERMISSION_SEED.ADMIN below, and DECISIONS.md ADR-046.
    // Toxic paired with payroll.manage (TOXIC_PERMISSION_PAIRS below): the
    // doc's own text names 'hr.payroll.run', which does not exist in this
    // codebase — running a pay run is gated by payroll.manage, so that is
    // the key this pair actually names.
    key: 'hr.attendance.reconcile',
    label: 'Clear an attendance exception — link it to a shift or accept it as-is',
    category: 'Human Resources',
    sensitivity: 'medium',
  },
  {
    // tasks-notifications-support/61-policy-communications-bulletin.md
    // (WO-61.4). Broad by design — "a bulletin board's whole point is
    // being read by everyone in scope" (the doc's own words) — unlike
    // every other hr.* key above, which is ADMIN-only.
    key: 'hr.bulletins.view',
    label: 'Read the bulletin board — company policy notices and memos',
    category: 'Human Resources',
    sensitivity: 'low',
  },
  {
    // Scoped to the publisher's own reach (BulletinsService.publish()'s
    // own reachOf() check), the same authority boundary notify.send
    // already applies to an ordinary internal message.
    key: 'hr.bulletins.publish',
    label: 'Post and retract notices on the bulletin board, within your own reach',
    category: 'Human Resources',
    sensitivity: 'medium',
  },
  {
    // hr-people-org/19-org-structure-offices-departments.md.
    key: 'org.structure.view',
    label: 'View the organization tree — offices, regions and departments',
    category: 'Organization',
    sensitivity: 'low',
  },
  {
    key: 'org.structure.manage',
    label: 'Create, rename, move and close units in the organization tree',
    category: 'Organization',
    sensitivity: 'high',
  },
  {
    // access-control-identity/21-access-over-the-org-tree.md.
    key: 'org.access.view',
    label: 'See who reaches an organization unit, by posting or by grant',
    category: 'Organization',
    sensitivity: 'medium',
  },
  {
    // Deliberately seeded to no role by default — see this key's own note
    // next to ROLE_PERMISSION_SEED.ADMIN below, and DECISIONS.md ADR-045.
    key: 'org.access.grant',
    label: 'Issue or revoke a time-boxed access grant over an organization unit',
    category: 'Organization',
    sensitivity: 'high',
  },
  {
    // tasks-notifications-support/23-tasks-allotment-tracking.md.
    key: 'tasks.view',
    label: 'View tasks — my work, a post queue, and a task\'s transition history',
    category: 'Organization',
    sensitivity: 'low',
  },
  {
    key: 'tasks.assign',
    label: 'Create tasks, assign them to a person, and move them between OPEN/IN_PROGRESS/BLOCKED',
    category: 'Organization',
    sensitivity: 'medium',
  },
  {
    // Paired with tasks.assign as a PER-INSTANCE check inside
    // TaskService.close(), never TOXIC_PERMISSION_PAIRS — see that method's
    // own header comment and DECISIONS.md ADR-050 for why: the risk this
    // key's own toxic pairing guards against ("assigning yourself work and
    // marking it done unobserved") only exists for a task whose sourceType
    // names a money-adjacent module, not for an ordinary task, so refusing
    // a ROLE from ever holding both keys would break the common case
    // (most STAFF legitimately holds both and self-closes routine work).
    key: 'tasks.close',
    label: 'Mark a task DONE or CANCELLED',
    category: 'Organization',
    sensitivity: 'medium',
  },
  {
    key: 'tasks.admin',
    label: 'Add or reorder a task workflow stage',
    category: 'Organization',
    sensitivity: 'high',
  },
  {
    // tasks-notifications-support/24-internal-notifications-meetings-escalation.md.
    key: 'notify.send',
    label: 'Send an internal message or call a meeting, within your own reach',
    category: 'Organization',
    sensitivity: 'low',
  },
  {
    // Toxic-paired with org.access.grant (TOXIC_PERMISSION_PAIRS below):
    // address everyone AND widen your own reach is exactly "invent the
    // thing, then authorise yourself over it," restated for a broadcast
    // audience instead of an org-unit grant.
    key: 'notify.broadcast',
    label: 'Send an announcement above the quorum threshold (requires a countersignature)',
    category: 'Organization',
    sensitivity: 'high',
  },
  {
    key: 'notify.escalation.manage',
    label: 'Configure which stalled tasks escalate, and how far',
    category: 'Organization',
    sensitivity: 'high',
  },
  {
    // tasks-notifications-support/64-help-desk-support-ticketing.md
    // (WO-64.3). Broad — every internal (non-customer) user may raise one.
    key: 'support.tickets.raise',
    label: 'Raise an internal support ticket',
    category: 'Organization',
    sensitivity: 'low',
  },
  {
    // Resolved fresh at assignment time (SupportTicketsService.assign()),
    // never cached — losing this role stops someone appearing as an
    // eligible assignee for a NEW assignment immediately.
    key: 'support.tickets.handle',
    label: 'Be assigned support tickets, and work the ones assigned to you',
    category: 'Organization',
    sensitivity: 'medium',
  },
  {
    key: 'support.tickets.view_all',
    label: 'View every support ticket, not only your own',
    category: 'Organization',
    sensitivity: 'medium',
  },
  {
    // Distinct from support.tickets.handle: reassigning ANY ticket (not
    // just claiming an unassigned one) is the broader authority.
    key: 'support.tickets.reassign',
    label: 'Assign or reassign any support ticket',
    category: 'Organization',
    sensitivity: 'medium',
  },
  {
    key: 'marketing.manage',
    label: 'Turn on automated marketing email and set its timing',
    category: 'Administration',
    sensitivity: 'low',
  },
  {
    key: 'roles.manage_permissions',
    label: "Edit each role's granted permissions",
    category: 'Administration',
    sensitivity: 'critical',
  },
  { key: 'audit.view', label: 'View the audit log', category: 'Administration', sensitivity: 'medium' },
  {
    key: 'users.manage',
    label: 'Create and manage back-office user accounts',
    category: 'Administration',
    sensitivity: 'high',
  },
  {
    key: 'accounting.manage_periods',
    label: 'Open, close and lock fiscal periods — locking is irreversible',
    category: 'Administration',
    sensitivity: 'medium',
  },
  {
    key: 'promotions.view',
    label: 'View discounts, promo codes and their usage',
    category: 'Marketing',
    sensitivity: 'low',
  },
  {
    key: 'promotions.manage',
    label: 'Create and edit discounts and promo codes',
    category: 'Marketing',
    sensitivity: 'medium',
  },
  {
    key: 'giftcards.view',
    label: 'View gift cards, their ledgers and store credit balances',
    category: 'Marketing',
    sensitivity: 'medium',
  },
  {
    key: 'giftcards.manage',
    label: 'Issue, cancel and adjust gift cards and store credit — real money',
    category: 'Marketing',
    sensitivity: 'high',
  },
  {
    key: 'content.view',
    label: 'View pages, blog posts, banners and menus',
    category: 'Marketing',
    sensitivity: 'low',
  },
  {
    key: 'content.manage',
    label: 'Publish pages and posts, and edit banners and menus',
    category: 'Marketing',
    sensitivity: 'medium',
  },
  {
    key: 'collections.view',
    label: 'View collections and their membership',
    category: 'Marketing',
    sensitivity: 'low',
  },
  {
    key: 'collections.manage',
    label: 'Create and curate collections',
    category: 'Marketing',
    sensitivity: 'medium',
  },
  {
    key: 'search.view',
    label: 'View the zero-result search report',
    category: 'Marketing',
    sensitivity: 'low',
  },
  {
    key: 'search.manage',
    label: 'Edit search synonyms',
    category: 'Marketing',
    sensitivity: 'low',
  },
  {
    key: 'campaigns.view',
    label: 'View campaigns and their send/open/click stats',
    category: 'Marketing',
    sensitivity: 'low',
  },
  {
    key: 'campaigns.manage',
    label: 'Create, schedule and send campaigns to a customer segment',
    category: 'Marketing',
    sensitivity: 'high',
  },
  {
    key: 'onsitemessages.view',
    label: 'View on-site announcement bars, popups and newsletter capture',
    category: 'Marketing',
    sensitivity: 'low',
  },
  {
    key: 'onsitemessages.manage',
    label: 'Create and schedule on-site announcement bars, popups and newsletter capture',
    category: 'Marketing',
    sensitivity: 'low',
  },
  {
    key: 'reviews.moderate',
    label: 'Approve, reject and reply to customer product reviews',
    category: 'Marketing',
    sensitivity: 'medium',
  },
  {
    key: 'loyalty.view',
    label: 'View loyalty point balances, tiers and referrals',
    category: 'Marketing',
    sensitivity: 'low',
  },
  {
    key: 'loyalty.manage',
    label: 'Adjust a customer\'s loyalty points and configure tiers — real money once redeemed',
    category: 'Marketing',
    sensitivity: 'high',
  },
  {
    key: 'ai.view',
    label: 'View AI usage, cost and the review queue for AI-generated drafts',
    category: 'Administration',
    sensitivity: 'low',
  },
  {
    key: 'ai.manage',
    label: 'Configure AI providers and the monthly budget, and approve or reject AI-generated drafts',
    category: 'Administration',
    sensitivity: 'medium',
  },
  {
    key: 'rag.ingest.manage',
    label: 'Upload documents into a RAG corpus, and retry or remove one from the ingestion queue',
    category: 'Administration',
    sensitivity: 'medium',
  },
  {
    key: 'rag.query',
    label: 'Run a retrieval or generated-answer query directly against a document corpus',
    category: 'Administration',
    // Security review (WO-35 H1): a corpus can hold payroll or accounting
    // content depending on what an operator uploaded into it, so holding
    // this key alone can surface confidential content — the actual
    // per-corpus restriction is `rag-corpus-access.ts`'s own map, not this
    // sensitivity tier; this only reflects what the base grant can reach.
    sensitivity: 'medium',
  },
] as const;

export type PermissionKey = (typeof PERMISSION_CATALOG)[number]['key'];

export const PERMISSION_KEYS: readonly PermissionKey[] = PERMISSION_CATALOG.map((p) => p.key);

/**
 * The role-creation wizard's own grouping (owner's request) — smaller and
 * more numerous than `category` above, which exists for a flat reference
 * table (Settings ▸ old audit view, the per-user permission table) rather
 * than a "pick a manageable slice at a time" flow. One step = one group;
 * every `PERMISSION_CATALOG` key appears in exactly one group here, checked
 * by `permissions.spec.ts`.
 */
export interface PermissionGroup {
  key: string;
  label: string;
  description: string;
  permissions: readonly PermissionKey[];
}

export const PERMISSION_GROUPS: readonly PermissionGroup[] = [
  {
    key: 'account',
    label: 'Personal account',
    description: 'What a role holder can do for themselves — account.change_own_password is granted to every seeded role; payroll.view_own only to a role that is actually paid.',
    permissions: ['account.change_own_password', 'payroll.view_own'],
  },
  {
    key: 'dashboards',
    label: 'Dashboards & reports',
    description: 'Read-only views of how the shop is doing.',
    permissions: ['analytics.view', 'reports.view', 'accounting.view', 'finance.view'],
  },
  {
    key: 'chain-admin',
    label: 'Organization / brand / branch admin',
    description: "Reach the drill-down dashboard, or decide who else is a brand or branch admin.",
    permissions: ['organization.view', 'organization.manage'],
  },
  {
    key: 'customers',
    label: 'Customers & CRM',
    description: 'Leads, contacts, interactions and the support inbox.',
    permissions: ['crm.manage'],
  },
  {
    key: 'sales',
    label: 'Sales & payments',
    description: 'Order fulfilment, approving a bank-transfer payment, running a till shift, registering terminals, and wholesale pricing.',
    permissions: [
      'orders.manage',
      'payments.approve',
      'pos.manage',
      'pos.operate',
      'pos.instalments.cancel',
      'pos.instalments.default',
      'pricing.price-lists.manage',
      'pricing.price-lists.approve',
      'pricing.assignments.manage',
    ],
  },
  {
    key: 'fulfilment',
    label: 'Shipping & returns',
    description: 'Shipping zones and rates, booking and tracking shipments, manifests, RTO, and deciding a customer return.',
    permissions: ['fulfilment.view', 'fulfilment.manage'],
  },
  {
    key: 'tailor-queue',
    label: 'Tailor queue',
    description: 'The stitching workshop floor — view, assign and move jobs along.',
    permissions: [
      'stitching.jobs.view_queue',
      'stitching.jobs.change_stage',
      'stitching.jobs.manage_own',
      'stitching.jobs.manage_all',
      'stitching.jobs.assign',
    ],
  },
  {
    key: 'stitching-catalogue',
    label: 'Stitching bookings & designs',
    description: "Customer's-own-fabric bookings, and the stitching style/design catalogue.",
    permissions: ['stitching.bookings.manage', 'stitching.designs.manage'],
  },
  {
    key: 'catalogue',
    label: 'Catalogue & garments',
    description: 'Products, categories, bulk import, garment types and size charts.',
    permissions: ['catalog.manage', 'measurements.manage_blueprints'],
  },
  {
    key: 'inventory',
    label: 'Inventory',
    description: 'Stock levels, stock counts, inter-branch transfers, spot checks, and — separately — cost prices and margins.',
    permissions: ['inventory.manage', 'inventory.count', 'transfers.manage', 'inventory.view_cost', 'inventory.spot_checks.manage'],
  },
  {
    key: 'purchasing',
    label: 'Purchasing & suppliers',
    description: 'Suppliers, the shared counterparty directory, purchase requisitions, and creating or receiving purchase orders.',
    permissions: [
      'suppliers.manage',
      'purchasing.manage',
      'purchasing.requisitions.create',
      'purchasing.requisitions.approve',
      'parties.manage',
      'planning.propagation.view',
    ],
  },
  {
    key: 'production',
    label: 'Production',
    description: 'Bills of materials, work orders, and a SKU\'s full supply-chain status.',
    permissions: ['production.manage', 'production.view_chain'],
  },
  {
    key: 'marketing',
    label: 'Marketing',
    description:
      'Automated marketing email, discounts, promo codes, gift cards, store credit, content, collections, search tuning, campaigns, on-site messaging, reviews and loyalty.',
    permissions: [
      'marketing.manage',
      'promotions.view',
      'promotions.manage',
      'giftcards.view',
      'giftcards.manage',
      'content.view',
      'content.manage',
      'collections.view',
      'collections.manage',
      'search.view',
      'search.manage',
      'campaigns.view',
      'campaigns.manage',
      'onsitemessages.view',
      'onsitemessages.manage',
      'reviews.moderate',
      'loyalty.view',
      'loyalty.manage',
    ],
  },
  {
    key: 'tax',
    label: 'Tax',
    description: 'Tax classes, rates and the pricing mode.',
    permissions: ['tax.manage'],
  },
  {
    key: 'finance',
    label: 'Finance',
    description: 'Record and edit operational expenses; issue credit/debit notes; set customer credit limits and the dunning policy; wallet adjustments and merchant-payable disputes.',
    permissions: [
      'finance.manage',
      'finance.credit-notes.create',
      'finance.credit-notes.approve',
      'finance.debit-notes.manage',
      'finance.credit-terms.manage',
      'finance.wallets.adjust',
      'finance.wallets.adjust.approve',
      'finance.merchant-payables.dispute',
      'finance.assets.depreciate',
      'finance.assets.dispose',
      'finance.settlement.view',
      'finance.settlement.reconcile',
      'finance.settlement.approve_writeoff',
      'finance.facilities.view',
      'finance.facilities.manage',
      'finance.facilities.approve_drawdown',
    ],
  },
  {
    key: 'bom',
    label: 'Manufacturing',
    description: 'Raw materials, recipes and production runs.',
    permissions: ['bom.view', 'bom.manage', 'bom.produce'],
  },
  {
    key: 'payroll',
    label: 'Payroll',
    description: "Compensation rates, leave requests, and pay runs — everyone's own view is separate, granted alongside every seeded role.",
    permissions: ['payroll.view', 'payroll.manage'],
  },
  {
    key: 'hr',
    label: 'Human resources',
    description: 'Which physical equipment is issued to which employee, the people list, positions and the rank ladder, and attendance.',
    permissions: [
      'hr.assets.manage',
      'hr.assets.writeoff',
      'hr.people.view',
      'hr.people.manage',
      'hr.attendance.view',
      'hr.attendance.record',
      'hr.attendance.reconcile',
      'hr.bulletins.view',
      'hr.bulletins.publish',
    ],
  },
  {
    key: 'organization',
    label: 'Organization structure',
    description: 'Offices, regions and departments — the tree everything else scopes access and reporting to — plus who is granted access over which unit, and the tasks assigned across it.',
    permissions: [
      'org.structure.view',
      'org.structure.manage',
      'org.access.view',
      'org.access.grant',
      'tasks.view',
      'tasks.assign',
      'tasks.close',
      'tasks.admin',
      'notify.send',
      'notify.broadcast',
      'notify.escalation.manage',
      'support.tickets.raise',
      'support.tickets.handle',
      'support.tickets.view_all',
      'support.tickets.reassign',
    ],
  },
  {
    key: 'system-admin',
    label: 'System administration',
    description: 'Settings, single sign-on, roles, user accounts and the audit log — the most sensitive group.',
    permissions: [
      'settings.manage',
      'settings.sso.manage',
      'settings.custom-fields.manage',
      'settings.embeds.manage',
      'settings.fragments.manage',
      'settings.metadata-forms.manage',
      'settings.bpmn-workflows.manage',
      'roles.manage_permissions',
      'users.manage',
      'audit.view',
      'accounting.manage_periods',
    ],
  },
  {
    key: 'ai',
    label: 'AI layer',
    description: 'Which AI providers are on, the monthly budget, the review queue every AI-generated draft passes through before it reaches a customer or a supplier, and retrieval-augmented answers over an uploaded document corpus.',
    permissions: ['ai.view', 'ai.manage', 'rag.ingest.manage', 'rag.query'],
  },
] as const;

/**
 * Today's exact access, expressed as permission grants — this is what the
 * database seed reproduces so the PBAC migration is behavior-preserving on
 * day one. ADMIN and STAFF are identical in the pre-PBAC role model, so they
 * share every entry except the two ADMIN-only administration permissions.
 */
export const ROLE_PERMISSION_SEED: Readonly<Record<UserRole, readonly PermissionKey[]>> = {
  CUSTOMER: ['account.change_own_password'],
  TAILOR: [
    'account.change_own_password',
    'payroll.view_own',
    'stitching.jobs.view_queue',
    'stitching.jobs.change_stage',
    'stitching.jobs.manage_own',
    // Broad by design, same reasoning as STAFF/ADMIN below — see this
    // key's own catalogue note.
    'hr.bulletins.view',
    'support.tickets.raise',
  ],
  STAFF: [
    'account.change_own_password',
    'payroll.view_own',
    'analytics.view',
    'reports.view',
    'organization.view',
    'tasks.view',
    'tasks.assign',
    'tasks.close',
    'notify.send',
    'hr.bulletins.view',
    'hr.bulletins.publish',
    'support.tickets.raise',
    'support.tickets.handle',
    'support.tickets.view_all',
    'crm.manage',
    'orders.manage',
    'pricing.price-lists.manage',
    'pricing.assignments.manage',
    'payments.approve',
    'pos.operate',
    'stitching.jobs.view_queue',
    'stitching.jobs.change_stage',
    'stitching.jobs.manage_all',
    'stitching.jobs.assign',
    'stitching.bookings.manage',
    'stitching.designs.manage',
    'catalog.manage',
    'inventory.manage',
    'inventory.count',
    'transfers.manage',
    'measurements.manage_blueprints',
    'suppliers.manage',
    'purchasing.manage',
    'purchasing.requisitions.create',
    'production.manage',
    'production.view_chain',
    'parties.manage',
    'finance.view',
    'finance.wallets.adjust',
    'finance.credit-notes.create',
    'finance.debit-notes.manage',
    'fulfilment.view',
    'fulfilment.manage',
    'bom.view',
    'bom.produce',
    'promotions.view',
    'promotions.manage',
    'giftcards.view',
    'content.view',
    'content.manage',
    'collections.view',
    'collections.manage',
    'search.view',
    'search.manage',
    'campaigns.view',
    'onsitemessages.view',
    'onsitemessages.manage',
    'reviews.moderate',
    'loyalty.view',
    'ai.view',
    'ai.manage',
    'rag.ingest.manage',
    'rag.query',
  ],
  ADMIN: [
    'account.change_own_password',
    'payroll.view_own',
    'payroll.view',
    'payroll.manage',
    'hr.assets.manage',
    'hr.assets.writeoff',
    'hr.people.view',
    'hr.people.manage',
    'org.structure.view',
    'org.structure.manage',
    'org.access.view',
    // 'org.access.grant' is deliberately NOT seeded here. ADMIN already
    // holds both 'org.structure.manage' and 'hr.people.manage' above —
    // adding 'org.access.grant' to the SAME role would recreate, on the one
    // role every deployment starts with, exactly the toxic pair this
    // document defines and TOXIC_PERMISSION_PAIRS refuses at
    // RolesService.create()/.update() (see ADR-045). A deployment that
    // needs to issue explicit grants creates a dedicated custom role (e.g.
    // "Access Reviewer") holding org.access.grant alone, through the
    // existing custom-roles screen — the access screen renders read-only
    // for ADMIN (org.access.view) until then, matching this document's own
    // "Solo: the grant screen never rendered" silhouette.
    'tasks.view',
    'tasks.assign',
    // Unlike org.access.grant/hr.attendance.reconcile above, tasks.close IS
    // seeded onto ADMIN alongside tasks.assign — the toxic pair the two
    // form (DECISIONS.md ADR-050) is a PER-INSTANCE check inside
    // TaskService.close(), scoped to a task whose sourceType names a
    // money-adjacent module, not a role-level refusal TOXIC_PERMISSION_PAIRS
    // would catch here. Holding both is the ordinary, safe case for every
    // other task; the instance check still refuses the one risky case
    // (self-assign, then self-close, on a money-adjacent task).
    'tasks.close',
    'tasks.admin',
    'notify.send',
    'notify.broadcast',
    'notify.escalation.manage',
    'support.tickets.raise',
    'support.tickets.handle',
    'support.tickets.view_all',
    'support.tickets.reassign',
    'hr.attendance.view',
    'hr.attendance.record',
    'hr.bulletins.view',
    'hr.bulletins.publish',
    // 'hr.attendance.reconcile' is deliberately NOT seeded here, the
    // identical reasoning as 'org.access.grant' just above: ADMIN already
    // holds 'payroll.manage', and TOXIC_PERMISSION_PAIRS refuses the two
    // together (attendance-workforce/22-attendance-shifts-leave.md's own
    // "clearing your own exception and then paying it" — DECISIONS.md
    // ADR-046). A deployment that needs to reconcile attendance creates a
    // dedicated role holding hr.attendance.reconcile without payroll.manage.
    'analytics.view',
    'reports.view',
    'organization.view',
    'organization.manage',
    'accounting.view',
    'crm.manage',
    'orders.manage',
    'pricing.price-lists.manage',
    'pricing.assignments.manage',
    'payments.approve',
    'stitching.jobs.view_queue',
    'stitching.jobs.change_stage',
    'stitching.jobs.manage_all',
    'stitching.jobs.assign',
    'stitching.bookings.manage',
    'stitching.designs.manage',
    'catalog.manage',
    'inventory.manage',
    'inventory.view_cost',
    'inventory.count',
    'transfers.manage',
    'measurements.manage_blueprints',
    'suppliers.manage',
    'purchasing.manage',
    'purchasing.requisitions.create',
    'purchasing.requisitions.approve',
    'planning.propagation.view',
    'inventory.spot_checks.manage',
    'production.manage',
    'production.view_chain',
    'parties.manage',
    'finance.view',
    'finance.manage',
    'finance.wallets.adjust',
    'finance.wallets.adjust.approve',
    'finance.merchant-payables.dispute',
    'finance.credit-notes.create',
    'finance.credit-notes.approve',
    'finance.debit-notes.manage',
    'finance.credit-terms.manage',
    'finance.assets.depreciate',
    'finance.assets.dispose',
    'finance.settlement.view',
    'finance.settlement.reconcile',
    'finance.settlement.approve_writeoff',
    'finance.facilities.view',
    'finance.facilities.manage',
    'finance.facilities.approve_drawdown',
    'fulfilment.view',
    'fulfilment.manage',
    'bom.view',
    'bom.manage',
    'bom.produce',
    'settings.manage',
    'settings.sso.manage',
    'settings.custom-fields.manage',
    'settings.embeds.manage',
    'settings.fragments.manage',
    'settings.metadata-forms.manage',
    'settings.bpmn-workflows.manage',
    'roles.manage_permissions',
    'audit.view',
    'users.manage',
    'tax.manage',
    'marketing.manage',
    'accounting.manage_periods',
    'pos.manage',
    'pos.operate',
    'pos.instalments.cancel',
    'pos.instalments.default',
    'promotions.view',
    'promotions.manage',
    'giftcards.view',
    'giftcards.manage',
    'content.view',
    'content.manage',
    'collections.view',
    'collections.manage',
    'search.view',
    'search.manage',
    'campaigns.view',
    'campaigns.manage',
    'onsitemessages.view',
    'onsitemessages.manage',
    'reviews.moderate',
    'loyalty.view',
    'loyalty.manage',
    'ai.view',
    'ai.manage',
    'rag.ingest.manage',
    'rag.query',
  ],
};

/**
 * Permissions the update-role-permissions endpoint refuses to remove from
 * ADMIN, so an admin can never edit themselves out of the Settings screen.
 * The same list gates per-user REVOKE overrides on an ADMIN-role user.
 */
export const ADMIN_LOCKED_PERMISSIONS: readonly PermissionKey[] = [
  'settings.manage',
  'roles.manage_permissions',
];

/**
 * Permission pairs a single role must never grant together
 * (access-control-identity/21-access-over-the-org-tree.md) — each pair is
 * "invent the thing, then authorise yourself over the thing": inventing an
 * org unit and granting yourself authority over it, or inventing a post and
 * posting yourself to it. Checked by RolesService.create()/.update() against
 * a role's own full permission set; a role failing this check is refused
 * outright, the same "generalisation, not a one-off special case" RolesService
 * already applies to ADMIN_LOCKED_PERMISSIONS above.
 *
 * This is why `org.access.grant` and `hr.attendance.reconcile` are each
 * seeded to no role by default — see their own notes next to
 * ROLE_PERMISSION_SEED.ADMIN below.
 */
export const TOXIC_PERMISSION_PAIRS: readonly (readonly [PermissionKey, PermissionKey])[] = [
  ['org.structure.manage', 'org.access.grant'],
  ['hr.people.manage', 'org.access.grant'],
  // attendance-workforce/22-attendance-shifts-leave.md: "clearing your own
  // exception and then paying it." payroll.manage, not the doc's own
  // 'hr.payroll.run' — see hr.attendance.reconcile's own catalogue note.
  ['hr.attendance.reconcile', 'payroll.manage'],
  // tasks-notifications-support/24-internal-notifications-meetings-escalation.md:
  // address everyone AND widen your own reach — the identical "invent the
  // thing, then authorise yourself over it" shape, for a broadcast
  // audience instead of an org-unit grant.
  ['notify.broadcast', 'org.access.grant'],
];

export const PERMISSION_EFFECTS = ['GRANT', 'REVOKE'] as const;
export type PermissionEffect = (typeof PERMISSION_EFFECTS)[number];

/** One entry in a user's permission-override set (@see UserPermission). */
export interface PermissionOverride {
  key: PermissionKey;
  effect: PermissionEffect;
}
