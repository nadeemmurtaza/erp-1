/**
 * 48-native-desktop-deployment.md WO-48.4 — the seam over the `serialport`
 * npm package shared by both native drivers below.
 *
 * A real hardware port cannot be opened in this sandbox (no serial device
 * exists here — even `SerialPort.list()` itself fails in this container
 * for want of `udevadm`, verified by hand during development). Every
 * driver in this folder is therefore built against this small interface,
 * real by default (`defaultSerialPortFactory`, backed by the real
 * `serialport` package) and fully fake in tests (`hardware/*.spec.ts`
 * inject their own in-memory `SerialWritable`) — the same "build the real
 * thing behind an injectable seam, prove the orchestration with a fake,
 * name what a fake cannot prove" discipline this document's
 * `PostgresLifecycleManager` and `LocalBackupScheduler` already use for
 * their own real dependencies.
 */
export interface SerialWritable {
  write(data: Buffer, callback: (error: Error | null | undefined) => void): boolean;
  drain(callback: (error: Error | null | undefined) => void): void;
  close(callback?: (error: Error | null | undefined) => void): void;
  once(event: 'open' | 'error', listener: (error?: Error) => void): void;
}

export interface SerialPortFactoryOptions {
  path: string;
  baudRate: number;
}

export type SerialPortFactory = (options: SerialPortFactoryOptions) => SerialWritable;

export const defaultSerialPortFactory: SerialPortFactory = (options) => {
  // Required at call time, not at module load — a deployment that never
  // configures a native serial driver (every deployment today) pays no
  // cost for a dependency it never exercises, same reasoning as
  // `EmbeddedPostgresRunner`'s own lazy `require()`.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { SerialPort } = require('serialport') as typeof import('serialport');
  return new SerialPort({ path: options.path, baudRate: options.baudRate, autoOpen: true }) as unknown as SerialWritable;
};

const DEFAULT_OPEN_TIMEOUT_MS = 5_000;

/** Resolves once the port fires `open`, rejects on `error` or timeout — a
 * port that never opens (unplugged, wrong path, another process holding
 * it) must not hang a `print()`/`kick()` call forever. */
export function waitForOpen(port: SerialWritable, timeoutMs = DEFAULT_OPEN_TIMEOUT_MS): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`serial port did not open within ${timeoutMs}ms`)), timeoutMs);
    port.once('open', () => {
      clearTimeout(timer);
      resolve();
    });
    port.once('error', (error) => {
      clearTimeout(timer);
      reject(error ?? new Error('serial port error'));
    });
  });
}

/** Writes and waits for the OS to actually flush the bytes
 * (`drain()`) — resolving as soon as `write()` returns would let this
 * function report success before a single byte reached the device. */
export function writeAndDrain(port: SerialWritable, data: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    port.write(data, (writeError) => {
      if (writeError) {
        reject(writeError);
        return;
      }
      port.drain((drainError) => {
        if (drainError) reject(drainError);
        else resolve();
      });
    });
  });
}

export function closePort(port: SerialWritable): Promise<void> {
  return new Promise((resolve) => {
    port.close(() => resolve());
  });
}
