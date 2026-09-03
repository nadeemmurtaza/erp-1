import { Body, Controller, Delete, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../core/auth/decorators';
import { TaxService } from './tax.service';
import {
  CreateTaxClassDto,
  CreateTaxRateDto,
  UpdateTaxClassDto,
  UpdateTaxSettingsDto,
} from './dto/tax.dto';

@ApiTags('Tax Admin')
@Controller('admin/tax')
export class TaxController {
  constructor(private readonly tax: TaxService) {}

  @Get('settings')
  @RequirePermission('tax.manage')
  @ApiOperation({ summary: 'tax.enabled, pricing mode and default class' })
  async getSettings() {
    return this.tax.getSettings();
  }

  @Put('settings')
  @RequirePermission('tax.manage')
  @ApiOperation({ summary: 'Update tax.enabled, pricing mode and/or default class' })
  async updateSettings(@Body() dto: UpdateTaxSettingsDto) {
    return this.tax.updateSettings(dto);
  }

  @Get('classes')
  @RequirePermission('tax.manage')
  @ApiOperation({ summary: 'List tax classes with their current rate' })
  async findAll() {
    return { data: await this.tax.listClasses() };
  }

  @Get('classes/:id')
  @RequirePermission('tax.manage')
  @ApiOperation({ summary: 'Get a tax class with its full rate history' })
  async findOne(@Param('id') id: string) {
    return this.tax.getClass(id);
  }

  @Post('classes')
  @RequirePermission('tax.manage')
  @ApiOperation({ summary: 'Create a tax class, optionally with a starting rate' })
  async create(@Body() dto: CreateTaxClassDto) {
    return this.tax.createClass(dto);
  }

  @Patch('classes/:id')
  @RequirePermission('tax.manage')
  @ApiOperation({ summary: 'Rename a tax class or change the store default' })
  async update(@Param('id') id: string, @Body() dto: UpdateTaxClassDto) {
    return this.tax.updateClass(id, dto);
  }

  @Delete('classes/:id')
  @RequirePermission('tax.manage')
  @ApiOperation({ summary: 'Delete an unused tax class' })
  async remove(@Param('id') id: string) {
    await this.tax.deleteClass(id);
    return { success: true };
  }

  @Post('classes/:id/rates')
  @RequirePermission('tax.manage')
  @ApiOperation({ summary: "End the class's current rate and start a new one" })
  async addRate(@Param('id') id: string, @Body() dto: CreateTaxRateDto) {
    return this.tax.addRate(id, dto);
  }
}
