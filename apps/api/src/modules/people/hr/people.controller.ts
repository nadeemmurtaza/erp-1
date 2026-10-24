import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../../core/auth/auth.constants';
import { CurrentUser, RequirePermission } from '../../../core/auth/decorators';
import { PeopleService } from './people.service';
import { AssignPostingDto, CreatePositionDto, CreateRankDto, EndPostingDto } from './dto/people.dto';

/**
 * hr-people-org/20-people-positions-ranks.md — reads sit behind
 * `hr.people.view`; every write additionally needs `hr.people.manage`
 * (WO-20.4), checked again inside `PeopleService` itself.
 */
@ApiTags('admin/people')
@Controller('admin/people')
@RequirePermission('hr.people.view', 'hr.people.manage')
export class PeopleController {
  constructor(private readonly people: PeopleService) {}

  @Get()
  @ApiOperation({ summary: 'Everyone who holds at least one posting' })
  list() {
    return this.people.listPeople();
  }

  @Get('ranks')
  @ApiOperation({ summary: 'The rank ladder' })
  listRanks() {
    return this.people.listRanks();
  }

  @Post('ranks')
  @RequirePermission('hr.people.manage')
  @ApiOperation({ summary: 'Add a rank' })
  createRank(@Body() dto: CreateRankDto) {
    return this.people.createRank(dto);
  }

  @Get('positions')
  @ApiOperation({ summary: 'Every position' })
  listPositions() {
    return this.people.listPositions();
  }

  @Post('positions')
  @RequirePermission('hr.people.manage')
  @ApiOperation({ summary: 'Create a position' })
  createPosition(@Body() dto: CreatePositionDto) {
    return this.people.createPosition(dto);
  }

  @Get(':userId/postings')
  @ApiOperation({ summary: "One person's postings, open and past" })
  postings(@Param('userId') userId: string) {
    return this.people.postingsFor(userId);
  }

  @Post('postings/assign/preview')
  @RequirePermission('hr.people.manage')
  @ApiOperation({ summary: 'What assigning this posting would do, without writing anything' })
  previewAssign(@Body() dto: AssignPostingDto) {
    return this.people.previewAssign(dto.userId, dto.positionId, dto.isPrimary);
  }

  @Post('postings/assign')
  @RequirePermission('hr.people.manage')
  @ApiOperation({ summary: 'Assign a posting — refused if it would create a second open primary posting' })
  assign(@Body() dto: AssignPostingDto, @CurrentUser() user: AuthenticatedUser) {
    return this.people.assign(
      { userId: dto.userId, positionId: dto.positionId, isPrimary: dto.isPrimary, startedOn: dto.startedOn ? new Date(dto.startedOn) : undefined },
      user.id,
    );
  }

  @Post('postings/:id/end')
  @RequirePermission('hr.people.manage')
  @ApiOperation({ summary: 'End a posting' })
  end(@Param('id') id: string, @Body() dto: EndPostingDto, @CurrentUser() user: AuthenticatedUser) {
    return this.people.end(id, dto.endedOn ? new Date(dto.endedOn) : undefined, user.id);
  }

  @Get(':userId/ranks')
  @ApiOperation({ summary: 'Every rank level this person currently holds, across all open postings' })
  ranksOf(@Param('userId') userId: string, @Query('at') at?: string) {
    return this.people.ranksOf(userId, at ? new Date(at) : undefined);
  }
}
