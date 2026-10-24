import { Module } from '@nestjs/common';
import { OrgUnitController } from './org-unit.controller';
import { OrgUnitService } from './org-unit.service';
import { GrantController } from './org-unit-grant.controller';
import { GrantService } from './org-unit-grant.service';
import { OrgAccessCron } from './org-access.cron';

@Module({
  controllers: [OrgUnitController, GrantController],
  providers: [OrgUnitService, GrantService, OrgAccessCron],
  exports: [OrgUnitService, GrantService],
})
export class OrgStructureModule {}
