import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ApprovalService } from './approval.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ApprovalService — 63-multi-tier-approval-hierarchies.md, scoped to PURCHASE_REQUISITION', () => {
  let service: ApprovalService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      approvalChain: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
      approvalStep: { update: jest.fn(), updateMany: jest.fn() },
    };
    service = new ApprovalService(prisma as PrismaService);
  });

  describe('start', () => {
    it('refuses an empty step list', async () => {
      await expect(service.start('PURCHASE_REQUISITION', 'r1', [])).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.approvalChain.create).not.toHaveBeenCalled();
    });

    it('refuses a step naming neither an approverRoleId, an approverUserId, nor an approverContactId', async () => {
      await expect(service.start('PURCHASE_REQUISITION', 'r1', [{}])).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.start('PURCHASE_REQUISITION', 'r1', [{ approverContactIds: [] }])).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('doc 149 — accepts a step naming only approverContactIds, a set any ONE of whom may decide', async () => {
      prisma.approvalChain.findUnique.mockResolvedValue(null);
      prisma.approvalChain.create.mockResolvedValue({ id: 'c1', steps: [] });

      await service.start('B2B_ORDER', 'req1', [{ approverContactIds: ['contactA', 'contactB'] }]);

      expect(prisma.approvalChain.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            subjectType: 'B2B_ORDER',
            steps: {
              create: [{ stepOrder: 1, approverRoleId: null, approverUserId: null, approverContactIds: ['contactA', 'contactB'] }],
            },
          }),
        }),
      );
    });

    it('refuses a second chain for the same subject', async () => {
      prisma.approvalChain.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(
        service.start('PURCHASE_REQUISITION', 'r1', [{ approverRoleId: 'purchasing.requisitions.approve' }]),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.approvalChain.create).not.toHaveBeenCalled();
    });

    it('creates a chain with steps in order', async () => {
      prisma.approvalChain.findUnique.mockResolvedValue(null);
      prisma.approvalChain.create.mockResolvedValue({ id: 'c1', steps: [] });

      await service.start('PURCHASE_REQUISITION', 'r1', [{ approverRoleId: 'purchasing.requisitions.approve' }]);

      expect(prisma.approvalChain.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            subjectType: 'PURCHASE_REQUISITION',
            subjectId: 'r1',
            steps: {
              create: [
                { stepOrder: 1, approverRoleId: 'purchasing.requisitions.approve', approverUserId: null, approverContactIds: [] },
              ],
            },
          }),
        }),
      );
    });
  });

  describe('decide', () => {
    const chain = (overrides: Partial<any> = {}) => ({
      id: 'c1',
      status: 'PENDING',
      currentStep: 1,
      steps: [{ id: 's1', stepOrder: 1, status: 'PENDING' }],
      ...overrides,
    });

    it('404s for a chain that does not exist', async () => {
      prisma.approvalChain.findUnique.mockResolvedValue(null);

      await expect(service.decide('missing', 's1', 'APPROVE', 'u1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses to re-decide a chain that is already terminal', async () => {
      prisma.approvalChain.findUnique.mockResolvedValue(chain({ status: 'APPROVED' }));

      await expect(service.decide('c1', 's1', 'APPROVE', 'u1')).rejects.toBeInstanceOf(ConflictException);
    });

    it('404s for a step that does not belong to this chain', async () => {
      prisma.approvalChain.findUnique.mockResolvedValue(chain());

      await expect(service.decide('c1', 'missing-step', 'APPROVE', 'u1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses to decide a step that is not the chain\'s current step', async () => {
      prisma.approvalChain.findUnique.mockResolvedValue(
        chain({ currentStep: 2, steps: [{ id: 's1', stepOrder: 1, status: 'APPROVED' }, { id: 's2', stepOrder: 2, status: 'PENDING' }] }),
      );

      await expect(service.decide('c1', 's1', 'APPROVE', 'u1')).rejects.toBeInstanceOf(ConflictException);
    });

    it('moves the chain to APPROVED on the last step\'s APPROVE', async () => {
      prisma.approvalChain.findUnique.mockResolvedValue(chain());
      prisma.approvalStep.update.mockResolvedValue({});
      prisma.approvalChain.update.mockResolvedValue({ id: 'c1', status: 'APPROVED' });

      const result = await service.decide('c1', 's1', 'APPROVE', 'u1', 'looks good');

      expect(prisma.approvalStep.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: { status: 'APPROVED', decidedAt: expect.any(Date), decidedById: 'u1', decidedByContactId: null, comment: 'looks good' },
      });
      expect(prisma.approvalChain.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'c1' }, data: { status: 'APPROVED', currentStep: 1 } }),
      );
      expect(result.status).toBe('APPROVED');
    });

    it('advances currentStep, without closing the chain, on an APPROVE that is not the last step', async () => {
      prisma.approvalChain.findUnique.mockResolvedValue(
        chain({ steps: [{ id: 's1', stepOrder: 1, status: 'PENDING' }, { id: 's2', stepOrder: 2, status: 'PENDING' }] }),
      );
      prisma.approvalStep.update.mockResolvedValue({});
      prisma.approvalChain.update.mockResolvedValue({ id: 'c1', status: 'PENDING', currentStep: 2 });

      await service.decide('c1', 's1', 'APPROVE', 'u1');

      expect(prisma.approvalChain.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'c1' }, data: { currentStep: 2 } }),
      );
    });

    it('on REJECT, skips every remaining PENDING step and moves the chain to REJECTED', async () => {
      prisma.approvalChain.findUnique.mockResolvedValue(
        chain({ steps: [{ id: 's1', stepOrder: 1, status: 'PENDING' }, { id: 's2', stepOrder: 2, status: 'PENDING' }] }),
      );
      prisma.approvalStep.update.mockResolvedValue({});
      prisma.approvalStep.updateMany.mockResolvedValue({ count: 1 });
      prisma.approvalChain.update.mockResolvedValue({ id: 'c1', status: 'REJECTED' });

      const result = await service.decide('c1', 's1', 'REJECT', 'u1', 'not needed');

      expect(prisma.approvalStep.updateMany).toHaveBeenCalledWith({
        where: { chainId: 'c1', status: 'PENDING', id: { not: 's1' } },
        data: { status: 'SKIPPED' },
      });
      expect(result.status).toBe('REJECTED');
    });

    it('doc 149 — a CONTACT decider writes decidedByContactId, never decidedById (typed to User)', async () => {
      prisma.approvalChain.findUnique.mockResolvedValue(chain());
      prisma.approvalStep.update.mockResolvedValue({});
      prisma.approvalChain.update.mockResolvedValue({ id: 'c1', status: 'APPROVED' });

      await service.decide('c1', 's1', 'APPROVE', 'contactA', undefined, prisma, 'CONTACT');

      expect(prisma.approvalStep.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: { status: 'APPROVED', decidedAt: expect.any(Date), decidedById: null, decidedByContactId: 'contactA', comment: null },
      });
    });
  });
});
