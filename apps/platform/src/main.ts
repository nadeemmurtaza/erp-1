import 'reflect-metadata';
import './core/config/load-env';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AppConfigService } from './core/config/app-config.service';

/**
 * WO-39.7's `TenantDataExport.sizeBytes` is `BigInt` (an export archive can
 * exceed Postgres's plain `Int` range) — the one place this app's Prisma
 * schema needs a 64-bit integer. `JSON.stringify` has no native BigInt
 * support, so without this a perfectly successful export response throws
 * a 500 on serialization. This is the standard, narrow fix (stringify
 * losslessly, never silently round through `Number`), applied once, here,
 * rather than hand-converting `sizeBytes` in every controller that touches
 * it.
 */
(BigInt.prototype as unknown as { toJSON(): string }).toJSON = function toJSON(this: bigint) {
  return this.toString();
};

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const config = app.get(AppConfigService);
  const logger = new Logger('Bootstrap');

  app.use(helmet());
  app.setGlobalPrefix(config.get('PLATFORM_API_PREFIX'));

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  app.enableShutdownHooks();

  const port = config.get('PLATFORM_API_PORT');
  await app.listen(port, '0.0.0.0');
  logger.log(`Platform control plane listening on http://localhost:${port}/${config.get('PLATFORM_API_PREFIX')}`);
}

void bootstrap();
