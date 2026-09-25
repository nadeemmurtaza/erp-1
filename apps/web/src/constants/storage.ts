/**
 * Browser storage keys.
 *
 * These were spelled out as `'yaseen.admin.access'`, `'yaseen.customer.user'`
 * and so on across four files — a client's name written into eight literals
 * nobody would think to grep for at rebranding time, because they never
 * appear on screen.
 *
 * The namespace is `newax`, the builder's name, for the same reason the
 * package scope is: it is the one word that does not change between
 * deployments. It could honestly be anything — localStorage is scoped per
 * origin, and each deployment has its own, so there is no collision to avoid.
 * What matters is that it is a constant rather than a client's name repeated
 * eight times.
 *
 * Renaming the namespace signs everyone out, since the old keys stop being
 * read. That is correct for a new client — different deployment, empty
 * storage — but it is the reason not to change it on a whim for a live shop.
 */
const NS = 'newax';

export const STORAGE_KEYS = {
  admin: {
    access: `${NS}.admin.access`,
    refresh: `${NS}.admin.refresh`,
    user: `${NS}.admin.user`,
    /** Which sidebar groups the person has collapsed. */
    navGroups: `${NS}.admin.navGroups`,
    /**
     * Which dashboard card groups are collapsed (10-admin-dashboard.md
     * WO-A.4). The brief's own key literal is `yaseen.admin.dashboard.collapsed`
     * — this file's own namespace note above is why that isn't used verbatim:
     * `NS` stands in for the client's name everywhere else here.
     */
    dashboardCollapsed: `${NS}.admin.dashboard.collapsed`,
  },
  customer: {
    access: `${NS}.customer.access`,
    refresh: `${NS}.customer.refresh`,
    user: `${NS}.customer.user`,
  },
  /** Anonymous visitor id and first-touch attribution. */
  analytics: {
    session: `${NS}.session_id`,
    utmSource: `${NS}.utm_source`,
  },
  /** Saved products for a signed-out visitor; merged into the account on sign-in. */
  wishlist: `${NS}.wishlist_ids`,
  /**
   * Guest order and booking lookups, per record.
   *
   * A guest has no account to read an order back from, so placing one
   * remembers its number for the confirmation page to show. sessionStorage,
   * not local: it should not outlive the tab.
   */
  guestOrder: (number: string) => `${NS}.order.${number}`,
  guestBooking: (number: string) => `${NS}.stitching.${number}`,
  /** WO-8.6 — dismissed on-site message ids, so a closed banner or popup stays closed. */
  onsiteMessagesDismissed: `${NS}.onsite_messages.dismissed`,
} as const;
