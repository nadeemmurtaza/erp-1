import { Body, Controller, Delete, ForbiddenException, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedOnly, CurrentUser, RequirePermission } from '../../core/auth/decorators';
import type { AuthenticatedUser } from '../../core/auth/auth.constants';
import type { CustomFieldEntityType } from '@newax/shared';
import { CustomFieldsService } from './custom-fields.service';
import { DefineCustomFieldDto, SetCustomFieldValuesDto } from './dto/custom-field.dto';

/**
 * The permission that already gates day-to-day editing of each wired entity
 * — filling in a value on a real row is that entity's own editing action,
 * never a settings-level one (`settings.custom-fields.manage` is only for
 * defining what fields exist, per doc 104's own "created by an authenticated
 * admin under settings.custom-fields.manage").
 */
const ENTITY_TYPE_EDIT_PERMISSION: Record<CustomFieldEntityType, string> = {
  Supplier: 'suppliers.manage',
};

@ApiTags('admin/custom-fields')
@Controller('admin/custom-fields')
export class CustomFieldsController {
  constructor(private readonly customFields: CustomFieldsService) {}

  @Get('entity-types')
  @RequirePermission('settings.custom-fields.manage')
  @ApiOperation({ summary: 'Every entity type this mechanism is wired up for' })
  entityTypes() {
    return { entityTypes: this.customFields.listEntityTypes() };
  }

  @Get('definitions')
  @RequirePermission('settings.custom-fields.manage')
  @ApiOperation({ summary: 'Every custom-field definition for one entity type' })
  definitions(@Query('entityType') entityType: string) {
    return this.customFields.listDefinitions(entityType);
  }

  @Post('definitions')
  @RequirePermission('settings.custom-fields.manage')
  @ApiOperation({ summary: 'Define a new custom field on one entity type' })
  define(@Body() dto: DefineCustomFieldDto) {
    return this.customFields.defineField(dto);
  }

  @Delete('definitions/:id')
  @RequirePermission('settings.custom-fields.manage')
  @ApiOperation({ summary: 'Remove a custom-field definition' })
  remove(@Param('id') id: string) {
    return this.customFields.deleteDefinition(id);
  }

  @Get('values')
  @AuthenticatedOnly()
  @ApiOperation({ summary: "One entity's own custom-field values, gated by that entity's own edit permission" })
  values(@Query('entityType') entityType: CustomFieldEntityType, @Query('entityId') entityId: string, @CurrentUser() user: AuthenticatedUser) {
    this.requireEntityEditAccess(entityType, user);
    return this.customFields.getValues(entityType, entityId);
  }

  @Post('values')
  @AuthenticatedOnly()
  @ApiOperation({ summary: "Set one entity's own custom-field values, gated by that entity's own edit permission" })
  setValues(@Body() dto: SetCustomFieldValuesDto, @CurrentUser() user: AuthenticatedUser) {
    this.requireEntityEditAccess(dto.entityType, user);
    return this.customFields.setValues(dto.entityType, dto.entityId, dto.values);
  }

  private requireEntityEditAccess(entityType: CustomFieldEntityType, user: AuthenticatedUser): void {
    const required = ENTITY_TYPE_EDIT_PERMISSION[entityType];
    if (!required || !user.permissions.includes(required)) {
      throw new ForbiddenException('You do not have access to edit this record.');
    }
  }
}
