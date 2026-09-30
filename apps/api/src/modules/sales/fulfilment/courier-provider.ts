/**
 * Extension point: courier providers.
 *
 * Follows apps/api/src/core/storage/storage.driver.ts exactly — a small
 * interface, one file per implementation, selected by the COURIER_PROVIDERS
 * env allowlist (House Rule 8), same idiom as PAYMENT_PROVIDERS
 * (payments/payment-provider.ts).
 *
 * `manual` (providers/manual.provider.ts) is the only driver today — it is
 * what the shop uses now (type a tracking number) and proves the interface
 * before a real integration exists. WO-6.3 names PostEx/Leopards/TCS/M&P/
 * Trax/BlueEx/CallCourier as candidates but is explicit that only the one
 * the shop actually uses should be built, "and let the rest follow demand" —
 * there is no real courier account to integrate against in this deployment,
 * so none of the seven are built. Adding one: implement this interface,
 * register it in FulfilmentService's provider map, add its key to
 * COURIER_PROVIDERS. Nothing else changes.
 */
export interface CreateShipmentInput {
  orderId: string;
  orderNumber: string;
  shippingAddress: Record<string, unknown>;
  weightGrams: number | null;
  packageCount: number;
  codAmount: number | null;
}

export interface CourierShipment {
  trackingNumber: string;
  trackingUrl: string | null;
  /** PDF or ZPL, base64 — null when the courier has no label API. */
  labelBase64: string | null;
  /** Whatever the courier's response was — kept on Shipment.meta for support. */
  meta?: Record<string, unknown>;
}

export interface CourierTrackingResult {
  /** Normalised — never the courier's own vocabulary (WO-6.2's own rule). */
  status: 'PENDING' | 'DISPATCHED' | 'IN_TRANSIT' | 'DELIVERED' | 'RETURNED' | 'LOST';
  /** The courier's raw status string, kept for support, never for logic. */
  rawStatus: string | null;
  meta?: Record<string, unknown>;
}

export interface CourierProvider {
  /** Stable key, matching the COURIER_PROVIDERS allowlist. */
  readonly key: string;
  readonly labelEn: string;
  readonly labelUr: string;
  createShipment(input: CreateShipmentInput): Promise<CourierShipment>;
  /** Called by FulfilmentCron's polling sweep. */
  track(trackingNumber: string): Promise<CourierTrackingResult>;
  cancel(trackingNumber: string): Promise<void>;
  /** PDF or ZPL. Null when the courier has no label API, or none is needed yet. */
  label?(trackingNumber: string): Promise<Buffer | null>;
  /** Optional webhook verification, for couriers that push instead of being polled. */
  verifyWebhook?(headers: Record<string, string>, body: unknown): boolean;
}
