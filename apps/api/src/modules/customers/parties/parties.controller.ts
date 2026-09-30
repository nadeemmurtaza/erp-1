import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../../core/auth/decorators';
import { PartiesService } from './parties.service';
import { CreatePartyDto } from './dto/party.dto';
import type { PartyRoleName } from '../../../core/prisma/client';

@ApiTags('Parties Admin')
@Controller('admin/parties')
@RequirePermission('parties.manage')
export class PartiesController {
  constructor(private readonly parties: PartiesService) {}

  @Get('search')
  @ApiOperation({ summary: 'Typeahead search for the counterparty picker' })
  async search(@Query('q') q?: string, @Query('role') role?: PartyRoleName) {
    return { data: await this.parties.search(q, role) };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a party' })
  async get(@Param('id') id: string) {
    return this.parties.get(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a party directly (not via a role-specific create like Supplier)' })
  async create(@Body() dto: CreatePartyDto) {
    return this.parties.create(dto);
  }
}
