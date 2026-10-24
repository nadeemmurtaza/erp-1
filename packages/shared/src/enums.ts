/**
 * Enum values mirrored from the Prisma schema. They live here (rather than being
 * imported from @prisma/client) so the web and mobile apps can use them without
 * pulling in the database client.
 *
 * Any change here must be made in apps/api/prisma/schema/*.prisma too; the
 * `enums.spec.ts` test in apps/api guards the two from drifting apart.
 */

export const USER_ROLES = ['CUSTOMER', 'STAFF', 'TAILOR', 'ADMIN'] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** Roles allowed into /admin. */
export const BACK_OFFICE_ROLES: readonly UserRole[] = ['STAFF', 'TAILOR', 'ADMIN'];

/**
 * GOODS/SERVICE/DIGITAL are the sector-neutral kinds (B1, MULTI-SECTOR.md) —
 * a grocery or electronics deployment has no reason to touch STITCHED/
 * UNSTITCHED/STITCHING_SERVICE, which stay only for the existing apparel
 * catalogue. Order matches the Prisma enum in
 * apps/api/prisma/schema/catalog.prisma.
 */
export const PRODUCT_KINDS = [
  'GOODS',
  'SERVICE',
  'DIGITAL',
  'STITCHED',
  'UNSTITCHED',
  'STITCHING_SERVICE',
] as const;
export type ProductKind = (typeof PRODUCT_KINDS)[number];

export const PRODUCT_STATUSES = ['DRAFT', 'ACTIVE', 'ARCHIVED'] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

/** Matches the Prisma `OptionDisplay` enum in catalog.prisma (WO-3.1). */
export const OPTION_DISPLAYS = ['BUTTON', 'DROPDOWN', 'SWATCH', 'TEXT'] as const;
export type OptionDisplay = (typeof OPTION_DISPLAYS)[number];

export const ORDER_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'PROCESSING',
  'READY_TO_SHIP',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
  'RETURNED',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_STATUSES = [
  'PENDING',
  'AWAITING_APPROVAL',
  'PAID',
  'FAILED',
  'REFUNDED',
  'CANCELLED',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** WO-9.4 (09-ai-layer.md). Matches the Prisma `CodRiskAction` enum in orders.prisma. */
export const COD_RISK_ACTIONS = ['AUTO_CONFIRM', 'CONFIRMATION_CALL', 'REQUIRE_ADVANCE_PAYMENT'] as const;
export type CodRiskAction = (typeof COD_RISK_ACTIONS)[number];

export const STITCHING_STAGES = [
  'RECEIVED',
  'CUTTING',
  'STITCHING',
  'QC',
  'READY',
  'DISPATCHED',
] as const;
export type StitchingStage = (typeof STITCHING_STAGES)[number];

export const LEAD_STATUSES = ['NEW', 'CONTACTED', 'QUOTED', 'WON', 'LOST'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const INTERACTION_KINDS = [
  'CALL',
  'WHATSAPP',
  'EMAIL',
  'SMS',
  'VISIT',
  'NOTE',
  'COMPLAINT',
] as const;
export type InteractionKind = (typeof INTERACTION_KINDS)[number];

export const MEASUREMENT_UNITS = ['INCH', 'CM'] as const;
export type MeasurementUnit = (typeof MEASUREMENT_UNITS)[number];

/**
 * Stage order is a straight line: a job may only advance to the next stage, or
 * be sent back one stage after a failed QC. Enforced in the stitching module.
 */
export function nextStage(stage: StitchingStage): StitchingStage | null {
  const index = STITCHING_STAGES.indexOf(stage);
  return index >= 0 && index < STITCHING_STAGES.length - 1
    ? (STITCHING_STAGES[index + 1] as StitchingStage)
    : null;
}

export function previousStage(stage: StitchingStage): StitchingStage | null {
  const index = STITCHING_STAGES.indexOf(stage);
  return index > 0 ? (STITCHING_STAGES[index - 1] as StitchingStage) : null;
}

/**
 * architecture-patterns/104-jsonb-eav-extensibility.md — the closed,
 * code-known list of entities `CustomFieldDefinition.entityType` may name.
 * Adding one is a small, reviewed code change (a Prisma column, a service
 * branch, an admin-form-rendering branch), never an arbitrary string a
 * client could point at a table this mechanism was never wired into.
 */
export const CUSTOM_FIELD_ENTITY_TYPES = ['Supplier'] as const;
export type CustomFieldEntityType = (typeof CUSTOM_FIELD_ENTITY_TYPES)[number];

export const CUSTOM_FIELD_VALUE_TYPES = ['TEXT', 'NUMBER', 'BOOLEAN', 'DATE'] as const;
export type CustomFieldValueType = (typeof CUSTOM_FIELD_VALUE_TYPES)[number];
