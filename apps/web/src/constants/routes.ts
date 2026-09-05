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
    categories: '/admin/categories',
    brands: '/admin/brands',
    import: '/admin/import',

    orders: '/admin/orders',
    order: (id: string) => `/admin/orders/${id}`,
    payments: '/admin/payments',

    inventory: '/admin/inventory',
    inventoryCounts: '/admin/inventory/counts',
    inventoryReorder: '/admin/inventory/reorder',
    inventorySlowMovers: '/admin/inventory/slow-movers',

    purchaseOrders: '/admin/purchase-orders',
    purchaseOrderNew: '/admin/purchase-orders/new',
    purchaseOrder: (id: string) => `/admin/purchase-orders/${id}`,
    suppliers: '/admin/suppliers',
    supplier: (id: string) => `/admin/suppliers/${id}`,

    stitching: '/admin/stitching',
    stitchingBookings: '/admin/stitching/bookings',
    stitchingBooking: (id: string) => `/admin/stitching/bookings/${id}`,
    stitchingJob: (id: string) => `/admin/stitching/jobs/${id}`,
    garments: '/admin/garments',
    designs: '/admin/designs',

    contacts: '/admin/contacts',
    leads: '/admin/leads',
    inbox: '/admin/inbox',
    marketing: '/admin/marketing',
    reports: '/admin/reports',
    tax: '/admin/tax',
    settings: '/admin/settings',
    users: '/admin/users',
    user: (id: string) => `/admin/users/${id}`,
    emailTemplates: '/admin/email-templates',
    emailAccounts: '/admin/email-accounts',
  },
} as const;
