import { Module } from '@nestjs/common';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';

/**
 * Employee assets — physical equipment custody
 * (hr-people-org/79-employee-asset-management.md). Standalone: no
 * dependency on any other optional module.
 */
@Module({
  controllers: [AssetsController],
  providers: [AssetsService],
  exports: [AssetsService],
})
export class HrModule {}
