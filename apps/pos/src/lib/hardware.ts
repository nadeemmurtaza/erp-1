'use client';

import type { BarcodeScanner, CashDrawer, ReceiptData, ReceiptPrinter } from '@newax/pos-core';

/**
 * pos-hardware/31-sector-pos-hardware-integration.md WO-31.1 — the
 * browser-side registry for `pos-core`'s hardware extension points.
 * `apps/pos` is a PWA; a real driver (WebUSB/serial ESC/POS, a network
 * print-spooler) registers itself here once, at app start, by calling
 * `registerReceiptPrinter()`/`registerCashDrawer()`/`registerBarcodeScanner()`.
 *
 * No concrete driver ships with this work order — every function below is
 * safe to call with nothing registered: it resolves to a no-op, the same
 * check-then-no-op discipline `AiService.isAvailable()` already uses
 * elsewhere in this codebase. A deployment with no hardware wired behaves
 * exactly as `pos` does today.
 */
let printer: ReceiptPrinter | null = null;
let drawer: CashDrawer | null = null;
let scanner: BarcodeScanner | null = null;

export function registerReceiptPrinter(driver: ReceiptPrinter): void {
  printer = driver;
}

export function registerCashDrawer(driver: CashDrawer): void {
  drawer = driver;
}

export function registerBarcodeScanner(driver: BarcodeScanner): void {
  scanner = driver;
}

export function isPrinterRegistered(): boolean {
  return printer !== null;
}

export function isDrawerRegistered(): boolean {
  return drawer !== null;
}

/**
 * Never throws — a print failure is the caller's own retry state (doc 31's
 * own failure-path lens), not an exception the till has to catch everywhere.
 * With no driver registered this resolves to `{ printed: false }`
 * immediately, so a caller that falls back to `window.print()` on that
 * result behaves exactly as it did before this driver existed.
 */
export async function printReceipt(receipt: ReceiptData): Promise<{ printed: boolean }> {
  if (!printer) return { printed: false };
  try {
    return await printer.print(receipt);
  } catch {
    return { printed: false };
  }
}

/** WO-31.5 — a kitchen ticket reuses the same driver, no separate hardware concept. */
export async function printKitchenTicket(receipt: ReceiptData): Promise<{ printed: boolean }> {
  return printReceipt(receipt);
}

/**
 * Called once, from the till's own tender-completion path, per completed
 * cash tender — never on a card tender (this till has no card tender path
 * today), never twice for one sale. Never throws.
 */
export async function kickCashDrawer(): Promise<{ kicked: boolean }> {
  if (!drawer) return { kicked: false };
  try {
    await drawer.kick();
    return { kicked: true };
  } catch {
    return { kicked: false };
  }
}

/** Camera-based scanning only — a keyboard-wedge scanner needs no driver. */
export function onBarcodeScan(handler: (code: string) => void): () => void {
  if (!scanner) return () => {};
  return scanner.onScan(handler);
}
