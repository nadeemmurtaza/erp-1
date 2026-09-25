import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { OpsAuthGuard } from '../../core/security/ops-auth.guard';
import { RequireOpsPermission } from '../../core/security/decorators';
import { BillingService } from './billing.service';
import { IssueCreditNoteDto, PreviewInvoiceDto } from './dto/credit-note.dto';

@Controller('billing')
@UseGuards(OpsAuthGuard)
@RequireOpsPermission('platform.billing.manage')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('tenant/:tenantId/invoices')
  listInvoices(@Param('tenantId') tenantId: string) {
    return this.billing.listInvoicesForTenant(tenantId);
  }

  /** Doc 50's own "dry run before live" — no write. */
  @Post('tenant/:tenantId/preview')
  preview(@Param('tenantId') tenantId: string, @Body() dto: PreviewInvoiceDto) {
    return this.billing.previewInvoice(tenantId, new Date(dto.periodStart), new Date(dto.periodEnd));
  }

  @Post('invoices/:invoiceId/credit-note')
  issueCreditNote(@Param('invoiceId') invoiceId: string, @Body() dto: IssueCreditNoteDto) {
    return this.billing.issueCreditNote(invoiceId, dto.amountMinor, dto.reason);
  }

  @Post('run')
  run(@Query('periodStart') periodStart: string, @Query('periodEnd') periodEnd: string) {
    return this.billing.runBillingForPeriod(new Date(periodStart), new Date(periodEnd));
  }
}
