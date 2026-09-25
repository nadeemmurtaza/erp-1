import { MerchantPayableAdjustmentCreditNoteService } from './wallet-credit-note.port';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AuditService } from '../../core/audit/audit.service';

describe('MerchantPayableAdjustmentCreditNoteService — the interim default, pending doc 145', () => {
  let service: MerchantPayableAdjustmentCreditNoteService;
  let tx: any;
  let audit: any;

  beforeEach(() => {
    tx = { merchantPayable: { findUniqueOrThrow: jest.fn(), update: jest.fn() } };
    audit = { record: jest.fn() };
    service = new MerchantPayableAdjustmentCreditNoteService({} as PrismaService, audit as AuditService);
  });

  it('reduces the payable when it has not been paid yet', async () => {
    tx.merchantPayable.findUniqueOrThrow.mockResolvedValue({ id: 'p1', status: 'OPEN', netPayableMinor: 5_000 });
    tx.merchantPayable.update.mockResolvedValue({ id: 'p1', netPayableMinor: 3_000 });

    const result = await service.issueForMerchantPayable({ merchantPayableId: 'p1', amountMinor: 2_000, reason: 'return', actorId: 'staff1' }, tx);

    expect(result.applied).toBe('REDUCED_PAYABLE');
    expect(tx.merchantPayable.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { netPayableMinor: { decrement: 2_000 }, grossMinor: { decrement: 2_000 } } }),
    );
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'wallet.merchant_payable_credit_note_applied' }));
  });

  it('floors the reduction at the payable\'s own remaining amount rather than going negative', async () => {
    tx.merchantPayable.findUniqueOrThrow.mockResolvedValue({ id: 'p1', status: 'OPEN', netPayableMinor: 1_000 });
    tx.merchantPayable.update.mockResolvedValue({ id: 'p1', netPayableMinor: 0 });

    await service.issueForMerchantPayable({ merchantPayableId: 'p1', amountMinor: 5_000, reason: 'return', actorId: 'staff1' }, tx);

    expect(tx.merchantPayable.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { netPayableMinor: { decrement: 1_000 }, grossMinor: { decrement: 1_000 } } }),
    );
  });

  it('never claws back an already-PAID payable — records the amount owed back instead, never silently doing nothing', async () => {
    tx.merchantPayable.findUniqueOrThrow.mockResolvedValue({ id: 'p1', status: 'PAID', netPayableMinor: 5_000 });

    const result = await service.issueForMerchantPayable({ merchantPayableId: 'p1', amountMinor: 2_000, reason: 'return', actorId: 'staff1' }, tx);

    expect(result.applied).toBe('RECORDED_AS_OWED_BACK');
    expect(tx.merchantPayable.update).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'wallet.merchant_payable_owed_back' }));
  });
});
