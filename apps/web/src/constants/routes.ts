/**
 * Every internal path the app links to, in one place.
 *
 * These were 32 string literals spread across the codebase, which is fine
 * until a route moves: renaming `/orders` then means grepping for a quoted
 * string and hoping every spelling was found, with a dead link as the only
 * symptom and no compile error anywhere.
 *
 * STOREFRONT paths are locale-relative and must be passed to the `Link` from
 * `@/i18n/navigation`, which prefixes `/en` or `/ur`. ADMIN paths are absolute
 * and use `next/link` — admin is English-only by design (House Rule 6), so a
 * locale prefix there would be wrong.
 *
 * Functions rather than template literals wherever a path takes an id, so the
 * call site cannot forget a segment or interpolate an object by accident.
 */

export const ROUTES = {
  storefront: {
    home: '/',
    shop: '/shop',
    shopUnstitched: '/shop?category=unstitched',
    shopReadyToWear: '/shop?category=ready-to-wear',
    shopStitchingServices: '/shop?kind=STITCHING_SERVICE',
    product: (slug: string) => `/product/${slug}`,
    cart: '/cart',
    checkout: '/checkout',
    wishlist: '/wishlist',
    stitching: '/stitching',
    stitchingOrder: (number: string) => `/stitching/${number}`,

    login: '/login',
    register: '/register',
    forgotPassword: '/forgot-password',
    resetPassword: '/reset-password',
    verifyEmail: '/verify-email',
    unsubscribe: '/unsubscribe',

    account: '/account',
    accountOverview: '/account/overview',
    accountAddresses: '/account/addresses',
    accountMeasurements: '/account/measurements',
    accountReturns: '/account/returns',
    accountReviews: '/account/reviews',
    accountCredit: '/account/credit',
    accountLoyalty: '/account/loyalty',
    /** doc 155 — off by default (module: 'wallet'); see dashboard-nav.tsx's own module gate. */
    accountWallet: '/account/wallet',
    /** 149-b2b-accounts-approvals-sector-packs.md — off by default (module: 'accounts'). */
    accountB2B: '/account/b2b',
    accountNotifications: '/account/notifications',
    /** Personal API keys for the customer's own data (163-personal-api-keys.md). */
    accountApiKeys: '/account/api-keys',
    orders: '/orders',
    order: (number: string) => `/orders/${number}`,
    orderInvoice: (number: string) => `/orders/${number}/invoice`,
    /** The customer's own return requests — distinct from the static /returns policy page below. */
    accountReturnNew: (orderNumber: string) => `/account/returns/new?number=${encodeURIComponent(orderNumber)}`,
    accountReturn: (id: string) => `/account/returns/${id}`,
    /** 148-external-customer-support-portal.md WO-148.4. */
    accountSupport: '/account/support',
    accountSupportNew: '/account/support/new',
    accountSupportTicket: (id: string) => `/account/support/${id}`,

    // Static content pages.
    contact: '/contact',
    story: '/story',
    shipping: '/shipping',
    sizeGuide: '/size-guide',
    returns: '/returns',
    terms: '/terms',
    privacy: '/privacy',
    /** 158-serialized-unit-tracking.md §3 — public warranty-verify lookup. */
    verifyPurchase: '/verify-purchase',

    // CMS-driven (WO-8.1).
    blog: '/blog',
    blogPost: (slug: string) => `/blog/${slug}`,
    page: (slug: string) => `/pages/${slug}`,
    collections: '/collections',
    collection: (slug: string) => `/collections/${slug}`,
  },

  admin: {
    dashboard: '/admin',
    account: '/admin/account',
    /** Your own personal API keys (163-personal-api-keys.md). */
    accountApiKeys: '/admin/account/api-keys',
    login: '/admin/login',
    /** The manager action hub's overflow screen (admin-platform/44-manager-action-hub.md WO-44.4). */
    myActions: '/admin/my-actions',

    /** 61-policy-communications-bulletin.md WO-61.5. */
    bulletins: '/admin/bulletins',
    bulletinNew: '/admin/bulletins/new',

    /** 64-help-desk-support-ticketing.md WO-64.5. */
    supportTickets: '/admin/support/tickets',
    supportTicketNew: '/admin/support/tickets/new',
    supportTicket: (id: string) => `/admin/support/tickets/${id}`,
    supportCustomerTickets: '/admin/support/customer-tickets',
    supportCustomerTicket: (id: string) => `/admin/support/customer-tickets/${id}`,

    /** 165-cross-tenant-marketplace-directory.md — off by default (module: 'marketplace'). */
    marketplace: '/admin/marketplace',
    products: '/admin/products',
    productNew: '/admin/products/new',
    product: (id: string) => `/admin/products/${id}`,
    /** Retired hand-built page (10-admin-dashboard.md WO-D.3/E.2) — now the analytics report of the same data. */
    productInsights: '/admin/analytics/products/top-sellers',
    categories: '/admin/categories',
    brands: '/admin/brands',
    /** 150-product-kitting-bundles.md WO-150.6. */
    bundles: '/admin/bundles',
    optionTemplates: '/admin/options',
    seo: '/admin/seo',
    import: '/admin/import',

    orders: '/admin/orders',
    order: (id: string) => `/admin/orders/${id}`,
    payments: '/admin/payments',

    shipments: '/admin/fulfilment/shipments',
    manifests: '/admin/fulfilment/manifests',
    tracking: '/admin/fulfilment/tracking',
    rto: '/admin/fulfilment/rto',
    returns: '/admin/fulfilment/returns',
    return: (id: string) => `/admin/fulfilment/returns/${id}`,
    shippingSettings: '/admin/settings/shipping',

    finance: '/admin/finance',
    financeMargins: '/admin/finance/margins',
    financeCashFlow: '/admin/finance/cash-flow',
    financeUnitEconomics: '/admin/finance/unit-economics',
    financeExpenses: '/admin/finance/expenses',
    /** Bulk expense onboarding (admin-platform/72-fragmented-tool-consolidation-import.md WO-72.4). */
    financeExpensesImport: '/admin/finance/expenses/import',

    /** 04-finance.md WO-4.6. */
    fiscalPeriods: '/admin/accounting/fiscal-periods',

    /** 145-receivables-credit-limits-dunning.md. */
    creditNotes: '/admin/credit-notes',
    creditNoteNew: '/admin/credit-notes/new',
    creditNote: (id: string) => `/admin/credit-notes/${id}`,
    debitNotes: '/admin/debit-notes',
    debitNoteNew: '/admin/debit-notes/new',
    debitNote: (id: string) => `/admin/debit-notes/${id}`,
    creditTerms: '/admin/credit-terms',
    dunningPolicy: '/admin/dunning-policy',
    statements: '/admin/statements',
    /** 149-b2b-accounts-approvals-sector-packs.md. */
    b2bAccounts: '/admin/b2b-accounts',

    /** 49-financial-institution-settlement-partnerships.md. */
    settlements: '/admin/settlements',
    settlementBatch: (id: string) => `/admin/settlements/${id}`,

    /** 167-bank-facility-management.md. */
    bankFacilities: '/admin/bank-facilities',
    bankFacility: (id: string) => `/admin/bank-facilities/${id}`,

    /** hr-people-org/19-org-structure-offices-departments.md. */
    orgStructure: '/admin/org-structure',
    /** access-control-identity/21-access-over-the-org-tree.md WO-21.6 — one access screen per unit, reached by clicking from the tree. */
    orgUnitAccess: (unitId: string) => `/admin/org-structure/${unitId}/access`,
    /** hr-people-org/20-people-positions-ranks.md. */
    people: '/admin/people',

    /** attendance-workforce/22-attendance-shifts-leave.md WO-22.5 — the reconcile screen. */
    attendance: '/admin/attendance',
    /** Self-punch — every signed-in admin, no permission required (this document's own "Solo: self punch on one screen" silhouette). */
    myAttendance: '/admin/my-attendance',

    bom: '/admin/bom',

    /** The card registry's own detail tree (10-admin-dashboard.md D3) — one catch-all route, 25 config objects, not 25 hand-rolled pages. */
    analytics: '/admin/analytics',
    analyticsReport: (slug: string) => `/admin/analytics/${slug}`,
    /** 113-micro-frontend-embedding.md — every active EmbeddedWidget, `analytics.view`. */
    embeds: '/admin/embeds',

    inventory: '/admin/inventory',
    inventoryCounts: '/admin/inventory/counts',
    inventoryReorder: '/admin/inventory/reorder',
    inventorySlowMovers: '/admin/inventory/slow-movers',
    /** Retired hand-built page (WO-D.4/E.2) — now the analytics report. */
    inventoryInsights: '/admin/analytics/inventory/valuation',
    /** 32-lots-batch-expiry-fefo.md. */
    lots: '/admin/inventory/lots',
    lot: (id: string) => `/admin/inventory/lots/${id}`,
    /** 158-serialized-unit-tracking.md. Keyed by serialNumber, not id — the API's own identifier for a unit. */
    serials: '/admin/inventory/serials',
    serial: (serialNumber: string) => `/admin/inventory/serials/${encodeURIComponent(serialNumber)}`,

    purchaseOrders: '/admin/purchase-orders',
    purchaseOrderNew: '/admin/purchase-orders/new',
    purchaseOrder: (id: string) => `/admin/purchase-orders/${id}`,
    purchaseOrderReceive: (id: string) => `/admin/purchase-orders/${id}/receive`,
    /** Retired hand-built page (WO-D.2/E.2) — now the analytics report. */
    purchasingSpend: '/admin/analytics/purchasing/spend',
    suppliers: '/admin/suppliers',
    /** 144-supply-chain-resilience-planning-engine.md. */
    resilience: '/admin/resilience',
    supplier: (id: string) => `/admin/suppliers/${id}`,
    tradingPartners: '/admin/trading-partners',
    tradingPartner: (id: string) => `/admin/trading-partners/${id}`,
    /** 56-overdue-invoices-counter.md WO-56.2 — invoices issued to trading partners. */
    invoices: '/admin/invoices',
    invoicesOverdue: '/admin/invoices?overdue=true',

    /** 152-purchase-requisition.md. A request to buy, distinct from the PO it may become. */
    requisitions: '/admin/requisitions',
    requisitionNew: '/admin/requisitions/new',
    requisition: (id: string) => `/admin/requisitions/${id}`,

    /** 156-single-employee-branch-loss-prevention.md. */
    inventoryVariancesByShift: '/admin/inventory/variances/by-shift',
    spotChecks: '/admin/inventory/spot-checks',
    spotCheck: (id: string) => `/admin/inventory/spot-checks/${id}`,
    suspiciousTraffic: '/admin/analytics/suspicious-traffic',

    /** Inter-branch and org-central stock transfers (RETAIL-ERP.md R4, WO-22.1/22.2/22.3, WO-23.3d). Off by default — `transfers` module. */
    transfers: '/admin/transfers',
    transferNew: '/admin/transfers/new',
    transfer: (id: string) => `/admin/transfers/${id}`,

    /** doc 155 — off by default (`wallet` module); see DECISIONS.md. */
    wallets: '/admin/wallet',
    merchantPayables: '/admin/merchant-payables',
    merchantPayable: (id: string) => `/admin/merchant-payables/${id}`,

    stitching: '/admin/stitching',
    stitchingBookings: '/admin/stitching/bookings',
    stitchingBooking: (id: string) => `/admin/stitching/bookings/${id}`,
    stitchingJob: (id: string) => `/admin/stitching/jobs/${id}`,
    /** Retired hand-built page (WO-D.6/E.2) — now the analytics report. */
    workshopInsights: '/admin/analytics/workshop/output',
    garments: '/admin/garments',
    garment: (id: string) => `/admin/garments/${id}`,
    designs: '/admin/designs',
    design: (id: string) => `/admin/designs/${id}`,

    contacts: '/admin/contacts',
    contactSearch: (q: string) => `/admin/contacts?q=${encodeURIComponent(q)}`,
    /** Bulk customer onboarding (admin-platform/72-fragmented-tool-consolidation-import.md WO-72.4). */
    contactsImport: '/admin/contacts/import',
    /** Retired hand-built page (WO-D.5/E.2) — now the analytics report. */
    customerInsights: '/admin/analytics/customers/overview',
    leads: '/admin/leads',
    inbox: '/admin/inbox',
    marketing: '/admin/marketing',
    content: '/admin/content',
    collections: '/admin/collections',
    collection: (id: string) => `/admin/collections/${id}`,
    search: '/admin/search',
    campaigns: '/admin/campaigns',
    campaign: (id: string) => `/admin/campaigns/${id}`,
    segments: '/admin/segments',
    onsiteMessages: '/admin/onsite-messages',
/** Retired hand-built tabbed page (E.2) — now the analytics report index. */
    insights: '/admin/analytics',
    /** Retired hand-built page (WO-D.1/E.2) — now the analytics report. */
    orderInsights: '/admin/analytics/orders/overview',
    reports: '/admin/reports',
    tax: '/admin/tax',
    settings: '/admin/settings',
    /** Single sign-on connections (161-sso-identity-federation.md) — `settings.sso.manage`. */
    ssoConnections: '/admin/settings/sso',
    /** `new` is a real id here: the editor route handles creating and editing. */
    ssoConnection: (id: string) => `/admin/settings/sso/${id}`,
    users: '/admin/users',
    user: (id: string) => `/admin/users/${id}`,
    /** Every account's API keys — read and revoke only, `users.manage`. */
    usersApiKeys: '/admin/users/api-keys',
    emailTemplates: '/admin/email-templates',
    emailAccounts: '/admin/email-accounts',
    /** `new` is a real id here: the editor route handles creating and editing. */
    emailAccount: (id: string) => `/admin/email-accounts/${id}`,
    /** doc 14 — invisible unless this deployment's `managed-services` module
     *  is on (an agency-managed delivery only; gated in nav-registry.ts). */
    managedServices: '/admin/managed-services',

    /**
     * The three-level admin shell (RETAIL-ERP.md R19, WO-18.5) — invisible
     * for every deployment today (`organization` module off by default,
     * gated in nav-registry.ts). `organization` has no id: it resolves the
     * caller's own scope and redirects to whichever of the three below is
     * theirs.
     */
    organization: '/admin/o',
    organizationOrg: (orgId: string) => `/admin/o/${orgId}`,
    organizationBrand: (brandId: string) => `/admin/b/${brandId}`,
    organizationBranch: (branchId: string) => `/admin/br/${branchId}`,
    /** Grant/revoke who is a brand or branch admin (WO-18.6) — ORG-scoped only. */
    organizationAccess: (orgId: string) => `/admin/o/${orgId}/access`,
    /** R9's quarantine — a fact that applied but violates its origin's BrandPolicy switch (WO-23.3c/e). */
    organizationPolicyQuarantine: (orgId: string) => `/admin/o/${orgId}/policy-quarantine`,
  },
} as const;
