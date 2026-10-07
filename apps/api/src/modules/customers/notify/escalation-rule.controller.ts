import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../../core/auth/decorators';
import { CreateEscalationRuleDto, UpdateEscalationRuleDto } from './dto/notify.dto';
import { EscalationRuleService } from './escalation-rule.service';

/** tasks-notifications-support/24-internal-notifications-meetings-escalation.md (WO-24.4/24.5). */
@ApiTags('admin/notify/escalation-rules')
@Controller('admin/notify/escalation-rules')
@RequirePermission('notify.escalation.manage')
export class EscalationRuleController {
  constructor(private readonly rules: EscalationRuleService) {}

  @Get()
  @ApiOperation({ summary: 'Every configured escalation rule' })
  list() {
    return this.rules.list();
  }

  @Post()
  @ApiOperation({ summary: 'Watch a Task.sourceType for staleness and escalate up Position.reportsTo' })
  create(@Body() dto: CreateEscalationRuleDto) {
    return this.rules.create(dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update an escalation rule' })
  update(@Param('id') id: string, @Body() dto: UpdateEscalationRuleDto) {
    return this.rules.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Stop watching this source type' })
  remove(@Param('id') id: string) {
    return this.rules.remove(id);
  }
}
