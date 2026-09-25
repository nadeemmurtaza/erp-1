import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedOnly, CurrentUser } from '../../core/auth/decorators';
import { ReturnsService } from './returns.service';
import { CreateReturnRequestDto } from './dto/return-request.dto';

/** WO-7.3 — the customer's own side of a self-service return. */
@ApiTags('returns')
@Controller('returns')
@AuthenticatedOnly()
export class ReturnsAccountController {
  constructor(private readonly returns: ReturnsService) {}

  @Get('eligibility/:orderNumber')
  @ApiOperation({ summary: 'Can this order still be returned?' })
  async eligibility(@CurrentUser('id') userId: string, @Param('orderNumber') orderNumber: string) {
    return this.returns.checkEligibility(orderNumber, userId);
  }

  @Get()
  @ApiOperation({ summary: 'My return requests' })
  async mine(@CurrentUser('id') userId: string) {
    return this.returns.myReturns(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One of my return requests' })
  async getOne(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.returns.getMine(userId, id);
  }

  @Post()
  @ApiOperation({ summary: 'Open a self-service return' })
  async create(@CurrentUser('id') userId: string, @Body() dto: CreateReturnRequestDto) {
    return this.returns.create(userId, dto);
  }
}
