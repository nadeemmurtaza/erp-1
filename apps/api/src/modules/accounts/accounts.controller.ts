import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { DEFAULT_LOCALE, isLocale, type Locale } from '@newax/shared';
import {
  CART_COOKIE,
  LEGACY_CART_COOKIE,
  readCookie,
  type AuthenticatedUser,
} from '../../core/auth/auth.constants';
import { AuthenticatedOnly, CurrentUser, CustomerScope, RequirePermission } from '../../core/auth/decorators';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AccountsService } from './accounts.service';
import {
  CreateB2BAccountDto,
  DecideB2BOrderRequestDto,
  SetApprovalPolicyDto,
  UpdateB2BAccountDto,
} from './dto/accounts.dto';

const ACCOUNTS_PERMISSION = 'finance.credit-terms.manage';

@ApiTags('Accounts Admin — B2B accounts')
@Controller('admin/accounts/b2b')
export class B2BAccountsAdminController {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  @RequirePermission(ACCOUNTS_PERMISSION)
  @ApiOperation({ summary: 'List every B2B account' })
  async findAll() {
    return { data: await this.accounts.listAccounts() };
  }

  @Get(':id')
  @RequirePermission(ACCOUNTS_PERMISSION)
  @ApiOperation({ summary: 'Get a B2B account and its approval policy' })
  async findOne(@Param('id') id: string) {
    return this.accounts.getAccount(id);
  }

  @Post()
  @RequirePermission(ACCOUNTS_PERMISSION)
  @ApiOperation({ summary: "Open a standing account for a buyer's own contact" })
  async create(@Body() dto: CreateB2BAccountDto, @CurrentUser() user: AuthenticatedUser) {
    return this.accounts.createAccount(dto, user.id);
  }

  @Post(':id/update')
  @RequirePermission(ACCOUNTS_PERMISSION)
  @ApiOperation({ summary: 'Activate, deactivate, or change the purchase-order requirement' })
  async update(@Param('id') id: string, @Body() dto: UpdateB2BAccountDto, @CurrentUser() user: AuthenticatedUser) {
    return this.accounts.updateAccount(id, dto, user.id);
  }

  @Post(':id/approval-policy')
  @RequirePermission(ACCOUNTS_PERMISSION)
  @ApiOperation({ summary: 'Set the order-value threshold and the buyer contacts who may approve above it' })
  async setPolicy(@Param('id') id: string, @Body() dto: SetApprovalPolicyDto, @CurrentUser() user: AuthenticatedUser) {
    return this.accounts.setApprovalPolicy(id, dto, user.id);
  }
}

/**
 * The buyer-portal surface — gated by CUSTOMER_SCOPE_CATALOG's own
 * `b2b-account:read`/`b2b-account:write` (149-b2b-accounts-approvals-
 * sector-packs.md's own "a portal-side permission distinct from this
 * deployment's own PERMISSION_CATALOG"), never @RequirePermission: this is
 * the buyer's own internal purchasing control, not this organization's.
 */
@ApiTags('Accounts — my B2B account')
@Controller('accounts/mine')
export class B2BAccountsController {
  constructor(
    private readonly accounts: AccountsService,
    private readonly prisma: PrismaService,
  ) {}

  @AuthenticatedOnly()
  @CustomerScope('b2b-account:read')
  @Get()
  @ApiOperation({ summary: 'My standing account and its approval policy, if any' })
  async myAccount(@CurrentUser() user: AuthenticatedUser) {
    const contactId = await this.requireContactId(user.id);
    return this.accounts.getMyAccount(contactId);
  }

  @AuthenticatedOnly()
  @CustomerScope('b2b-account:read')
  @Get('order-requests')
  @ApiOperation({ summary: 'My own submitted purchase-approval requests' })
  async myRequests(@CurrentUser() user: AuthenticatedUser) {
    const contactId = await this.requireContactId(user.id);
    return { data: await this.accounts.listMyRequests(contactId) };
  }

  // No @CustomerScope: editing the approval policy changes WHO may approve
  // high-value orders on this account — an authority change, the same
  // "toxic" class of risk as submit/decide above — so a personal API key
  // never reaches it, session only.
  @AuthenticatedOnly()
  @Post('approval-policy')
  @ApiOperation({ summary: 'Edit my own account’s approval threshold and approvers — never this organization’s staff choosing them' })
  async setMyPolicy(@Body() dto: SetApprovalPolicyDto, @CurrentUser() user: AuthenticatedUser) {
    const contactId = await this.requireContactId(user.id);
    return this.accounts.setMyApprovalPolicy(contactId, dto);
  }

  @AuthenticatedOnly()
  @CustomerScope('b2b-account:read')
  @Get('pending-approvals')
  @ApiOperation({ summary: 'Orders waiting on my approval as a listed approver' })
  async pendingApprovals(@CurrentUser() user: AuthenticatedUser) {
    const contactId = await this.requireContactId(user.id);
    return { data: await this.accounts.listPendingApprovalsFor(contactId) };
  }

  // No @CustomerScope: submitting (and deciding, below) can end in a real
  // Order, the same reasoning checkout itself is left out of
  // CUSTOMER_SCOPE_CATALOG entirely (163-personal-api-keys.md §4) — a
  // personal API key can read this surface but never act on it yet.
  //
  // @Body() is untyped here on purpose: the checkout payload's own
  // validation (PlaceOrderDto's decorators) lives in the orders module,
  // which owns it — scripts/check-module-boundaries.mjs only allows a
  // cross-module import of a `.module` or a top-level `.service`, never a
  // DTO file, so AccountsService.submitOrderRequest() validates this raw
  // body itself via OrdersService.validatePlaceOrderDto() before using it.
  @AuthenticatedOnly()
  @Post('order-requests')
  @ApiOperation({ summary: "Submit my current cart for approval — at or above my account's threshold" })
  async submit(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: unknown,
    @Query('locale') locale?: string,
  ) {
    const contactId = await this.requireContactId(user.id);
    const token = cartToken(request);
    if (!token) throw new BadRequestException('No cart to submit.');
    return this.accounts.submitOrderRequest(contactId, user.id, token, dto, toLocale(locale));
  }

  @AuthenticatedOnly()
  @Post('order-requests/:id/decide')
  @ApiOperation({ summary: 'Approve or reject a pending request I am a listed approver for — never my own' })
  async decide(
    @Param('id') id: string,
    @Body() dto: DecideB2BOrderRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const contactId = await this.requireContactId(user.id);
    return this.accounts.decide(id, contactId, dto.decision, dto.comment);
  }

  private async requireContactId(userId: string): Promise<string> {
    const contact = await this.prisma.contact.findUnique({ where: { userId }, select: { id: true } });
    if (!contact) throw new NotFoundException('No customer profile is linked to this account yet.');
    return contact.id;
  }
}

function cartToken(request: Request): string | undefined {
  const header = request.header('x-cart-token');
  if (header) return header;

  const cookie = readCookie(request.cookies, CART_COOKIE, LEGACY_CART_COOKIE);
  return typeof cookie === 'string' ? cookie : undefined;
}

function toLocale(value: string | undefined): Locale {
  return value && isLocale(value) ? value : DEFAULT_LOCALE;
}
