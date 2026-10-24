import { Module } from '@nestjs/common';
import { TenantExportController } from './tenant-export.controller';
import { TenantExportService } from './tenant-export.service';
import { TenantRetentionService } from './tenant-retention.service';
import { TenantRetentionCron } from './tenant-retention.cron';
import { PgDumpExportRunner } from './pg-dump-export.runner';
import { TENANT_EXPORT_RUNNER } from './export-runner.token';
import { DEPLOYMENT_PROVISIONER } from '../tenants/deployment-provisioner.token';
import { PostgresDatabaseProvisioner } from '../tenants/postgres-database.provisioner';

/**
 * Deliberately does NOT import `TenantsModule`. `TenantsModule` imports
 * THIS module (to fire an automatic export on deprovision — see
 * `ProvisioningService`), so importing it back here would be a circular
 * module dependency. `DEPLOYMENT_PROVISIONER` is therefore bound a second
 * time, to the exact same stateless class `TenantsModule` also binds it
 * to — not a second implementation, a second DI registration of one.
 */
@Module({
  controllers: [TenantExportController],
  providers: [
    TenantExportService,
    TenantRetentionService,
    TenantRetentionCron,
    { provide: TENANT_EXPORT_RUNNER, useClass: PgDumpExportRunner },
    { provide: DEPLOYMENT_PROVISIONER, useClass: PostgresDatabaseProvisioner },
  ],
  exports: [TenantExportService, TenantRetentionService],
})
export class TenantDataModule {}
