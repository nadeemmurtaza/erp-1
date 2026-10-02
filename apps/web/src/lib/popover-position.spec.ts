import { placePopover, POPOVER_GAP, POPOVER_MARGIN, type Rect } from './popover-position';

const rect = (left: number, top: number, width = 120, height = 40): Rect => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
});

const viewport = { width: 1000, height: 640 };
const popover = { width: 200, height: 300 };

describe('placePopover', () => {
  it('opens below the trigger when there is room', () => {
    const r = placePopover({ trigger: rect(100, 100), popover, viewport });
    expect(r.placement).toBe('bottom');
    expect(r.flipped).toBe(false);
    expect(r.top).toBe(140 + POPOVER_GAP);
    expect(r.bottom).toBeUndefined();
    expect(r.maxHeight).toBe(300);
    expect(r.left).toBe(100);
    expect(r.inlineStart).toBe(100);
  });

  it('flips up when below is too small and above is larger', () => {
    // Trigger near the bottom of a 640 px window: 20 px below, 560 above.
    const r = placePopover({ trigger: rect(100, 580), popover, viewport });
    expect(r.placement).toBe('top');
    expect(r.flipped).toBe(true);
    expect(r.bottom).toBe(640 - 580 + POPOVER_GAP);
    expect(r.top).toBeUndefined();
    expect(r.maxHeight).toBe(300);
  });

  it('stays below when the room is exactly the height needed', () => {
    // roomBelow = 640 - bottom - gap - margin; make it exactly 300.
    const bottom = 640 - POPOVER_GAP - POPOVER_MARGIN - 300;
    const r = placePopover({ trigger: rect(100, bottom - 40), popover, viewport });
    expect(r.placement).toBe('bottom');
    expect(r.maxHeight).toBe(300);
  });

  it('flips one pixel past the exact fit when above has more room', () => {
    // A 250 px panel: exactly fitting puts the trigger bottom at 378; one lower leaves 249 below, 327 above.
    const exact = 640 - POPOVER_GAP - POPOVER_MARGIN - 250;
    const stays = placePopover({ trigger: rect(100, exact - 40), popover: { width: 200, height: 250 }, viewport });
    expect(stays.placement).toBe('bottom');
    const flips = placePopover({ trigger: rect(100, exact - 39), popover: { width: 200, height: 250 }, viewport });
    expect(flips.placement).toBe('top');
  });

  it('stays below when it does not fit but above is smaller still', () => {
    // Trigger near the top of a short window: more room below than above.
    const r = placePopover({ trigger: rect(100, 20), popover, viewport: { width: 1000, height: 200 } });
    expect(r.placement).toBe('bottom');
    // 200 - 60 - 4 - 8 = 128 of room: the panel is capped to it and scrolls inside itself.
    expect(r.maxHeight).toBe(128);
  });

  it('takes the larger side and caps to it when neither side fits', () => {
    const r = placePopover({
      trigger: rect(100, 150),
      popover: { width: 200, height: 500 },
      viewport: { width: 1000, height: 400 },
    });
    // Below: 400 - 190 - 12 = 198. Above: 150 - 12 = 138. Below is larger, so it stays.
    expect(r.placement).toBe('bottom');
    expect(r.maxHeight).toBe(198);
    const flipped = placePopover({
      trigger: rect(100, 250),
      popover: { width: 200, height: 500 },
      viewport: { width: 1000, height: 400 },
    });
    // Below: 400 - 290 - 12 = 98. Above: 250 - 12 = 238.
    expect(flipped.placement).toBe('top');
    expect(flipped.maxHeight).toBe(238);
  });

  it('never returns a negative height when the trigger touches the edge', () => {
    const r = placePopover({ trigger: rect(0, 630, 50, 10), popover, viewport });
    expect(r.maxHeight).toBeGreaterThanOrEqual(0);
  });

  it('clamps horizontally inside the viewport at the inline-end edge', () => {
    const r = placePopover({ trigger: rect(900, 100), popover, viewport });
    expect(r.left).toBe(1000 - POPOVER_MARGIN - 200);
  });

  it('clamps horizontally at the inline-start edge', () => {
    const r = placePopover({ trigger: rect(-30, 100), popover, viewport });
    expect(r.left).toBe(POPOVER_MARGIN);
  });

  it('is capped to the viewport width and starts at the margin when wider than the screen', () => {
    const r = placePopover({
      trigger: rect(10, 100, 100),
      popover: { width: 600, height: 100 },
      viewport: { width: 280, height: 640 },
    });
    expect(r.maxWidth).toBe(280 - POPOVER_MARGIN * 2);
    expect(r.left).toBe(POPOVER_MARGIN);
  });

  it('mirrors in right-to-left: aligns to the trigger right edge and measures from the inline-start edge', () => {
    // Trigger spans 700..820; a 200 px panel aligned to its right edge starts at 620.
    const r = placePopover({ trigger: rect(700, 100), popover, viewport, rtl: true });
    expect(r.left).toBe(620);
    // Inline-start in RTL is the viewport's right edge: 1000 - 620 - 200.
    expect(r.inlineStart).toBe(180);
  });

  it('clamps in right-to-left against the left edge', () => {
    const r = placePopover({ trigger: rect(20, 100), popover, viewport, rtl: true });
    expect(r.left).toBe(POPOVER_MARGIN);
    expect(r.inlineStart).toBe(1000 - POPOVER_MARGIN - 200);
  });

  it('honours a custom gap and margin', () => {
    const r = placePopover({ trigger: rect(100, 100), popover, viewport, gap: 10, margin: 20 });
    expect(r.top).toBe(150);
    const edge = placePopover({ trigger: rect(990, 100), popover, viewport, margin: 20 });
    expect(edge.left).toBe(1000 - 20 - 200);
  });
});
