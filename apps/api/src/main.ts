import 'reflect-metadata';
// Must come before AppModule: the module registry reads MODULES from the
// environment while the module graph is being composed.
import './core/config/load-env';
import { Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AppConfigService } from './core/config/app-config.service';

async function bootstrap(): Promise<void> {
  // rawBody: true makes `req.rawBody` available alongside the parsed JSON
  // body — needed by identity-verification's webhook handler, which
  // verifies nID's signature over the exact bytes nID signed. Every other
  // route is unaffected; this only adds a Buffer capture, it doesn't change
  // how the body parses.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: false,
    rawBody: true,
  });
  const config = app.get(AppConfigService);
  const logger = new Logger('Bootstrap');

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cookieParser());

  app.enableCors({
    origin: config.get('CORS_ORIGINS'),
    credentials: true,
    // x-cart-token is how a client without a shared cookie jar — the mobile app,
    // or anything running in a browser that is not the storefront — carries its
    // guest cart. Leaving it out fails the preflight, and every write to the
    // cart looks to the client like the network is down.
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'x-cart-token'],
  });

  app.setGlobalPrefix(config.get('API_PREFIX'));
  // URI versioning: /api/v1/... . A future v2 can be introduced route by route
  // without breaking a mobile app pinned to v1.
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  if (!config.isProduction) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Yaseen API')
        .setDescription(
          'Clothing store and stitching services. Money is integer paisa; customer-facing text is bilingual (en/ur).',
        )
        .setVersion('1.0')
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup(`${config.get('API_PREFIX')}/docs`, app, document);
  }

  app.enableShutdownHooks();

  const port = config.get('API_PORT');
  await app.listen(port, '0.0.0.0');

  // Keep-alive and timeout eviction, sized against the reverse proxy.
  //
  // Caddy holds idle upstream connections open, so whoever closes first
  // decides what the customer sees. If this server evicts a connection Caddy
  // still believes is good, Caddy sends a request into a socket closing under
  // it and the customer gets a 502 — the classic intermittent gateway error
  // behind a proxy. Staying open LONGER than the proxy's idle window means
  // Caddy always does the closing, on an idle connection, where nobody is
  // waiting.
  //
  // headersTimeout must exceed keepAliveTimeout, otherwise Node can time out
  // the headers of a request that arrived on a connection it was about to
  // evict anyway. requestTimeout caps a single slow request so one stalled
  // client cannot hold a worker indefinitely.
  const server = app.getHttpServer();
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 70_000;
  server.requestTimeout = 120_000;

  logger.log(`API listening on http://localhost:${port}/${config.get('API_PREFIX')}/v1`);
  if (!config.isProduction) {
    logger.log(`Docs at http://localhost:${port}/${config.get('API_PREFIX')}/docs`);
  }
}

void bootstrap();
