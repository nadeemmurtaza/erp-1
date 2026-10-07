import { Global, Module } from '@nestjs/common';
import { LaunchpadController } from './launchpad.controller';
import { LaunchpadService } from './launchpad.service';

/**
 * The launchpad's server half (launchpad-apps/232). Core, not a feature module:
 * it must be present on every deployment, since it is what shows which feature
 * modules are. It imports no feature module — it reads the `MODULES` allowlist
 * and a setting.
 */
@Global()
@Module({
  controllers: [LaunchpadController],
  providers: [LaunchpadService],
  exports: [LaunchpadService],
})
export class LaunchpadModule {}
