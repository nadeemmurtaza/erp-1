import { Module } from '@nestjs/common';
import { SignupController } from './signup.controller';
import { SignupService } from './signup.service';
import { TrialsController } from './trials.controller';
import { TrialsService } from './trials.service';
import { TrialExpiryCron } from './trial-expiry.cron';
import { TenantsModule } from '../tenants/tenants.module';

@Module({
  imports: [TenantsModule],
  controllers: [SignupController, TrialsController],
  providers: [SignupService, TrialsService, TrialExpiryCron],
  exports: [TrialsService],
})
export class TrialsModule {}
