import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Locale } from '@newax/shared';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { ApprovalService } from '../../../core/approvals/approval.service';
import { AuditService } from '../../../core/audit/audit.service';
import { NotificationsService } from '../../../core/notifications/notifications.service';
import { PricingService } from '../pricing/pricing.service';
import { OrdersService } from '../orders/orders.service';
import type { B2BAccount, B2BOrderRequest, B2BOrderRequestStatus, Prisma } from '../../../core/prisma/client';
import { CreateB2BAccountDto, SetApprovalPolicyDto, UpdateB2BAccountDto } from './dto/accounts.dto';

/**
 * 149-b2b-accounts-approvals-sector-packs.md. A thin layer over mechanisms
 * this repository already has in full — AccountProvider (payments module)
 * handles the actual credit check and settlement; this service only owns
 * the account/policy records and the buyer-side approval-request workflow.
 *
 * "Request or record": submitOrderRequest() never creates an Order, moves
 * stock, or posts a ledger line — an above-threshold order is a REQUEST
 * until a listed approver decides it, mirroring PurchaseRequisition's own
 * create()/decide()/convertToPurchaseOrder() split exactly (doc 63). Nothing
 * is committed until convertToOrder() calls OrdersService.place() for real.
 */
@Injectable()
export class AccountsService {
  private readonly logger = new Logger(AccountsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
    private readonly approvals: ApprovalService,
    private readonly orders: OrdersService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  // ---------------------------------------------------------------------
  // Staff admin — finance.credit-terms.manage, same key doc 145's own
  // credit-terms screen already uses (this doc's own "Authority and blast
  // radius" text).
  // ---------------------------------------------------------------------

  async listAccounts(): Promise<Array<B2BAccount & { customerName: string | null }>> {
    const accounts = await this.prisma.b2BAccount.findMany({
      include: { approvalPolicy: true },
      orderBy: { createdAt: 'desc' },
    });
    const contacts = await this.prisma.contact.findMany({
      where: { id: { in: accounts.map((a) => a.customerId) } },
      select: { id: true, name: true },
    });
    const nameById = new Map(contacts.map((c) => [c.id, c.name]));
    return accounts.map((account) => ({ ...account, customerName: nameById.get(account.customerId) ?? null }));
  }

  async getAccount(id: string) {
    const account = await this.prisma.b2BAccount.findUnique({ where: { id }, include: { approvalPolicy: true } });
    if (!account) throw new NotFoundException('B2B account not found.');
    return account;
  }

  async createAccount(dto: CreateB2BAccountDto, actorId: string): Promise<B2BAccount> {
    const contact = await this.prisma.contact.findUnique({ where: { id: dto.customerId } });
    if (!contact) throw new NotFoundException('No contact matches that customerId.');

    const existing = await this.prisma.b2BAccount.findUnique({ where: { customerId: dto.customerId } });
    if (existing) throw new ConflictException('This contact already has a B2B account.');

    const account = await this.prisma.b2BAccount.create({
      data: {
        customerId: dto.customerId,
        isActive: dto.isActive ?? true,
        requiresPurchaseOrder: dto.requiresPurchaseOrder ?? false,
      },
    });

    await this.audit.record({
      actorId,
      action: 'accounts.b2b_account_created',
      entity: 'B2BAccount',
      entityId: account.id,
      data: { customerId: account.customerId },
    });

    return account;
  }

  /** `isActive = false` stops new on-account orders immediately (AccountProvider reads it live) — "the grant that ends itself." */
  async updateAccount(id: string, dto: UpdateB2BAccountDto, actorId: string): Promise<B2BAccount> {
    const existing = await this.getAccount(id);

    const account = await this.prisma.b2BAccount.update({
      where: { id },
      data: { isActive: dto.isActive, requiresPurchaseOrder: dto.requiresPurchaseOrder },
    });

    await this.audit.record({
      actorId,
      action: 'accounts.b2b_account_updated',
      entity: 'B2BAccount',
      entityId: id,
      data: {
        before: { isActive: existing.isActive, requiresPurchaseOrder: existing.requiresPurchaseOrder },
        after: { isActive: account.isActive, requiresPurchaseOrder: account.requiresPurchaseOrder },
      },
    });

    return account;
  }

  /**
   * This organization sets/edits the threshold on this org's own behalf
   * (finance.credit-terms.manage, staff-side) — the buyer's own admin
   * contact is the one who should be naming which of THEIR staff may
   * approve, through the buyer-portal screen (WO-149.4); this endpoint
   * exists for the staff side of setting it up (and for a deployment with
   * no live portal yet) so the capability is never backend-only.
   */
  async setApprovalPolicy(accountId: string, dto: SetApprovalPolicyDto, actorId: string) {
    await this.getAccount(accountId);

    const contacts = await this.prisma.contact.findMany({ where: { id: { in: dto.approverContactIds } } });
    if (contacts.length !== dto.approverContactIds.length) {
      throw new BadRequestException('Every approverContactId must be a real contact.');
    }

    const policy = await this.prisma.b2BPurchaseApprovalPolicy.upsert({
      where: { b2bAccountId: accountId },
      create: { b2bAccountId: accountId, thresholdMinor: dto.thresholdMinor, approverContactIds: dto.approverContactIds },
      update: { thresholdMinor: dto.thresholdMinor, approverContactIds: dto.approverContactIds },
    });

    await this.audit.record({
      actorId,
      action: 'accounts.b2b_approval_policy_set',
      entity: 'B2BPurchaseApprovalPolicy',
      entityId: accountId,
      data: { thresholdMinor: policy.thresholdMinor, approverContactIds: policy.approverContactIds },
    });

    return policy;
  }

  // ---------------------------------------------------------------------
  // Buyer portal
  // ---------------------------------------------------------------------

  async getMyAccount(contactId: string) {
    const account = await this.prisma.b2BAccount.findUnique({
      where: { customerId: contactId },
      include: { approvalPolicy: true },
    });
    if (!account?.approvalPolicy) return account;

    const approvers = await this.prisma.contact.findMany({
      where: { id: { in: account.approvalPolicy.approverContactIds } },
      select: { id: true, name: true, phoneE164: true },
    });
    return { ...account, approvalPolicy: { ...account.approvalPolicy, approvers } };
  }

  /**
   * "Authority and blast radius" — editing the approval policy itself
   * (who may approve, and at what amount) is the buyer's OWN internal
   * control, never this organization's staff choosing it for them: only the
   * account's own primary contact (`B2BAccount.customerId`) may call this,
   * reusing the identical upsert the staff-side setApprovalPolicy() above
   * uses — never a second, divergent write path.
   */
  async setMyApprovalPolicy(contactId: string, dto: SetApprovalPolicyDto) {
    const account = await this.prisma.b2BAccount.findUnique({ where: { customerId: contactId } });
    if (!account) throw new NotFoundException('You do not have a B2B account.');
    return this.setApprovalPolicy(account.id, dto, contactId);
  }

  async listMyRequests(contactId: string): Promise<Array<B2BOrderRequest & { requestedByName: string | null }>> {
    const account = await this.prisma.b2BAccount.findUnique({ where: { customerId: contactId } });
    if (!account) return [];
    const requests = await this.prisma.b2BOrderRequest.findMany({
      where: { b2bAccountId: account.id },
      orderBy: { createdAt: 'desc' },
    });
    return this.withRequesterNames(requests);
  }

  /** Every pending request naming this contact as an eligible approver — the buyer's own approval inbox. */
  async listPendingApprovalsFor(contactId: string): Promise<Array<B2BOrderRequest & { requestedByName: string | null }>> {
    const requests = await this.prisma.b2BOrderRequest.findMany({
      where: { status: 'PENDING', b2bAccount: { approvalPolicy: { approverContactIds: { has: contactId } } } },
      orderBy: { createdAt: 'asc' },
    });
    return this.withRequesterNames(requests);
  }

  /** No customer-facing contact directory exists yet (163 §4 lists what the storefront deliberately does not expose) — this is the one small server-side join that lets the buyer-portal read screen show a name instead of a bare id. */
  private async withRequesterNames(
    requests: B2BOrderRequest[],
  ): Promise<Array<B2BOrderRequest & { requestedByName: string | null }>> {
    if (requests.length === 0) return [];
    const contacts = await this.prisma.contact.findMany({
      where: { id: { in: [...new Set(requests.map((r) => r.requestedByContactId))] } },
      select: { id: true, name: true },
    });
    const nameById = new Map(contacts.map((c) => [c.id, c.name]));
    return requests.map((r) => ({ ...r, requestedByName: nameById.get(r.requestedByContactId) ?? null }));
  }

  /**
   * Submits the signed-in buyer's own cart as a purchase-approval request.
   * Never creates an Order, moves stock, or touches accounting — "Request
   * or record." The stored `paymentDto` is replayed verbatim by
   * convertToOrder() once approved, the same re-price-from-the-database
   * discipline OrdersService.place() already applies to it a second time.
   *
   * `rawDto` is unvalidated (the accounts module never imports the orders
   * module's own DTO/decorators — module-boundary "depth" rule) —
   * OrdersService.validatePlaceOrderDto() runs the identical PlaceOrderDto
   * validation main.ts's global pipe already applies to POST /orders.
   */
  async submitOrderRequest(
    contactId: string,
    userId: string | undefined,
    cartToken: string,
    rawDto: unknown,
    locale: Locale,
  ): Promise<B2BOrderRequest> {
    const dto = await this.orders.validatePlaceOrderDto(rawDto);

    const account = await this.prisma.b2BAccount.findUnique({ where: { customerId: contactId } });
    if (!account || !account.isActive) {
      throw new ForbiddenException('You do not have an active account for on-account orders.');
    }

    const policy = await this.prisma.b2BPurchaseApprovalPolicy.findUnique({ where: { b2bAccountId: account.id } });
    if (!policy) {
      throw new BadRequestException('Your account has no approval policy configured — place this order directly instead.');
    }
    if (policy.approverContactIds.length === 0) {
      // "The failure path" — a misconfigured policy is refused at
      // submission, never silently stuck in an unapprovable state.
      throw new BadRequestException('This account’s approval policy names no approver — contact your account manager.');
    }

    const amountMinor = await this.estimateCartAmountMinor(cartToken, contactId);
    if (amountMinor < policy.thresholdMinor) {
      throw new BadRequestException(
        `This order (Rs ${Math.round(amountMinor / 100)}) is below your account’s Rs ${Math.round(policy.thresholdMinor / 100)} approval threshold — place it directly at checkout instead.`,
      );
    }

    const request = await this.prisma.$transaction(async (tx) => {
      const created = await tx.b2BOrderRequest.create({
        data: {
          b2bAccountId: account.id,
          requestedByContactId: contactId,
          requestedByUserId: userId ?? null,
          cartToken,
          locale,
          paymentDto: dto as unknown as Prisma.InputJsonValue,
          amountMinor,
        },
      });

      // Single-tier: any ONE of the buyer's own listed approver contacts
      // may decide it — a set, not a sequence (doc 149's own Out of Scope:
      // multi-tier chains are doc 63's existing mechanism, not built here).
      await this.approvals.start('B2B_ORDER', created.id, [{ approverContactIds: policy.approverContactIds }], tx);

      return created;
    });

    await this.notifyApprovers(policy.approverContactIds, request);

    return request;
  }

  /**
   * The requester of a B2BOrderRequest is never its own approver, even if
   * listed in approverContactIds ("the toxic pair" lens) — the identical
   * self-approval refusal RequisitionService.decide() already applies,
   * restated here at the calling layer because ApprovalService itself
   * deliberately does not resolve who may decide a step.
   */
  async decide(
    requestId: string,
    actorContactId: string,
    decision: 'APPROVE' | 'REJECT',
    comment?: string,
  ): Promise<B2BOrderRequest> {
    const request = await this.prisma.b2BOrderRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new NotFoundException('Approval request not found.');
    if (request.requestedByContactId === actorContactId) {
      throw new ForbiddenException('The buyer who submitted this order cannot approve or reject it themselves.');
    }
    if (request.status !== 'PENDING') {
      throw new ConflictException(`This request is already ${request.status}.`);
    }

    const policy = await this.prisma.b2BPurchaseApprovalPolicy.findUnique({ where: { b2bAccountId: request.b2bAccountId } });
    if (!policy || !policy.approverContactIds.includes(actorContactId)) {
      throw new ForbiddenException('You are not a listed approver for this account.');
    }

    const decided = await this.prisma.$transaction(async (tx) => {
      const chain = await this.approvals.getChain('B2B_ORDER', requestId, tx);
      if (!chain) throw new NotFoundException('No approval chain found for this request.');
      const step = chain.steps.find((s) => s.status === 'PENDING');
      if (!step) throw new ConflictException('No pending approval step on this request.');

      const chainResult = await this.approvals.decide(chain.id, step.id, decision, actorContactId, comment, tx, 'CONTACT');

      return tx.b2BOrderRequest.update({
        where: { id: requestId },
        data: {
          status: chainResult.status as B2BOrderRequestStatus,
          rejectionNote: decision === 'REJECT' ? (comment?.trim() || null) : undefined,
        },
      });
    });

    if (decided.status === 'APPROVED') {
      return this.convertToOrder(decided.id);
    }
    return decided;
  }

  /**
   * Converts an APPROVED request into a real Order through the identical
   * order-placement path every other order already uses
   * (OrdersService.place()) — race-safe the same way
   * RequisitionService.convertToPurchaseOrder() already claims a
   * requisition: a lost race (or a retried call) leaves the second attempt
   * with nothing to convert rather than a second Order.
   */
  async convertToOrder(requestId: string): Promise<B2BOrderRequest> {
    const claimed = await this.prisma.b2BOrderRequest.updateMany({
      where: { id: requestId, status: 'APPROVED' },
      data: { status: 'CONVERTED' },
    });
    if (claimed.count === 0) {
      const current = await this.prisma.b2BOrderRequest.findUnique({ where: { id: requestId } });
      if (!current) throw new NotFoundException('Approval request not found.');
      if (current.status === 'CONVERTED' && current.orderId) return current;
      throw new ConflictException(`Only an APPROVED request can be converted (this one is ${current.status}).`);
    }

    const request = await this.prisma.b2BOrderRequest.findUniqueOrThrow({ where: { id: requestId } });

    try {
      const order = await this.orders.place(
        request.cartToken,
        request.requestedByUserId ?? undefined,
        request.paymentDto as unknown as Parameters<OrdersService['place']>[2],
        request.locale as Locale,
      );
      return this.prisma.b2BOrderRequest.update({ where: { id: requestId }, data: { orderId: order.id } });
    } catch (error) {
      // Placement failed after approval (stock ran out while waiting, say).
      // Leave the request CONVERTED-but-unlinked rather than silently
      // reverting to APPROVED and re-triggering a second conversion attempt
      // automatically — a real failure here needs a human to look at it
      // (WO-149's own "failure path" lens), not a silent retry loop.
      this.logger.error(
        `B2BOrderRequest ${requestId} was approved but could not be placed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw error;
    }
  }

  /**
   * An approximate order total, used only for the threshold decision — the
   * REAL, binding amount is whatever OrdersService.place() computes fresh
   * at conversion time. Reuses PricingService.resolvePrices() (the same
   * batched resolution cart/orders already use), never a second pricing
   * algorithm.
   */
  private async estimateCartAmountMinor(cartToken: string, contactId: string): Promise<number> {
    const cart = await this.prisma.cart.findUnique({
      where: { token: cartToken },
      include: { items: { include: { variant: true, product: true } } },
    });
    if (!cart || cart.items.length === 0) {
      throw new BadRequestException('That cart is empty or no longer exists.');
    }

    const resolved = await this.pricing.resolvePrices(
      cart.items.map((item) => ({ variantId: item.variantId, quantity: item.quantity })),
      contactId,
    );

    return cart.items.reduce((sum, item) => {
      const unitPrice = resolved.get(item.variantId) ?? item.variant.priceOverride ?? item.product.basePrice;
      return sum + unitPrice * item.quantity;
    }, 0);
  }

  /** "Audience is a capability, not an address" — resolved from the policy row's own approverContactIds, never a hardcoded address. */
  private async notifyApprovers(approverContactIds: string[], request: B2BOrderRequest): Promise<void> {
    const approvers = await this.prisma.contact.findMany({
      where: { id: { in: approverContactIds } },
      select: { name: true, email: true, phoneE164: true },
    });
    if (approvers.length === 0) {
      this.logger.warn(`B2BOrderRequest ${request.id} has no resolvable approver contacts — no one was notified.`);
      return;
    }
    await Promise.all(
      approvers.map((approver) =>
        this.notifications.send({
          template: 'accounts.b2b_order_request_pending',
          recipient: { name: approver.name, email: approver.email, phone: approver.phoneE164 },
          subject: 'An order needs your approval',
          body: `An order of Rs ${Math.round(request.amountMinor / 100)} is waiting for your approval.`,
        }),
      ),
    );
  }
}
