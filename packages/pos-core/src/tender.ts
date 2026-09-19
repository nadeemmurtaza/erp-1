/**
 * Cash tender and change — pure, in paisa. No card/wallet tender yet
 * (WO-21.5's hardware bridge is where a card terminal integration would
 * live); this is the one tender method `OrdersService.placeFromPos()`
 * itself supports today (`provider: 'cash'`).
 */
export interface TenderResult {
  /** paisa still owed — 0 once the tender covers the total. */
  amountDueMinor: number;
  /** paisa to hand back — 0 until the tender covers the total. */
  changeMinor: number;
  sufficient: boolean;
}

export function computeTender(totalMinor: number, tenderedMinor: number): TenderResult {
  const due = Math.max(0, totalMinor - tenderedMinor);
  const change = Math.max(0, tenderedMinor - totalMinor);
  return { amountDueMinor: due, changeMinor: change, sufficient: due === 0 };
}
