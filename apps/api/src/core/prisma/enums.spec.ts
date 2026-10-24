import { PRODUCT_KINDS } from '@newax/shared';
import {
  InteractionKind,
  LeadStatus,
  MeasurementUnit,
  OrderStatus,
  PaymentStatus,
  ProductKind,
  ProductStatus,
  StitchingStage,
  UserRole,
} from './client';

/**
 * packages/shared/src/enums.ts hand-duplicates a handful of Prisma enums so
 * the web and mobile apps can use them without pulling in the database
 * client — its own doc comment promises this test exists to catch the two
 * drifting apart. It didn't, until P1-9: PRODUCT_KINDS had silently fallen
 * behind the Prisma enum (missing GOODS/SERVICE/DIGITAL, added when B1 was
 * closed), which meant every admin/API entry point that validated a
 * product's `kind` against the shared constant rejected the very values B1
 * added to the schema for it.
 */
describe('shared enums stay in sync with the Prisma schema', () => {
  const cases: Array<[string, readonly string[], Record<string, string>]> = [
    ['PRODUCT_KINDS <-> ProductKind', PRODUCT_KINDS, ProductKind],
    ['USER_ROLES <-> UserRole', ['CUSTOMER', 'STAFF', 'TAILOR', 'ADMIN'], UserRole],
    ['PRODUCT_STATUSES <-> ProductStatus', ['DRAFT', 'ACTIVE', 'ARCHIVED'], ProductStatus],
    [
      'ORDER_STATUSES <-> OrderStatus',
      [
        'PENDING',
        'CONFIRMED',
        'PROCESSING',
        'READY_TO_SHIP',
        'SHIPPED',
        'DELIVERED',
        'CANCELLED',
        'RETURNED',
      ],
      OrderStatus,
    ],
    [
      'PAYMENT_STATUSES <-> PaymentStatus',
      ['PENDING', 'AWAITING_APPROVAL', 'PAID', 'FAILED', 'REFUNDED', 'CANCELLED'],
      PaymentStatus,
    ],
    [
      'STITCHING_STAGES <-> StitchingStage',
      ['RECEIVED', 'CUTTING', 'STITCHING', 'QC', 'READY', 'DISPATCHED'],
      StitchingStage,
    ],
    ['LEAD_STATUSES <-> LeadStatus', ['NEW', 'CONTACTED', 'QUOTED', 'WON', 'LOST'], LeadStatus],
    [
      'INTERACTION_KINDS <-> InteractionKind',
      ['CALL', 'WHATSAPP', 'EMAIL', 'SMS', 'VISIT', 'NOTE', 'COMPLAINT'],
      InteractionKind,
    ],
    ['MEASUREMENT_UNITS <-> MeasurementUnit', ['INCH', 'CM'], MeasurementUnit],
  ];

  it.each(cases)('%s', (_label, sharedValues, prismaEnum) => {
    expect([...sharedValues].sort()).toEqual(Object.values(prismaEnum).sort());
  });
});
