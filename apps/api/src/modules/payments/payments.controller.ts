import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import type { AuthenticatedUser } from '../../core/auth/auth.constants';
import { CurrentUser, Public, RequirePermission } from '../../core/auth/decorators';
import { PaymentsService } from './payments.service';

class RedeemGiftCardDto {
  @IsString()
  @IsNotEmpty()
  code!: string;
}

class ApprovePaymentDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

class RefundPaymentDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  /** Paisa. Omit for a full refund of the amount paid. */
  amount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

interface UploadedReceipt {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Public()
  @Get('methods')
  @ApiOperation({ summary: 'Payment methods currently accepted' })
  methods() {
    return this.payments.listAvailable();
  }

  @Public()
  @Post('callback/:provider')
  @ApiOperation({ summary: 'Gateway return URL — verifies and settles a payment' })
  callback(
    @Param('provider') provider: string,
    @Body() payload: Record<string, unknown>,
  ) {
    return this.payments.handleCallback(provider, payload);
  }

  @Public()
  @Post(':paymentId/receipt')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
  })
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload a bank-transfer receipt for staff to approve' })
  uploadReceipt(
    @Param('paymentId') paymentId: string,
    @UploadedFile() file: UploadedReceipt | undefined,
  ) {
    if (!file) {
      throw new BadRequestException('Choose a receipt image to upload.');
    }
    return this.payments.attachReceipt(paymentId, file);
  }

  @Public()
  @Post(':paymentId/redeem-gift-card')
  @ApiOperation({ summary: 'Redeem a third-party gift card code against a payment awaiting one (Giftkarta et al.)' })
  // A code-guessing brute force against someone else's card is the real risk
  // here (the same reasoning WO-5's own promo-code validate endpoint is
  // throttled) — generous enough for a customer correcting a typo.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  redeemGiftCard(@Param('paymentId') paymentId: string, @Body() dto: RedeemGiftCardDto) {
    return this.payments.redeemGiftCardCode(paymentId, dto.code);
  }
}

@ApiTags('admin/payments')
@Controller('admin/payments')
@RequirePermission('payments.approve')
export class PaymentsAdminController {
  constructor(private readonly payments: PaymentsService) {}

  @Get('awaiting-approval')
  @ApiOperation({ summary: 'Payments waiting on a human decision' })
  awaitingApproval() {
    return this.payments.listAwaitingApproval();
  }

  @Post(':paymentId/approve')
  @ApiOperation({ summary: 'Confirm a bank transfer, or cash collected on delivery' })
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('paymentId') paymentId: string,
    @Body() dto: ApprovePaymentDto,
  ) {
    return this.payments.approve(user.id, paymentId, dto.note);
  }

  @Post(':paymentId/refund')
  @ApiOperation({ summary: 'Mark a paid payment refunded (full or partial)' })
  refund(
    @CurrentUser() user: AuthenticatedUser,
    @Param('paymentId') paymentId: string,
    @Body() dto: RefundPaymentDto,
  ) {
    return this.payments.refund(user.id, paymentId, dto.amount, dto.note);
  }
}
