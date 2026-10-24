/**
 * On-site messaging kinds and popup triggers (WO-8.6), mirroring
 * `OnsiteMessageKind`/`OnsitePopupTrigger` in
 * apps/api/prisma/schema/onsite-messaging.prisma. Kept as string const
 * arrays here (not re-exported from the generated Prisma client) so the
 * storefront runtime component and the admin form share one list without
 * either importing the API's generated client.
 */
export const ONSITE_MESSAGE_KINDS = [
  'ANNOUNCEMENT_BAR',
  'POPUP',
  'NEWSLETTER_CAPTURE',
  'COOKIE_CONSENT',
] as const;

export type OnsiteMessageKind = (typeof ONSITE_MESSAGE_KINDS)[number];

export const ONSITE_POPUP_TRIGGERS = ['IMMEDIATE', 'TIMED', 'EXIT_INTENT'] as const;

export type OnsitePopupTrigger = (typeof ONSITE_POPUP_TRIGGERS)[number];

/** What the public `/onsite-messages/active` endpoint hands the storefront runtime. */
export interface ActiveOnsiteMessage {
  id: string;
  kind: OnsiteMessageKind;
  trigger: OnsitePopupTrigger;
  delaySeconds: number | null;
  linkUrl: string | null;
  headline: string | null;
  body: string | null;
  ctaLabel: string | null;
}
