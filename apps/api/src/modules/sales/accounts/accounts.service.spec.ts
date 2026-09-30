import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { ApprovalService } from '../../../core/approvals/approval.service';
import { AuditService } from '../../../core/audit/audit.service';
import { NotificationsService } from '../../../core/notifications/notifications.service';
import { PricingService } from '../pricing/pricing.service';
import { OrdersService } from '../orders/orders.service';

describe('AccountsService — 149-b2b-accounts-approvals-sector-packs.md', () => {
  let service: AccountsService;
  let prisma: any;
  let tx: any;
  let pricing: any;
  let approvals: any;
  let orders: any;
  let audit: any;
  let notifications: any;

  beforeEach(() => {
    tx = {
      b2BOrderRequest: { create: jest.fn(), update: jest.fn(), updateMany: jest.fn(), findUniqueOrThrow: jest.fn() },
    };
    prisma = {
      $transaction: jest.fn((cb: any) => cb(tx)),
      b2BAccount: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      b2BPurchaseApprovalPolicy: { findUnique: jest.fn() },
      b2BOrderRequest: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        findUniqueOrThrow: jest.fn(),
      },
      contact: { findMany: jest.fn().mockResolvedValue([]) },
      cart: { findUnique: jest.fn() },
    };
    pricing = { resolvePrices: jest.fn().mockResolvedValue(new Map()) };
    approvals = { start: jest.fn(), getChain: jest.fn(), decide: jest.fn() };
    orders = { validatePlaceOrderDto: jest.fn(async (raw: unknown) => raw), place: jest.fn() };
    audit = { record: jest.fn() };
    notifications = { send: jest.fn() };

    service = new AccountsService(
      prisma as PrismaService,
      pricing as PricingService,
      approvals as ApprovalService,
      orders as OrdersService,
      audit as AuditService,
      notifications as NotificationsService,
    );
  });

  describe('submitOrderRequest', () => {
    const cart = {
      items: [
        { variantId: 'v1', quantity: 2, variant: { priceOverride: null }, product: { basePrice: 5000 } },
      ],
    };

    it('refuses a buyer with no active account', async () => {
      prisma.b2BAccount.findUnique.mockResolvedValue(null);

      await expect(
        service.submitOrderRequest('contact1', 'user1', 'cart-token', {}, 'en'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses when the account has no approval policy', async () => {
      prisma.b2BAccount.findUnique.mockResolvedValue({ id: 'acct1', isActive: true });
      prisma.b2BPurchaseApprovalPolicy.findUnique.mockResolvedValue(null);

      await expect(
        service.submitOrderRequest('contact1', 'user1', 'cart-token', {}, 'en'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses a misconfigured policy with no approvers — "the failure path"', async () => {
      prisma.b2BAccount.findUnique.mockResolvedValue({ id: 'acct1', isActive: true });
      prisma.b2BPurchaseApprovalPolicy.findUnique.mockResolvedValue({
        b2bAccountId: 'acct1',
        thresholdMinor: 1000,
        approverContactIds: [],
      });

      await expect(
        service.submitOrderRequest('contact1', 'user1', 'cart-token', {}, 'en'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses a cart below the threshold — place it directly instead', async () => {
      prisma.b2BAccount.findUnique.mockResolvedValue({ id: 'acct1', isActive: true });
      prisma.b2BPurchaseApprovalPolicy.findUnique.mockResolvedValue({
        b2bAccountId: 'acct1',
        thresholdMinor: 100_000,
        approverContactIds: ['approver1'],
      });
      prisma.cart.findUnique.mockResolvedValue(cart);

      await expect(
        service.submitOrderRequest('contact1', 'user1', 'cart-token', {}, 'en'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('creates the request and starts a single-tier chain naming every approver contact', async () => {
      prisma.b2BAccount.findUnique.mockResolvedValue({ id: 'acct1', isActive: true });
      prisma.b2BPurchaseApprovalPolicy.findUnique.mockResolvedValue({
        b2bAccountId: 'acct1',
        thresholdMinor: 1000,
        approverContactIds: ['approver1', 'approver2'],
      });
      prisma.cart.findUnique.mockResolvedValue(cart);
      tx.b2BOrderRequest.create.mockResolvedValue({ id: 'req1', amountMinor: 10_000 });

      const result = await service.submitOrderRequest('contact1', 'user1', 'cart-token', { paymentMethod: 'account' }, 'en');

      expect(orders.validatePlaceOrderDto).toHaveBeenCalledWith({ paymentMethod: 'account' });
      expect(tx.b2BOrderRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            b2bAccountId: 'acct1',
            requestedByContactId: 'contact1',
            requestedByUserId: 'user1',
            cartToken: 'cart-token',
          }),
        }),
      );
      expect(approvals.start).toHaveBeenCalledWith(
        'B2B_ORDER',
        'req1',
        [{ approverContactIds: ['approver1', 'approver2'] }],
        tx,
      );
      expect(result.id).toBe('req1');
    });
  });

  describe('decide — the toxic-pair refusal', () => {
    it('refuses when the actor is the request\'s own requester, even if listed as an approver', async () => {
      prisma.b2BOrderRequest.findUnique.mockResolvedValue({
        id: 'req1',
        requestedByContactId: 'contact1',
        status: 'PENDING',
        b2bAccountId: 'acct1',
      });

      await expect(service.decide('req1', 'contact1', 'APPROVE')).rejects.toBeInstanceOf(ForbiddenException);
      expect(approvals.decide).not.toHaveBeenCalled();
    });

    it('404s for a request that does not exist', async () => {
      prisma.b2BOrderRequest.findUnique.mockResolvedValue(null);

      await expect(service.decide('missing', 'approver1', 'APPROVE')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses to decide a request that is not PENDING', async () => {
      prisma.b2BOrderRequest.findUnique.mockResolvedValue({
        id: 'req1',
        requestedByContactId: 'contact1',
        status: 'APPROVED',
        b2bAccountId: 'acct1',
      });

      await expect(service.decide('req1', 'approver1', 'APPROVE')).rejects.toBeInstanceOf(ConflictException);
    });

    it('refuses a contact who is not a listed approver', async () => {
      prisma.b2BOrderRequest.findUnique.mockResolvedValue({
        id: 'req1',
        requestedByContactId: 'contact1',
        status: 'PENDING',
        b2bAccountId: 'acct1',
      });
      prisma.b2BPurchaseApprovalPolicy.findUnique.mockResolvedValue({ approverContactIds: ['approver1'] });

      await expect(service.decide('req1', 'someone-else', 'APPROVE')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('a listed approver CAN approve, and REJECT never converts to an order', async () => {
      prisma.b2BOrderRequest.findUnique.mockResolvedValue({
        id: 'req1',
        requestedByContactId: 'contact1',
        status: 'PENDING',
        b2bAccountId: 'acct1',
      });
      prisma.b2BPurchaseApprovalPolicy.findUnique.mockResolvedValue({ approverContactIds: ['approver1'] });
      approvals.getChain.mockResolvedValue({ id: 'c1', steps: [{ id: 's1', status: 'PENDING' }] });
      approvals.decide.mockResolvedValue({ status: 'REJECTED' });
      tx.b2BOrderRequest.update.mockResolvedValue({ id: 'req1', status: 'REJECTED' });

      const result = await service.decide('req1', 'approver1', 'REJECT', 'too much this month');

      expect(approvals.decide).toHaveBeenCalledWith('c1', 's1', 'REJECT', 'approver1', 'too much this month', tx, 'CONTACT');
      expect(orders.place).not.toHaveBeenCalled();
      expect(result.status).toBe('REJECTED');
    });

    it('an APPROVE that completes the chain converts the request into a real order', async () => {
      prisma.b2BOrderRequest.findUnique.mockResolvedValue({
        id: 'req1',
        requestedByContactId: 'contact1',
        status: 'PENDING',
        b2bAccountId: 'acct1',
      });
      prisma.b2BPurchaseApprovalPolicy.findUnique.mockResolvedValue({ approverContactIds: ['approver1'] });
      approvals.getChain.mockResolvedValue({ id: 'c1', steps: [{ id: 's1', status: 'PENDING' }] });
      approvals.decide.mockResolvedValue({ status: 'APPROVED' });
      tx.b2BOrderRequest.update.mockResolvedValue({ id: 'req1', status: 'APPROVED' });
      prisma.b2BOrderRequest.updateMany.mockResolvedValue({ count: 1 });
      prisma.b2BOrderRequest.findUniqueOrThrow.mockResolvedValue({
        id: 'req1',
        cartToken: 'cart-token',
        requestedByUserId: 'user1',
        paymentDto: { paymentMethod: 'account' },
        locale: 'en',
      });
      orders.place.mockResolvedValue({ id: 'order1' });
      prisma.b2BOrderRequest.update.mockResolvedValue({ id: 'req1', status: 'CONVERTED', orderId: 'order1' });

      const result = await service.decide('req1', 'approver1', 'APPROVE');

      expect(orders.place).toHaveBeenCalledWith('cart-token', 'user1', { paymentMethod: 'account' }, 'en');
      expect(prisma.b2BOrderRequest.update).toHaveBeenCalledWith({ where: { id: 'req1' }, data: { orderId: 'order1' } });
      expect(result.orderId).toBe('order1');
    });
  });

  describe('convertToOrder — race safety', () => {
    it('is a no-op the second time — a lost race leaves nothing to convert twice', async () => {
      prisma.b2BOrderRequest.updateMany.mockResolvedValue({ count: 0 });
      prisma.b2BOrderRequest.findUnique.mockResolvedValue({ id: 'req1', status: 'CONVERTED', orderId: 'order1' });

      const result = await service.convertToOrder('req1');

      expect(orders.place).not.toHaveBeenCalled();
      expect(result.orderId).toBe('order1');
    });

    it('refuses to convert a request that was never approved', async () => {
      prisma.b2BOrderRequest.updateMany.mockResolvedValue({ count: 0 });
      prisma.b2BOrderRequest.findUnique.mockResolvedValue({ id: 'req1', status: 'PENDING' });

      await expect(service.convertToOrder('req1')).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
