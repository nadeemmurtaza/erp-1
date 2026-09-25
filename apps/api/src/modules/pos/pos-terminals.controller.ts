import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermission, SessionOnly } from '../../core/auth/decorators';
import { PosTerminalsService } from './pos-terminals.service';
import { RegisterPosTerminalDto, UpdatePosTerminalDto } from './dto/pos-terminal.dto';

@ApiTags('admin/pos/terminals')
@Controller('admin/pos/terminals')
@RequirePermission('pos.manage')
export class PosTerminalsController {
  constructor(private readonly terminals: PosTerminalsService) {}

  @Get()
  @ApiOperation({ summary: 'List registered till terminals' })
  async findAll() {
    return { data: await this.terminals.findAll() };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a terminal' })
  async findOne(@Param('id') id: string) {
    return this.terminals.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Register a till terminal at a location' })
  async register(@Body() dto: RegisterPosTerminalDto) {
    return this.terminals.register(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a terminal' })
  async update(@Param('id') id: string, @Body() dto: UpdatePosTerminalDto) {
    return this.terminals.update(id, dto);
  }

  @Post(':id/suspend')
  @ApiOperation({ summary: 'Suspend a terminal — never deletes it, its history stays put' })
  async suspend(@Param('id') id: string) {
    return this.terminals.suspend(id);
  }

  // Mints a credential that would outlive any API key (163-personal-api-keys.md §2).
  @Post(':id/rotate-device-key')
  @SessionOnly()
  @ApiOperation({ summary: 'Issue a fresh device credential for this terminal — shown once, never retrievable again' })
  async rotateDeviceKey(@Param('id') id: string) {
    return this.terminals.rotateDeviceKey(id);
  }
}
