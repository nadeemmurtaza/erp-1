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
    accountAddresses: '/account/addresses',
    accountMeasurements: '/account/measurements',
    orders: '/orders',
    order: (number: string) => `/orders/${number}`,
    /** The customer's own return requests — distinct from the static /returns policy page below. */
    accountReturns: '/account/returns',
    accountReturnNew: (orderNumber: string) => `/account/returns/new?number=${encodeURIComponent(orderNumber)}`,
    accountReturn: (id: string) => `/account/returns/${id}`,

    // Static content pages.
    contact: '/contact',
    story: '/story',
    shipping: '/shipping',
    sizeGuide: '/size-guide',
    returns: '/returns',
    terms: '/terms',
    privacy: '/privacy',
  },

  admin: {
    dashboard: '/admin',
    account: '/admin/account',
    login: '/admin/login',

    products: '/admin/products',
    productNew: '/admin/products/new',
    product: (id: string) => `/admin/products/${id}`,
    productInsights: '/admin/products/insights',
    categories: '/admin/categories',
    brands: '/admin/brands',
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

    inventory: '/admin/inventory',
    inventoryCounts: '/admin/inventory/counts',
    inventoryReorder: '/admin/inventory/reorder',
    inventorySlowMovers: '/admin/inventory/slow-movers',
    inventoryInsights: '/admin/inventory/insights',

    purchaseOrders: '/admin/purchase-orders',
    purchaseOrderNew: '/admin/purchase-orders/new',
    purchaseOrder: (id: string) => `/admin/purchase-orders/${id}`,
    purchaseOrderReceive: (id: string) => `/admin/purchase-orders/${id}/receive`,
    purchasingSpend: '/admin/purchase-orders/spend',
    suppliers: '/admin/suppliers',
    supplier: (id: string) => `/admin/suppliers/${id}`,

    /** Inter-branch and org-central stock transfers (RETAIL-ERP.md R4, WO-22.1/22.2/22.3, WO-23.3d). Off by default — `transfers` module. */
    transfers: '/admin/transfers',
    transferNew: '/admin/transfers/new',
    transfer: (id: string) => `/admin/transfers/${id}`,

    stitching: '/admin/stitching',
    stitchingBookings: '/admin/stitching/bookings',
    stitchingBooking: (id: string) => `/admin/stitching/bookings/${id}`,
    stitchingJob: (id: string) => `/admin/stitching/jobs/${id}`,
    workshopInsights: '/admin/workshop/insights',
    garments: '/admin/garments',
    garment: (id: string) => `/admin/garments/${id}`,
    designs: '/admin/designs',
    design: (id: string) => `/admin/designs/${id}`,

    contacts: '/admin/contacts',
    contactSearch: (q: string) => `/admin/contacts?q=${encodeURIComponent(q)}`,
    customerInsights: '/admin/customers/insights',
    leads: '/admin/leads',
    inbox: '/admin/inbox',
    marketing: '/admin/marketing',
    insights: '/admin/insights',
    orderInsights: '/admin/orders/insights',
    reports: '/admin/reports',
    tax: '/admin/tax',
    settings: '/admin/settings',
    users: '/admin/users',
    user: (id: string) => `/admin/users/${id}`,
    emailTemplates: '/admin/email-templates',
    emailAccounts: '/admin/email-accounts',
    /** `new` is a real id here: the editor route handles creating and editing. */
    emailAccount: (id: string) => `/admin/email-accounts/${id}`,

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
