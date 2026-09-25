import { Global, Module } from '@nestjs/common';
import { TenantCredentialResolverService } from './tenant-credential-resolver.service';

@Global()
@Module({
  providers: [TenantCredentialResolverService],
  exports: [TenantCredentialResolverService],
})
export class TenantCredentialResolverModule {}
