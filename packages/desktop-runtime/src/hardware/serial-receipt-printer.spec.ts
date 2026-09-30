import { ReceiptData } from '@newax/pos-core';
import { buildReceiptBytes, SerialPortReceiptPrinter } from './serial-receipt-printer';
import { SerialWritable } from './serial-port-io';

/** A minimal, deterministic fake of `SerialWritable` — no real serial
 * port, real timing, or real hardware anywhere in this spec. Real-
 * hardware behaviour (actual print quality, actual drawer-solenoid
 * timing) is explicitly NOT what this file proves — see doc 48's own
 * status blockquote. */
class FakeSerialPort implements SerialWritable {
  written: Buffer[] = [];
  closed = false;
  failOpen = false;
  failWrite = false;
  failDrain = false;

  once(event: 'open' | 'error', listener: (error?: Error) => void): void {
    if (event === 'open' && !this.failOpen) queueMicrotask(() => listener());
    if (event === 'error' && this.failOpen) queueMicrotask(() => listener(new Error('failed to open')));
  }

  write(data: Buffer, callback: (error: Error | null | undefined) => void): boolean {
    if (this.failWrite) {
      callback(new Error('write failed'));
      return false;
    }
    this.written.push(Buffer.from(data));
    callback(null);
    return true;
  }

  drain(callback: (error: Error | null | undefined) => void): void {
    callback(this.failDrain ? new Error('drain failed') : null);
  }

  close(callback?: (error: Error | null | undefined) => void): void {
    this.closed = true;
    callback?.(null);
  }
}

const receipt: ReceiptData = {
  orderNumber: 'A-102',
  placedAt: '2026-09-30T10:00:00.000Z',
  terminalId: 'T1',
  cashierUserId: 'user-1',
  lines: [{ nameEn: 'Widget', sku: 'WID-1', quantity: 2, unitPrice: 50000, lineTotal: 100000 }],
  itemsSubtotal: 100000,
  grandTotal: 100000,
  tenderedMinor: 100000,
  changeMinor: 0,
};

describe('buildReceiptBytes (pure)', () => {
  it('starts with the ESC @ init command and ends with a cut command', () => {
    const bytes = buildReceiptBytes(receipt);
    expect(bytes.subarray(0, 2)).toEqual(Buffer.from([0x1b, 0x40]));
    expect(bytes.subarray(bytes.length - 3)).toEqual(Buffer.from([0x1d, 0x56, 0x01]));
  });

  it('includes the order number and every line item', () => {
    const text = buildReceiptBytes(receipt).toString('latin1');
    expect(text).toContain('Order A-102');
    expect(text).toContain('2 x Widget');
  });

  it('respects an explicit full-cut mode', () => {
    const bytes = buildReceiptBytes(receipt, 'full');
    expect(bytes.subarray(bytes.length - 3)).toEqual(Buffer.from([0x1d, 0x56, 0x00]));
  });
});

describe('SerialPortReceiptPrinter', () => {
  it('opens the port, writes the receipt, and resolves { printed: true } on success', async () => {
    const fake = new FakeSerialPort();
    const printer = new SerialPortReceiptPrinter({
      path: '/dev/ttyUSB0',
      createPort: () => fake,
      logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    });

    const result = await printer.print(receipt);
    expect(result).toEqual({ printed: true });
    expect(Buffer.concat(fake.written).toString('latin1')).toContain('Order A-102');
    expect(fake.closed).toBe(true);
  });

  it('resolves { printed: false } (never throws) when the port fails to open', async () => {
    const fake = new FakeSerialPort();
    fake.failOpen = true;
    const errorLog = jest.fn();
    const printer = new SerialPortReceiptPrinter({
      path: '/dev/ttyUSB0',
      createPort: () => fake,
      logger: { info: jest.fn(), warn: jest.fn(), error: errorLog },
    });

    await expect(printer.print(receipt)).resolves.toEqual({ printed: false });
    expect(errorLog).toHaveBeenCalled();
  });

  it('resolves { printed: false } when the write itself fails', async () => {
    const fake = new FakeSerialPort();
    fake.failWrite = true;
    const printer = new SerialPortReceiptPrinter({ path: '/dev/ttyUSB0', createPort: () => fake });
    await expect(printer.print(receipt)).resolves.toEqual({ printed: false });
  });

  it('closes the port even when printing fails', async () => {
    const fake = new FakeSerialPort();
    fake.failWrite = true;
    const printer = new SerialPortReceiptPrinter({ path: '/dev/ttyUSB0', createPort: () => fake });
    await printer.print(receipt);
    expect(fake.closed).toBe(true);
  });

  it('kicks the cash drawer after printing when kickDrawerAfterPrint is set', async () => {
    const fake = new FakeSerialPort();
    const printer = new SerialPortReceiptPrinter({
      path: '/dev/ttyUSB0',
      kickDrawerAfterPrint: true,
      createPort: () => fake,
    });
    await printer.print(receipt);
    const lastWrite = fake.written[fake.written.length - 1];
    expect(lastWrite).toEqual(Buffer.from([0x1b, 0x70, 0x00, 25, 250]));
  });

  it('does not kick the cash drawer unless kickDrawerAfterPrint is set', async () => {
    const fake = new FakeSerialPort();
    const printer = new SerialPortReceiptPrinter({ path: '/dev/ttyUSB0', createPort: () => fake });
    await printer.print(receipt);
    const allBytes = Buffer.concat(fake.written);
    // ESC p (0x1b 0x70) is the drawer-kick opcode; ESC @ (0x1b 0x40) the
    // init command already present makes a byte-substring check for 0x1b
    // alone unreliable, so look for the drawer-kick's own two-byte opcode.
    expect(allBytes.includes(Buffer.from([0x1b, 0x70]))).toBe(false);
  });
});
