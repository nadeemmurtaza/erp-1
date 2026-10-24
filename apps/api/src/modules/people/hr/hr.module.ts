import { Module } from '@nestjs/common';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';
import { PeopleController } from './people.controller';
import { PeopleService } from './people.service';

/**
 * Employee assets (hr-people-org/79-employee-asset-management.md) and
 * people/positions/ranks (hr-people-org/20-people-positions-ranks.md,
 * ADR-044). `Position.orgUnitId` is a Prisma-level relation into the
 * `orgstructure` module's own `OrgUnit` — no TypeScript import of that
 * module's service, the same cross-schema-relation-only pattern doc 147's
 * AssetDepreciationSchedule -> Asset relation already establishes.
 */
@Module({
  controllers: [AssetsController, PeopleController],
  providers: [AssetsService, PeopleService],
  exports: [AssetsService, PeopleService],
})
export class HrModule {}
