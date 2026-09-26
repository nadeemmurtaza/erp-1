import { Module } from '@nestjs/common';
import { OrgUnitController } from './org-unit.controller';
import { OrgUnitService } from './org-unit.service';

@Module({
  controllers: [OrgUnitController],
  providers: [OrgUnitService],
  exports: [OrgUnitService],
})
export class OrgStructureModule {}
