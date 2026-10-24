import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedOnly, RequirePermission } from '../../../core/auth/decorators';
import { MetadataFormsService } from './metadata-forms.service';
import { DefineFormMetadataDto } from './dto/form-metadata.dto';

/**
 * architecture-patterns/141-general-metadata-driven-ui-engine.md
 * (WO-141.1). Defining a form's own shape is a settings-level decision
 * (`settings.metadata-forms.manage`); reading an already-defined shape is
 * open to any authenticated admin user — knowing which fields a screen
 * renders grants no access to any entity's own values, which stay gated by
 * that entity's own edit permission wherever they are actually stored.
 */
@ApiTags('admin/metadata-forms')
@Controller('admin/metadata-forms')
export class MetadataFormsController {
  constructor(private readonly forms: MetadataFormsService) {}

  @Get(':entityType')
  @AuthenticatedOnly()
  @ApiOperation({ summary: 'The defined form shape for one entity type, or null if none is defined' })
  get(@Param('entityType') entityType: string) {
    return this.forms.getFormMetadata(entityType);
  }

  @Put(':entityType')
  @RequirePermission('settings.metadata-forms.manage')
  @ApiOperation({ summary: 'Define (or replace) the form shape for one entity type' })
  define(@Param('entityType') entityType: string, @Body() dto: DefineFormMetadataDto) {
    return this.forms.defineForm(entityType, dto);
  }
}
