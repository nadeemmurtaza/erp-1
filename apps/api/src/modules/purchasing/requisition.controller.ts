import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../core/auth/auth.constants';
import { CurrentUser, RequirePermission } from '../../core/auth/decorators';
import { RequisitionService } from './requisition.service';
import { CreateRequisitionDto, DecideRequisitionDto, ConvertRequisitionDto } from './dto/requisition.dto';
import type { RequisitionApprovalStatus } from '../../core/prisma/client';

@ApiTags('Purchasing Admin — Requisitions')
@Controller('admin/requisitions')
export class RequisitionController {
  constructor(private readonly requisitions: RequisitionService) {}

  @Get()
  @RequirePermission('purchasing.requisitions.approve')
  @ApiOperation({ summary: 'List requisitions — the review queue for whoever can approve them' })
  async findAll(@Query('status') status?: RequisitionApprovalStatus) {
    return { data: await this.requisitions.findMany({ status }) };
  }

  @Get('mine')
  @RequirePermission('purchasing.requisitions.create')
  @ApiOperation({ summary: "The current user's own requisitions" })
  async findMine(@CurrentUser() user: AuthenticatedUser) {
    return { data: await this.requisitions.findMany({ requestedById: user.id }) };
  }

  @Get(':id')
  @RequirePermission('purchasing.requisitions.create')
  @ApiOperation({ summary: 'Get a requisition' })
  async findOne(@Param('id') id: string) {
    return this.requisitions.findOne(id);
  }

  @Post()
  @RequirePermission('purchasing.requisitions.create')
  @ApiOperation({ summary: 'Request a purchase — any staff member, not necessarily one who can raise a PO' })
  async create(@Body() dto: CreateRequisitionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.requisitions.create(dto, user.id);
  }

  @Post(':id/approve')
  @RequirePermission('purchasing.requisitions.approve')
  @ApiOperation({ summary: 'Approve a requisition — never its own requester' })
  async approve(@Param('id') id: string, @Body() dto: DecideRequisitionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.requisitions.approve(id, user.id, dto.comment);
  }

  @Post(':id/reject')
  @RequirePermission('purchasing.requisitions.approve')
  @ApiOperation({ summary: 'Reject a requisition — terminal; the requester raises a new one, never reopens this' })
  async reject(@Param('id') id: string, @Body() dto: DecideRequisitionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.requisitions.reject(id, user.id, dto.comment);
  }

  @Post(':id/convert')
  @RequirePermission('purchasing.manage')
  @ApiOperation({ summary: 'Convert an approved requisition into a real purchase order — a separate, explicit action' })
  async convert(@Param('id') id: string, @Body() dto: ConvertRequisitionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.requisitions.convertToPurchaseOrder(id, dto, user.id);
  }
}
