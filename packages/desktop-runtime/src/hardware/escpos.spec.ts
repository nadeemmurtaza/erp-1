import { cutCommand, drawerKickCommand, initCommand, textLineCommand } from './escpos';

describe('escpos byte-command builders', () => {
  it('initCommand() is ESC @', () => {
    expect(initCommand()).toEqual(Buffer.from([0x1b, 0x40]));
  });

  it('textLineCommand() encodes the text and terminates with a line feed', () => {
    expect(textLineCommand('Hello')).toEqual(Buffer.from('Hello\n', 'latin1'));
  });

  it('textLineCommand() round-trips Latin-1-safe characters used in receipt fields', () => {
    const line = 'Order #A-102 - Rs 3,499';
    const bytes = textLineCommand(line);
    expect(bytes.subarray(0, bytes.length - 1).toString('latin1')).toBe(line);
    expect(bytes[bytes.length - 1]).toBe(0x0a);
  });

  it('cutCommand() defaults to a partial cut', () => {
    expect(cutCommand()).toEqual(Buffer.from([0x1d, 0x56, 0x01]));
  });

  it('cutCommand("full") requests a full cut', () => {
    expect(cutCommand('full')).toEqual(Buffer.from([0x1d, 0x56, 0x00]));
  });

  it('drawerKickCommand() defaults to pin 2 with the documented standard pulse widths', () => {
    expect(drawerKickCommand()).toEqual(Buffer.from([0x1b, 0x70, 0x00, 25, 250]));
  });

  it('drawerKickCommand(1) selects the second drawer pin', () => {
    expect(drawerKickCommand(1)).toEqual(Buffer.from([0x1b, 0x70, 0x01, 25, 250]));
  });

  it('drawerKickCommand() accepts custom pulse widths', () => {
    expect(drawerKickCommand(0, 10, 100)).toEqual(Buffer.from([0x1b, 0x70, 0x00, 10, 100]));
  });
});
