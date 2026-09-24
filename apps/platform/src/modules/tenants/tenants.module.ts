import { Module } from '@nestjs/common';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';
import { ProvisioningService } from './provisioning.service';
import { PostgresDatabaseProvisioner } from './postgres-database.provisioner';
import { DEPLOYMENT_PROVISIONER } from './deployment-provisioner.token';

@Module({
  controllers: [TenantsController],
  providers: [
    TenantsService,
    ProvisioningService,
    { provide: DEPLOYMENT_PROVISIONER, useClass: PostgresDatabaseProvisioner },
  ],
  exports: [TenantsService, ProvisioningService],
})
export class TenantsModule {}
