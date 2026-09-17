import { BRAND } from '@newax/shared';

/**
 * The shop's own details, flattened for the ~60 call sites that read them.
 *
 * These values used to be typed out here, which meant the API and the mobile
 * app — neither of which can import from apps/web — kept their own copies of
 * the same facts. Same fork as the palette and the radius, one level up: the
 * support email appeared in three files, and changing it in one was not
 * changing it.
 *
 * They live in packages/shared/src/brand.ts now, the single file a rebrand
 * edits. This stays as a flat view because `businessProfile.email` reads
 * better at a call site than `BRAND.contact.email`, and because renaming 60
 * usages to prove a point would be churn.
 */
export const businessProfile = {
  // Identity
  name: BRAND.identity.name,
  shortName: BRAND.identity.shortName,
  tagline: BRAND.identity.tagline,
  domain: BRAND.identity.domain,
  url: BRAND.identity.url,

  // Contact
  email: BRAND.contact.email,
  phone: BRAND.contact.phone,
  whatsapp: BRAND.contact.whatsapp,

  // Location
  address: BRAND.contact.address,
  city: BRAND.contact.city,
  country: BRAND.contact.country,

  // Operations
  workingHours: BRAND.contact.workingHours,
  supportResponseTime: BRAND.contact.supportResponseTime,

  socials: BRAND.socials,

  // Legal — the label travels with the number because a Pakistani invoice
  // says NTN where a UAE one says TRN.
  taxLabel: BRAND.legal.taxLabel,
  taxNumber: BRAND.legal.taxNumber,
  registrationLabel: BRAND.legal.registrationLabel,
  registrationNumber: BRAND.legal.registrationNumber,

  banking: BRAND.banking,

  currency: {
    code: BRAND.locale.currency,
    symbol: BRAND.locale.currencySymbol,
  },

  shipping: {
    standardDeliveryTime: BRAND.commerce.standardDeliveryTime,
    stitchingTurnaroundTime: BRAND.commerce.stitchingTurnaroundTime,
    freeShippingThreshold: BRAND.commerce.freeShippingThreshold,
  },
} as const;
