/**
 * Organization-shaped data in this system today is vendor-side: `Supplier`.
 * There is no customer-facing "company account" model — a B2B org would be a
 * real, separate feature (MULTI-SECTOR.md's B5/marketplace track), not
 * something to fake getters for ahead of it existing. These getters cover
 * what's actually in the schema: a supplier record purchasing.prisma owns.
 */
export interface OrganizationLike {
  name: string;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  leadTimeDays?: number;
  isActive?: boolean;
}

export function getOrganizationName(org: OrganizationLike): string {
  return org.name;
}

/** The person to call at this supplier, if one is on file — falls back to the org name. */
export function getOrganizationContactLabel(org: OrganizationLike): string {
  return org.contactName?.trim() || org.name;
}

/** "3 Lahore St, Lahore" — address plus city, comma-joined; either may be absent. */
export function getOrganizationFormattedLocation(org: OrganizationLike): string | null {
  const parts = [org.address, org.city].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : null;
}

/** Typical days from PO to delivery — feeds reorder-suggestion ETAs. */
export function getOrganizationLeadTimeDays(org: OrganizationLike): number {
  return org.leadTimeDays ?? 0;
}
