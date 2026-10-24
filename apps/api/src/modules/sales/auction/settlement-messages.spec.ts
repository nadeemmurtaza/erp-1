import { lapsedNotice, wonNotice } from './settlement-messages';

const won = { lotTitle: 'Brass lamp', lotNo: 3, auctionNumber: 'AUC-2026-0007', hammer: 'Rs 5,000', premium: 'Rs 500', total: 'Rs 5,500', orderNumber: 'YSN-2026-0042', due: '10 Oct 2026, 3:00 pm' };

describe('wonNotice', () => {
  it('names the lot, what is owed, the order to pay and the deadline', () => {
    const { subject, body } = wonNotice('en', won);
    expect(subject).toBe('You won Brass lamp');
    for (const part of ['lot 3', 'AUC-2026-0007', 'Rs 5,000', 'Rs 5,500', 'YSN-2026-0042', '10 Oct 2026, 3:00 pm']) expect(body).toContain(part);
    expect(body).toContain("buyer's premium of Rs 500");
  });

  it('leaves out the premium sentence when there was none', () => {
    expect(wonNotice('en', { ...won, premium: null }).body).not.toContain('premium');
  });

  it('is written in Urdu for an Urdu reader, with no English sentence left in it', () => {
    const { subject, body } = wonNotice('ur', won);
    expect(subject).toContain('Brass lamp');
    expect(body).toContain('YSN-2026-0042');
    expect(body).not.toContain('You won');
    expect(body).not.toContain('will lapse');
  });
});

describe('lapsedNotice', () => {
  const lapsed = { lotTitle: 'Brass lamp', lotNo: 3, auctionNumber: 'AUC-2026-0007', orderNumber: 'YSN-2026-0042', due: '10 Oct 2026, 3:00 pm' };

  it('says the win lapsed, why, and what a strike means for the reader', () => {
    const { subject, body } = lapsedNotice('en', lapsed);
    expect(subject).toBe('Your win of Brass lamp has lapsed');
    expect(body).toContain('strike');
    expect(body).toContain('YSN-2026-0042');
    expect(body).toContain('contact the shop');
  });

  it('copes with a win that never reached an order', () => {
    expect(lapsedNotice('en', { ...lapsed, orderNumber: null }).body).not.toContain('order');
    expect(lapsedNotice('ur', { ...lapsed, orderNumber: null }).body).not.toContain('null');
  });
});
