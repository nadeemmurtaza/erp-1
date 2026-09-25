import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { OpsAuthGuard } from '../../core/security/ops-auth.guard';
import { CurrentOpsClient, RequireOpsPermission } from '../../core/security/decorators';
import { CustomQuoteService } from './custom-quote.service';
import { RejectQuoteDto, RequestQuoteDto } from './dto/request-quote.dto';
import type { PlatformOpsClient } from '../../core/prisma/client';

@Controller('custom-quotes')
@UseGuards(OpsAuthGuard)
@RequireOpsPermission('platform.billing.manage')
export class CustomQuoteController {
  constructor(private readonly quotes: CustomQuoteService) {}

  @Post()
  request(@Body() dto: RequestQuoteDto, @CurrentOpsClient() opsClient: PlatformOpsClient) {
    return this.quotes.requestQuote({ ...dto, requestedByOpsClientId: opsClient.id });
  }

  @Get('pending')
  listPending() {
    return this.quotes.listPending();
  }

  @Get('tenant/:tenantId')
  listForTenant(@Param('tenantId') tenantId: string) {
    return this.quotes.listForTenant(tenantId);
  }

  @Patch(':id/approve')
  approve(@Param('id') id: string, @CurrentOpsClient() opsClient: PlatformOpsClient) {
    return this.quotes.approve(id, opsClient.id);
  }

  @Patch(':id/reject')
  reject(@Param('id') id: string, @Body() dto: RejectQuoteDto) {
    return this.quotes.reject(id, dto.reason);
  }
}
