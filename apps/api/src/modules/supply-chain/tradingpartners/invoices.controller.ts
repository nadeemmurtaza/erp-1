import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../../core/auth/decorators';
import { InvoiceService } from './invoice.service';
import { CreateInvoiceDto, InvoiceQueryDto } from './dto/invoice.dto';

@ApiTags('Trading Partner Invoices')
@Controller('admin/invoices')
@RequirePermission('orders.manage')
export class InvoicesController {
  constructor(private readonly invoices: InvoiceService) {}

  @Get()
  @ApiOperation({ summary: 'List invoices issued to trading partners' })
  async findAll(@Query() query: InvoiceQueryDto) {
    return { data: await this.invoices.findAll(query) };
  }

  @Get('overdue-summary')
  @ApiOperation({ summary: 'Count, total and oldest due date of ISSUED invoices past their due date' })
  async overdueSummary() {
    return this.invoices.overdueInvoicesSummary();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an invoice' })
  async findOne(@Param('id') id: string) {
    return this.invoices.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Issue an invoice — auto-pushed to the trading partner immediately' })
  async issue(@Body() dto: CreateInvoiceDto) {
    return this.invoices.issue(dto);
  }
}
