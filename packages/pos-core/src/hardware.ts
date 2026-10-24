import type { ReceiptData } from './receipt';

/**
 * pos-hardware/31-sector-pos-hardware-integration.md WO-31.1 — the till
 * hardware layer, as extension points only. `apps/pos` is a PWA; every
 * driver below runs behind these interfaces so a deployment with no
 * scanner, no ESC/POS printer, or no drawer boots and sells normally — the
 * same absent-collaborator discipline every module in this repository
 * already follows (`AiService.isAvailable()`'s check-then-no-op pattern is
 * the precedent).
 *
 * No concrete WebUSB/serial/print-spooler implementation ships with this
 * work order — a real hardware driver is a separate, later, per-deployment
 * concern (doc 31's own "The absent collaborator" lens). Every call site
 * that uses these interfaces MUST treat a missing driver as optional and
 * no-op silently — never throw for "no driver configured".
 */

export interface BarcodeScanner {
  /** Camera-based scanning only — keyboard-wedge (HID) scanners need no
   *  driver, they type into whatever input has focus. */
  onScan(handler: (code: string) => void): () => void;
}

export interface ReceiptPrinter {
  print(receipt: ReceiptData): Promise<{ printed: boolean }>;
}

export interface CashDrawer {
  /** Kicked once, per completed cash tender — never on a card tender, never
   *  twice for one sale (the call site owns that guarantee, not this
   *  interface). */
  kick(): Promise<void>;
}
