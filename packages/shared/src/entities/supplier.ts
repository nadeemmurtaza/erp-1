/**
 * Organization-shaped data in this system today is vendor-side: `Supplier`.
 * There is no customer-facing "company account" model — a B2B org would be a
 * real, separate feature (MULTI-SECTOR.md's B5/marketplace track), not
 * something to fake getters for ahead of it existing. These getters cover
 * what's actually in the schema: a supplier record purchasing.prisma owns.
 *
 * Named for what they are (supplier-shaped) rather than "organization" now
 * that `Organization` names something real — RETAIL-ERP.md's top tier, the
 * owner's group (apps/api/prisma/schema/organization.prisma, WO-18.3). Was
 * `entities/organization.ts` until that rename; unused outside its own spec,
 * so the move needed no call-site updates.
 */
export interface SupplierLike {
  name: string;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  leadTimeDays?: number;
  isActive?: boolean;
}

export function getSupplierName(supplier: SupplierLike): string {
  return supplier.name;
}

/** The person to call at this supplier, if one is on file — falls back to the supplier name. */
export function getSupplierContactLabel(supplier: SupplierLike): string {
  return supplier.contactName?.trim() || supplier.name;
}

/** "3 Lahore St, Lahore" — address plus city, comma-joined; either may be absent. */
export function getSupplierFormattedLocation(supplier: SupplierLike): string | null {
  const parts = [supplier.address, supplier.city].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : null;
}

/** Typical days from PO to delivery — feeds reorder-suggestion ETAs. */
export function getSupplierLeadTimeDays(supplier: SupplierLike): number {
  return supplier.leadTimeDays ?? 0;
}
