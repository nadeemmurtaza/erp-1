import { Injectable } from '@nestjs/common';
import type {
  CourierProvider,
  CourierShipment,
  CourierTrackingResult,
  CreateShipmentInput,
} from '../courier-provider';

/**
 * "Type a tracking number" — what every shop on this platform does today.
 *
 * There is no API to call: booking is staff typing whatever the courier
 * counter handed them, and tracking is staff updating the shipment's status
 * by hand from the fulfilment screen (FulfilmentService.recordStatus()) —
 * FulfilmentCron's poll of this provider is a deliberate no-op, since
 * `track()` has nothing to ask and simply reports back whatever is already
 * stored. Proves the CourierProvider interface without inventing an
 * integration nobody can test against.
 */
@Injectable()
export class ManualCourierProvider implements CourierProvider {
  readonly key = 'manual';
  readonly labelEn = 'Manual (courier counter)';
  readonly labelUr = 'دستی (کوریئر کاؤنٹر)';

  async createShipment(input: CreateShipmentInput): Promise<CourierShipment> {
    return {
      trackingNumber: `MANUAL-${input.orderNumber}`,
      trackingUrl: null,
      labelBase64: null,
    };
  }

  /**
   * Never actually called: FulfilmentCron's poll loop skips every shipment
   * booked with `manual` before it reaches track() (there is nothing to
   * ask), so this exists only to satisfy the interface. Returning a fixed
   * status here would be actively wrong if it ever were called — it would
   * read as "reverted to PENDING" the moment a real status is set by hand.
   */
  async track(): Promise<CourierTrackingResult> {
    throw new Error('ManualCourierProvider.track() should never be called — FulfilmentCron skips manual shipments.');
  }

  async cancel(): Promise<void> {
    // No booking exists anywhere to cancel.
  }
}
