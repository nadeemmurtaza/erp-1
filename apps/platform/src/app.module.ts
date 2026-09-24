import { Module } from '@nestjs/common';
import { AppConfigModule } from './core/config/config.module';
import { PrismaModule } from './core/prisma/prisma.module';
import { TenantsModule } from './modules/tenants/tenants.module';

@Module({
  imports: [AppConfigModule, PrismaModule, TenantsModule],
})
export class AppModule {}
