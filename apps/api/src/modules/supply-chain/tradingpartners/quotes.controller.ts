import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../../core/auth/decorators';
import { QuoteService } from './quote.service';
import { CreateQuoteDto } from './dto/quote.dto';

@ApiTags('Trading Partner Quotes')
@Controller('admin/quotes')
@RequirePermission('orders.manage')
export class QuotesController {
  constructor(private readonly quotes: QuoteService) {}

  @Get()
  @ApiOperation({ summary: 'List quotes sent to trading partners' })
  async findAll() {
    return { data: await this.quotes.findAll() };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a quote' })
  async findOne(@Param('id') id: string) {
    return this.quotes.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Send a quote — auto-pushed to the trading partner immediately' })
  async send(@Body() dto: CreateQuoteDto) {
    return this.quotes.send(dto);
  }
}
