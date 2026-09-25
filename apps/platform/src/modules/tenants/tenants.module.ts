import { Module } from '@nestjs/common';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';
import { ProvisioningService } from './provisioning.service';
import { PostgresDatabaseProvisioner } from './postgres-database.provisioner';
import { DEPLOYMENT_PROVISIONER } from './deployment-provisioner.token';
import { TenantDataModule } from '../tenant-data/tenant-data.module';
import { RoutingModule } from '../routing/routing.module';

@Module({
  // Neither TenantDataModule nor RoutingModule imports this module back —
  // see TenantDataModule's own doc comment on why (it owns a second
  // DEPLOYMENT_PROVISIONER binding instead); RoutingModule never needed
  // anything from here in the first place. Both stay one-directional.
  imports: [TenantDataModule, RoutingModule],
  controllers: [TenantsController],
  providers: [
    TenantsService,
    ProvisioningService,
    { provide: DEPLOYMENT_PROVISIONER, useClass: PostgresDatabaseProvisioner },
  ],
  exports: [TenantsService, ProvisioningService],
})
export class TenantsModule {}
