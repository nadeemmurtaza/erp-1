import { formatMoney } from '@newax/shared';
import type { ReceiptData, ReceiptPrinter } from '@newax/pos-core';
import { CutMode, cutCommand, drawerKickCommand, initCommand, textLineCommand } from './escpos';
import { DesktopLogger, consoleDesktopLogger } from '../logger';
import {
  SerialPortFactory,
  SerialWritable,
  closePort,
  defaultSerialPortFactory,
  waitForOpen,
  writeAndDrain,
} from './serial-port-io';

/**
 * 48-native-desktop-deployment.md WO-48.4 — a native (non-WebUSB)
 * `ReceiptPrinter` (`packages/pos-core/src/hardware.ts`), for the desktop
 * shell's own direct serial/USB access doc 31's browser-sandboxed PWA
 * never had. Implements the exact same interface doc 31 already shipped —
 * this is doc 48's own "an additional … implementation of doc 31's own
 * interfaces, not a new hardware model."
 *
 * Never throws out of `print()` — matching `hardware.ts`'s own "treat a
 * missing driver as optional and no-op silently" contract as closely as a
 * *configured* driver honestly can: a configured driver that fails is a
 * real fault (unplugged cable, out of paper), not a "no driver" no-op, so
 * it is logged and reported through the interface's own `{ printed:
 * false }` result rather than thrown — the same shape a missing driver
 * already reports success or failure through.
 */
export interface SerialReceiptPrinterOptions {
  /** e.g. `/dev/ttyUSB0` on Linux, `COM3` on Windows. */
  path: string;
  baudRate?: number;
  cutMode?: CutMode;
  /** Most cash drawers are wired through the receipt printer's own RJ11
   * pass-through port — the real-world standard this option assumes by
   * default. Set false for a drawer wired to its own separate port. */
  kickDrawerAfterPrint?: boolean;
  createPort?: SerialPortFactory;
  logger?: DesktopLogger;
}

const DEFAULT_BAUD_RATE = 9600;

export class SerialPortReceiptPrinter implements ReceiptPrinter {
  private readonly logger: DesktopLogger;
  private readonly createPort: SerialPortFactory;

  constructor(private readonly options: SerialReceiptPrinterOptions) {
    this.logger = options.logger ?? consoleDesktopLogger;
    this.createPort = options.createPort ?? defaultSerialPortFactory;
  }

  async print(receipt: ReceiptData): Promise<{ printed: boolean }> {
    let port: SerialWritable | undefined;
    try {
      port = this.createPort({ path: this.options.path, baudRate: this.options.baudRate ?? DEFAULT_BAUD_RATE });
      await waitForOpen(port);
      await writeAndDrain(port, buildReceiptBytes(receipt, this.options.cutMode));
      if (this.options.kickDrawerAfterPrint) {
        await writeAndDrain(port, drawerKickCommand());
      }
      return { printed: true };
    } catch (error) {
      this.logger.error('Failed to print receipt on serial printer', {
        path: this.options.path,
        error: error instanceof Error ? error.message : String(error),
      });
      return { printed: false };
    } finally {
      if (port) await closePort(port);
    }
  }
}

/** Pure — the actual byte layout is exhaustively tested in
 * `serial-receipt-printer.spec.ts` with no serial port involved at all. */
export function buildReceiptBytes(receipt: ReceiptData, cutMode?: CutMode): Buffer {
  const parts: Buffer[] = [initCommand()];
  const push = (line: string) => parts.push(textLineCommand(line));

  push(`Order ${receipt.orderNumber}`);
  push(new Date(receipt.placedAt).toLocaleString('en-US'));
  if (receipt.terminalId) push(`Terminal ${receipt.terminalId}`);
  push('--------------------------------');
  for (const line of receipt.lines) {
    push(`${line.quantity} x ${line.nameEn}`);
    push(`  ${formatMoney(line.unitPrice)} each   ${formatMoney(line.lineTotal)}`);
  }
  push('--------------------------------');
  push(`Subtotal: ${formatMoney(receipt.itemsSubtotal)}`);
  push(`Total: ${formatMoney(receipt.grandTotal)}`);
  push(`Tendered: ${formatMoney(receipt.tenderedMinor)}`);
  push(`Change: ${formatMoney(receipt.changeMinor)}`);
  parts.push(cutCommand(cutMode));
  return Buffer.concat(parts);
}
