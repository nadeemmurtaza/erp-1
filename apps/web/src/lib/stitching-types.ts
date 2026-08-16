import type { StitchingStage } from '@yaseen/shared';

/**
 * The shapes the stitching endpoints return.
 *
 * A job attaches to either an order line or a standalone booking, so both
 * relations are optional and exactly one of them is present. The queue screens
 * read whichever is there — they do not care which door the job came in through.
 */

export interface MeasurementSnapshot {
  label?: string;
  values?: Record<string, number>;
  /** Guest bookings type measurements in directly, with no profile wrapper. */
  [key: string]: unknown;
}

export interface JobEvent {
  id: string;
  fromStage: StitchingStage | null;
  toStage: StitchingStage;
  note: string | null;
  photoUrl: string | null;
  createdAt: string;
  actor?: { id: string; firstName: string | null } | null;
}

export interface JobGarmentType {
  id: string;
  key: string;
  labelEn: string;
  labelUr: string;
}

export interface StitchingJob {
  id: string;
  number: string;
  stage: StitchingStage;
  priority: number;
  dueAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  instructions: string | null;
  measurementSnapshot: MeasurementSnapshot | null;
  optionsSnapshot: Array<{ groupLabelEn?: string; labelEn?: string }> | null;
  garmentType: JobGarmentType;
  assignedTailorId: string | null;
  assignedTailor: { id: string; firstName: string | null; lastName?: string | null } | null;
  events: JobEvent[];
  orderItem?: {
    order: {
      id: string;
      number: string;
      guestName: string | null;
      guestPhone: string | null;
      status: string;
      placedAt: string;
    };
  } | null;
  stitchingOrder?: {
    id: string;
    number: string;
    guestName: string | null;
    guestPhone: string | null;
    status: string;
  } | null;
}

export interface Workload {
  byStage: Array<{ stage: StitchingStage; count: number }>;
  tailors: Array<{
    id: string;
    name: string;
    capacityPerWeek: number;
    openJobs: number;
  }>;
  unassigned: number;
}

export type StitchingOrderStatus =
  | 'DRAFT'
  | 'AWAITING_FABRIC'
  | 'FABRIC_RECEIVED'
  | 'IN_PRODUCTION'
  | 'READY'
  | 'COMPLETED'
  | 'CANCELLED';

export interface StitchingBooking {
  id: string;
  number: string;
  status: StitchingOrderStatus;
  guestName: string | null;
  guestPhone: string | null;
  guestEmail: string | null;
  fabricNotes: string | null;
  staffNotes: string | null;
  quotedFee: number | null;
  fabricReceivedAt: string | null;
  promisedAt: string | null;
  createdAt: string;
  pickupAddress: Record<string, unknown> | null;
  deliveryAddress: Record<string, unknown> | null;
  jobs: Array<
    Pick<
      StitchingJob,
      | 'id'
      | 'number'
      | 'stage'
      | 'dueAt'
      | 'instructions'
      | 'measurementSnapshot'
      | 'garmentType'
      | 'events'
    > & { assignedTailor: { id: string; firstName: string | null } | null }
  >;
}

/** The customer's own name for each stage, in the order the workshop works. */
export const STAGE_LABELS: Record<StitchingStage, string> = {
  RECEIVED: 'Received',
  CUTTING: 'Cutting',
  STITCHING: 'Stitching',
  QC: 'Quality check',
  READY: 'Ready',
  DISPATCHED: 'Dispatched',
};

export const BOOKING_STATUS_LABELS: Record<StitchingOrderStatus, string> = {
  DRAFT: 'Draft',
  AWAITING_FABRIC: 'Awaiting fabric',
  FABRIC_RECEIVED: 'Fabric received',
  IN_PRODUCTION: 'In production',
  READY: 'Ready',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

/** Reads the measurements off a snapshot, whichever shape it was stored in. */
export function measurementValues(
  snapshot: MeasurementSnapshot | null | undefined,
): Array<[string, number]> {
  if (!snapshot) return [];

  const values =
    snapshot.values && typeof snapshot.values === 'object'
      ? snapshot.values
      : (snapshot as Record<string, unknown>);

  return Object.entries(values)
    .filter(([key, value]) => key !== 'label' && typeof value === 'number')
    .map(([key, value]) => [key, value as number]);
}

export function fieldLabel(key: string): string {
  return key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');
}

/** Who the job is for, from whichever relation carries the customer. */
export function jobCustomer(job: StitchingJob): { name: string; reference: string } {
  if (job.orderItem?.order) {
    return {
      name: job.orderItem.order.guestName ?? 'Customer',
      reference: job.orderItem.order.number,
    };
  }
  if (job.stitchingOrder) {
    return {
      name: job.stitchingOrder.guestName ?? 'Customer',
      reference: job.stitchingOrder.number,
    };
  }
  return { name: 'Customer', reference: '—' };
}
