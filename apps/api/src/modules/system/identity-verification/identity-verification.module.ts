import { Module } from '@nestjs/common';
import { IdentityVerificationController } from './identity-verification.controller';
import { IdentityVerificationService } from './identity-verification.service';
import { NidVerificationProvider } from './providers/nid.provider';

@Module({
  controllers: [IdentityVerificationController],
  providers: [IdentityVerificationService, NidVerificationProvider],
})
export class IdentityVerificationModule {}
