import { PartnerFactListener } from './partner-fact.listener';

describe('PartnerFactListener', () => {
  const base = { inboxId: 'inbox1', tradingPartnerId: 'tp1', factId: 'f1' };
  let applier: { apply: jest.Mock };
  let listener: PartnerFactListener;

  beforeEach(() => {
    applier = { apply: jest.fn().mockResolvedValue('APPLIED') };
    listener = new PartnerFactListener(applier as any);
  });

  it('applies a stored sale.dispatched fact', async () => {
    await listener.onPartnerFactReceived({ ...base, type: 'sale.dispatched' });

    expect(applier.apply).toHaveBeenCalledWith('inbox1');
  });

  it('ignores a receipt.confirmed: that reply is the seller side, not ours to apply', async () => {
    await listener.onPartnerFactReceived({ ...base, type: 'receipt.confirmed' });

    expect(applier.apply).not.toHaveBeenCalled();
  });

  it('lets a failure surface, so the outbox redelivers the event', async () => {
    applier.apply.mockRejectedValue(new Error('database down'));

    await expect(listener.onPartnerFactReceived({ ...base, type: 'sale.dispatched' })).rejects.toThrow('database down');
  });
});
