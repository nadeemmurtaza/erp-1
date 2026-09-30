/**
 * 48-native-desktop-deployment.md WO-48.4 — the ESC/POS byte-command set,
 * as pure functions.
 *
 * ESC/POS is the command language essentially every thermal receipt
 * printer speaks (Epson's own reference, adopted as a de facto industry
 * standard by every other vendor's clones). These functions build the
 * exact byte sequences the printer's own reference documents — nothing
 * here talks to a serial port, so every one of them is exhaustively
 * unit-testable with no mock and no hardware, the same "the deciding
 * function takes inputs, returns the outcome, holds no side effect"
 * discipline this repository already applies to its own preview/dry-run
 * methods (`.claude/rules/services.md`).
 *
 * Honesty, stated once here rather than at every call site: these byte
 * sequences are built exactly to the documented ESC/POS command reference
 * and are NOT verified against a real physical printer or cash drawer in
 * this sandbox — no such hardware exists here to test against. See doc
 * 48's own status blockquote.
 */

export const ESC = 0x1b;
export const GS = 0x1d;
export const LF = 0x0a;

/** `ESC @` — resets the printer to its power-on defaults. Always the
 * first bytes sent for a fresh receipt, so a printer left in an unknown
 * state (bold left on, a previous job's code page) never bleeds into the
 * next sale. */
export function initCommand(): Buffer {
  return Buffer.from([ESC, 0x40]);
}

/** Plain text, terminated with a line feed. Encoded as Latin-1 (ESC/POS's
 * own default code page, PC437/CP850-family, is a single-byte encoding
 * compatible with Latin-1 for the ASCII range every receipt field here
 * already uses — order numbers, SKUs, `formatMoney`'s own output). A
 * receipt containing non-Latin script (Urdu product names) would need a
 * printer-specific code-page switch this function does not attempt — a
 * real, further per-model detail named here rather than silently assumed
 * away, exactly like `hardware.ts`'s own "no concrete implementation"
 * disclaimer for doc 31's original interfaces. */
export function textLineCommand(line: string): Buffer {
  return Buffer.concat([Buffer.from(line, 'latin1'), Buffer.from([LF])]);
}

export type CutMode = 'full' | 'partial';

/** `GS V m` — the simple (no feed-amount) form of the paper cut command:
 * `m = 0` full cut, `m = 1` partial cut (a few fibres left uncut, so the
 * receipt tears off by hand but does not fall free) — partial is this
 * function's default because it is what almost every till-facing
 * printer preset expects. */
export function cutCommand(mode: CutMode = 'partial'): Buffer {
  return Buffer.from([GS, 0x56, mode === 'full' ? 0x00 : 0x01]);
}

export type DrawerPin = 0 | 1;

/** `ESC p m t1 t2` — the standard "kick out cash drawer" pulse. `m`
 * selects which of the printer's two drawer-kick pins fires (`0` = pin 2,
 * the near-universal wiring for a single drawer; `1` = pin 5, a second
 * drawer some multi-till setups wire in). `t1`/`t2` are the pulse's
 * on/off duration in the printer's own 2ms units — `25`/`250` (the
 * defaults below) is the value Epson's own reference documents as the
 * common case (~50ms on, ~500ms off), long enough for every drawer
 * solenoid this format is commonly wired to. */
export function drawerKickCommand(pin: DrawerPin = 0, t1 = 25, t2 = 250): Buffer {
  return Buffer.from([ESC, 0x70, pin, t1 & 0xff, t2 & 0xff]);
}
