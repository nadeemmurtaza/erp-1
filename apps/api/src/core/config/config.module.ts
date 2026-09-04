import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { AppConfigService } from './app-config.service';
import { MetaController } from './meta.controller';
import { validateEnv } from './env.validation';

@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      // The repo-root .env is shared by every app; apps/api/.env overrides it.
      envFilePath: ['.env', '../../.env'],
      validate: validateEnv,
      cache: true,
    }),
  ],
  controllers: [MetaController],
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class AppConfigModule {}
