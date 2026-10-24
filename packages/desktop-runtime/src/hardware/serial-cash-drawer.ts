import type { CashDrawer } from '@newax/pos-core';
import { DrawerPin, drawerKickCommand } from './escpos';
import { DesktopLogger, consoleDesktopLogger } from '../logger';
import {
  SerialPortFactory,
  closePort,
  defaultSerialPortFactory,
  waitForOpen,
  writeAndDrain,
} from './serial-port-io';

/**
 * 48-native-desktop-deployment.md WO-48.4 — a native `CashDrawer`
 * (`packages/pos-core/src/hardware.ts`) for a drawer wired to its own
 * serial port rather than through a receipt printer's RJ11 pass-through
 * (`SerialPortReceiptPrinter`'s `kickDrawerAfterPrint` option covers the
 * far more common wiring).
 *
 * Unlike `SerialPortReceiptPrinter.print()`, this does NOT swallow a
 * failure into a boolean result — `hardware.ts`'s own `CashDrawer.kick()`
 * contract is `Promise<void>`, with no success flag for a caller to
 * check, so a failure here is a rejected promise. This is deliberate: a
 * failed drawer kick during a cash tender is exactly the kind of failure
 * `.claude/rules/services.md` says must never be silently swallowed, and
 * the call site (not this driver) is what "owns the guarantee" doc 31's
 * own interface comment already assigns it — kicking the drawer once per
 * completed cash tender, never twice — so the call site needs the real
 * outcome to honour that guarantee correctly (e.g. retry, or surface a
 * "please open the drawer manually" prompt), not a value already decided
 * for it.
 */
export interface SerialCashDrawerOptions {
  path: string;
  baudRate?: number;
  pin?: DrawerPin;
  createPort?: SerialPortFactory;
  logger?: DesktopLogger;
}

const DEFAULT_BAUD_RATE = 9600;

export class SerialPortCashDrawer implements CashDrawer {
  private readonly logger: DesktopLogger;
  private readonly createPort: SerialPortFactory;

  constructor(private readonly options: SerialCashDrawerOptions) {
    this.logger = options.logger ?? consoleDesktopLogger;
    this.createPort = options.createPort ?? defaultSerialPortFactory;
  }

  async kick(): Promise<void> {
    const port = this.createPort({ path: this.options.path, baudRate: this.options.baudRate ?? DEFAULT_BAUD_RATE });
    try {
      await waitForOpen(port);
      await writeAndDrain(port, drawerKickCommand(this.options.pin ?? 0));
    } catch (error) {
      this.logger.error('Failed to kick cash drawer', {
        path: this.options.path,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      await closePort(port);
    }
  }
}
