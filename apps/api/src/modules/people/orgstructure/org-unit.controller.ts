import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../../core/auth/auth.constants';
import { CurrentUser, RequirePermission } from '../../../core/auth/decorators';
import { OrgUnitService } from './org-unit.service';
import { CreateOrgUnitDto, MoveOrgUnitDto, RenameOrgUnitDto } from './dto/org-unit.dto';

/**
 * hr-people-org/19-org-structure-offices-departments.md — reads sit behind
 * `org.structure.view`; every write additionally needs `org.structure.manage`
 * (WO-19.3), checked again inside `OrgUnitService` itself, never trusted
 * from the route decorator alone.
 */
@ApiTags('admin/org-structure')
@Controller('admin/org-structure')
@RequirePermission('org.structure.view', 'org.structure.manage')
export class OrgUnitController {
  constructor(private readonly units: OrgUnitService) {}

  @Get('types')
  @ApiOperation({ summary: 'Every configured unit type' })
  listTypes() {
    return this.units.listTypes();
  }

  @Get('tree')
  @ApiOperation({ summary: 'The whole org tree' })
  tree() {
    return this.units.tree();
  }

  @Get(':id')
  @ApiOperation({ summary: 'One unit' })
  get(@Param('id') id: string) {
    return this.units.get(id);
  }

  @Get(':id/subtree')
  @ApiOperation({ summary: 'One unit and everything under it' })
  subtree(@Param('id') id: string) {
    return this.units.subtree(id);
  }

  @Post()
  @RequirePermission('org.structure.manage')
  @ApiOperation({ summary: 'Create a unit — root if parentId is omitted' })
  create(@Body() dto: CreateOrgUnitDto, @CurrentUser() user: AuthenticatedUser) {
    return this.units.create(dto, user.id);
  }

  @Patch(':id/rename')
  @RequirePermission('org.structure.manage')
  @ApiOperation({ summary: 'Rename a unit' })
  rename(@Param('id') id: string, @Body() dto: RenameOrgUnitDto, @CurrentUser() user: AuthenticatedUser) {
    return this.units.rename(id, dto.name, user.id);
  }

  @Post(':id/move/preview')
  @RequirePermission('org.structure.manage')
  @ApiOperation({ summary: 'What a move would touch, without writing anything' })
  previewMove(@Param('id') id: string, @Body() dto: MoveOrgUnitDto) {
    return this.units.previewMove(id, dto.newParentId ?? null);
  }

  @Post(':id/move')
  @RequirePermission('org.structure.manage')
  @ApiOperation({ summary: 'Re-parent a unit, rewriting its whole subtree' })
  move(@Param('id') id: string, @Body() dto: MoveOrgUnitDto, @CurrentUser() user: AuthenticatedUser) {
    return this.units.move(id, dto.newParentId ?? null, user.id);
  }

  @Post(':id/close')
  @RequirePermission('org.structure.manage')
  @ApiOperation({ summary: 'Close a unit — never deleted' })
  close(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.units.close(id, user.id);
  }
}
