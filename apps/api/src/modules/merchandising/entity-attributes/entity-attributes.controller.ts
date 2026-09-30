import { Body, Controller, ForbiddenException, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedOnly, CurrentUser } from '../../../core/auth/decorators';
import type { AuthenticatedUser } from '../../../core/auth/auth.constants';
import { EntityAttributeService } from './entity-attributes.service';
import { SetEntityAttributeDto } from './dto/entity-attribute.dto';

/**
 * architecture-patterns/140-general-eav-extensibility-model.md (WO-140.2).
 * `entityType` carries no schema-level allowlist (that is the whole point
 * of the general form vs. doc 104's bounded one) — but this controller
 * still needs to know which permission gates a given entity, or any
 * signed-in user could read/write attributes on any table by name. This
 * map is the one place that maintained knowledge lives; an entityType not
 * on it is refused, never defaulted to "anyone may edit."
 */
const ENTITY_TYPE_EDIT_PERMISSION: Record<string, string> = {
  Supplier: 'suppliers.manage',
};

@ApiTags('admin/entity-attributes')
@Controller('admin/entity-attributes')
export class EntityAttributesController {
  constructor(private readonly attributes: EntityAttributeService) {}

  @Get()
  @AuthenticatedOnly()
  @ApiOperation({ summary: "One entity's own attributes, gated by that entity's own edit permission" })
  list(@Query('entityType') entityType: string, @Query('entityId') entityId: string, @CurrentUser() user: AuthenticatedUser) {
    this.requireEntityEditAccess(entityType, user);
    return this.attributes.getAttributes(entityType, entityId);
  }

  @Post()
  @AuthenticatedOnly()
  @ApiOperation({ summary: "Set one attribute on one entity, gated by that entity's own edit permission" })
  set(@Body() dto: SetEntityAttributeDto, @CurrentUser() user: AuthenticatedUser) {
    this.requireEntityEditAccess(dto.entityType, user);
    return this.attributes.setAttribute(dto);
  }

  private requireEntityEditAccess(entityType: string, user: AuthenticatedUser): void {
    const required = ENTITY_TYPE_EDIT_PERMISSION[entityType];
    if (!required || !user.permissions.includes(required)) {
      throw new ForbiddenException('You do not have access to edit this record.');
    }
  }
}
