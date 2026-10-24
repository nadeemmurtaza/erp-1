import { AgencyStripeService } from './agency-stripe.service';

const mockInvoiceItemsCreate = jest.fn();
const mockInvoicesCreate = jest.fn();
const mockInvoicesFinalize = jest.fn();
const mockConstructEvent = jest.fn();

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    invoiceItems: { create: mockInvoiceItemsCreate },
    invoices: { create: mockInvoicesCreate, finalizeInvoice: mockInvoicesFinalize },
    webhooks: { constructEvent: mockConstructEvent },
  }));
});

describe('AgencyStripeService', () => {
  let prisma: any;
  let config: any;
  let tenants: any;
  let service: AgencyStripeService;
  const configValues: Record<string, unknown> = {
    PLATFORM_STRIPE_SECRET_KEY: 'sk_test_123',
    PLATFORM_STRIPE_WEBHOOK_SECRET: 'whsec_123',
    PLATFORM_BILLING_CURRENCY: 'usd',
    PLATFORM_INVOICE_NET_TERMS_DAYS: 15,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      platformInvoice: { update: jest.fn(), findUnique: jest.fn() },
    };
    config = { get: (key: string) => configValues[key] };
    tenants = { suspend: jest.fn(), reactivate: jest.fn() };
    service = new AgencyStripeService(prisma, config, tenants);
  });

  const tenant = { id: 't1', stripeCustomerId: 'cus_1', status: 'ACTIVE', suspendedReason: null } as any;
  const invoice = {
    id: 'inv_1',
    amountMinor: 5000,
    periodStart: new Date('2026-09-01'),
    periodEnd: new Date('2026-10-01'),
  } as any;

  describe('chargeInvoice', () => {
    it('does nothing when Stripe is not configured — internal invoicing is unaffected', async () => {
      configValues.PLATFORM_STRIPE_SECRET_KEY = undefined;
      await service.chargeInvoice(tenant, invoice);
      expect(mockInvoiceItemsCreate).not.toHaveBeenCalled();
      configValues.PLATFORM_STRIPE_SECRET_KEY = 'sk_test_123';
    });

    it('does nothing when the tenant has no stripeCustomerId', async () => {
      await service.chargeInvoice({ ...tenant, stripeCustomerId: null }, invoice);
      expect(mockInvoiceItemsCreate).not.toHaveBeenCalled();
    });

    it('creates an invoice item and a finalized Stripe invoice for the exact PlatformInvoice amount, then stores the linkage — never recomputes the charge', async () => {
      mockInvoicesCreate.mockResolvedValue({ id: 'in_stripe_1' });
      mockInvoicesFinalize.mockResolvedValue({ id: 'in_stripe_1', hosted_invoice_url: 'https://stripe.example/inv' });

      await service.chargeInvoice(tenant, invoice);

      expect(mockInvoiceItemsCreate).toHaveBeenCalledWith(
        expect.objectContaining({ customer: 'cus_1', amount: 5000, currency: 'usd' }),
      );
      expect(prisma.platformInvoice.update).toHaveBeenCalledWith({
        where: { id: 'inv_1' },
        data: { stripeInvoiceId: 'in_stripe_1', stripeHostedInvoiceUrl: 'https://stripe.example/inv', stripePaymentStatus: 'PENDING' },
      });
    });

    it('leaves stripeInvoiceId unset (defers to the next sweep) when Stripe errors — never a partial charge', async () => {
      mockInvoiceItemsCreate.mockRejectedValue(new Error('stripe down'));
      await service.chargeInvoice(tenant, invoice);
      expect(prisma.platformInvoice.update).not.toHaveBeenCalled();
    });
  });

  describe('handleWebhookEvent', () => {
    it('drops the event when the webhook secret is not configured', async () => {
      configValues.PLATFORM_STRIPE_WEBHOOK_SECRET = undefined;
      await service.handleWebhookEvent('{}', 'sig');
      expect(mockConstructEvent).not.toHaveBeenCalled();
      configValues.PLATFORM_STRIPE_WEBHOOK_SECRET = 'whsec_123';
    });

    it('drops the event when the signature does not verify', async () => {
      mockConstructEvent.mockImplementation(() => {
        throw new Error('bad signature');
      });
      await service.handleWebhookEvent('{}', 'bad-sig');
      expect(prisma.platformInvoice.findUnique).not.toHaveBeenCalled();
    });

    it('on invoice.paid, marks the matching PlatformInvoice PAID and reactivates a tenant suspended for non-payment (never one suspended for another reason)', async () => {
      mockConstructEvent.mockReturnValue({ type: 'invoice.paid', data: { object: { id: 'in_stripe_1' } } });
      prisma.platformInvoice.findUnique.mockResolvedValue({
        id: 'inv_1',
        tenant: { id: 't1', status: 'SUSPENDED', suspendedReason: 'Stripe payment failed for invoice inv_1' },
      });

      await service.handleWebhookEvent('{}', 'sig');

      expect(prisma.platformInvoice.update).toHaveBeenCalledWith({ where: { id: 'inv_1' }, data: { stripePaymentStatus: 'PAID' } });
      expect(tenants.reactivate).toHaveBeenCalledWith('t1');
    });

    it('on invoice.paid, never reactivates a tenant suspended for a reason unrelated to Stripe', async () => {
      mockConstructEvent.mockReturnValue({ type: 'invoice.paid', data: { object: { id: 'in_stripe_1' } } });
      prisma.platformInvoice.findUnique.mockResolvedValue({
        id: 'inv_1',
        tenant: { id: 't1', status: 'SUSPENDED', suspendedReason: 'Manual policy violation review' },
      });

      await service.handleWebhookEvent('{}', 'sig');

      expect(tenants.reactivate).not.toHaveBeenCalled();
    });

    it('on invoice.payment_failed, marks the invoice FAILED and suspends the tenant via the shared TenantsService (never a bespoke status write)', async () => {
      mockConstructEvent.mockReturnValue({ type: 'invoice.payment_failed', data: { object: { id: 'in_stripe_1' } } });
      prisma.platformInvoice.findUnique.mockResolvedValue({ id: 'inv_1', tenant: { id: 't1', status: 'ACTIVE' } });

      await service.handleWebhookEvent('{}', 'sig');

      expect(prisma.platformInvoice.update).toHaveBeenCalledWith({
        where: { id: 'inv_1' },
        data: { stripePaymentStatus: 'FAILED', stripePaymentFailedAt: expect.any(Date) },
      });
      expect(tenants.suspend).toHaveBeenCalledWith('t1', expect.stringContaining('inv_1'));
    });

    it('never auto-acts on customer.subscription.updated — logged only, per this codebase\'s no-destructive-webhook discipline', async () => {
      mockConstructEvent.mockReturnValue({ type: 'customer.subscription.updated', data: { object: { id: 'sub_1' } } });

      await service.handleWebhookEvent('{}', 'sig');

      expect(tenants.suspend).not.toHaveBeenCalled();
      expect(tenants.reactivate).not.toHaveBeenCalled();
      expect(prisma.platformInvoice.update).not.toHaveBeenCalled();
    });
  });
});
