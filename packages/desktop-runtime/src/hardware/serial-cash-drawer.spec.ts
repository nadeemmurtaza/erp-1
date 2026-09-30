import { SerialPortCashDrawer } from './serial-cash-drawer';
import { SerialWritable } from './serial-port-io';

/** Same fake shape as `serial-receipt-printer.spec.ts` — duplicated
 * rather than shared, since each is a handful of lines local to one
 * spec's own assertions; see that file's header for what a fake like
 * this does and does not prove. */
class FakeSerialPort implements SerialWritable {
  written: Buffer[] = [];
  closed = false;
  failOpen = false;
  failWrite = false;

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
    callback(null);
  }

  close(callback?: (error: Error | null | undefined) => void): void {
    this.closed = true;
    callback?.(null);
  }
}

describe('SerialPortCashDrawer', () => {
  it('sends the drawer-kick command for the default pin (0) and closes the port', async () => {
    const fake = new FakeSerialPort();
    const drawer = new SerialPortCashDrawer({ path: '/dev/ttyUSB0', createPort: () => fake });
    await drawer.kick();
    expect(fake.written[0]).toEqual(Buffer.from([0x1b, 0x70, 0x00, 25, 250]));
    expect(fake.closed).toBe(true);
  });

  it('selects pin 1 when configured', async () => {
    const fake = new FakeSerialPort();
    const drawer = new SerialPortCashDrawer({ path: '/dev/ttyUSB0', pin: 1, createPort: () => fake });
    await drawer.kick();
    expect(fake.written[0]).toEqual(Buffer.from([0x1b, 0x70, 0x01, 25, 250]));
  });

  it('rejects (never silently succeeds) when the port fails to open', async () => {
    const fake = new FakeSerialPort();
    fake.failOpen = true;
    const drawer = new SerialPortCashDrawer({ path: '/dev/ttyUSB0', createPort: () => fake });
    await expect(drawer.kick()).rejects.toThrow('failed to open');
  });

  it('rejects when the write itself fails, and still closes the port', async () => {
    const fake = new FakeSerialPort();
    fake.failWrite = true;
    const drawer = new SerialPortCashDrawer({ path: '/dev/ttyUSB0', createPort: () => fake });
    await expect(drawer.kick()).rejects.toThrow('write failed');
    expect(fake.closed).toBe(true);
  });

  it('logs the failure before rejecting', async () => {
    const fake = new FakeSerialPort();
    fake.failWrite = true;
    const errorLog = jest.fn();
    const drawer = new SerialPortCashDrawer({
      path: '/dev/ttyUSB0',
      createPort: () => fake,
      logger: { info: jest.fn(), warn: jest.fn(), error: errorLog },
    });
    await expect(drawer.kick()).rejects.toThrow();
    expect(errorLog).toHaveBeenCalled();
  });
});
