import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';

/**
 * The dedicated Redis instance (206-rate-limiting-caching-compression-hardening.md
 * §1.2) — separate from the mail server's Redis (docker-compose.mail.yml,
 * `MAIL_REDIS_URL`), so a mail-queue incident and a rate-limiting incident
 * never share a blast radius.
 *
 * Global, like PrismaModule: a consumer injects RedisService and asks for its
 * own keyspace (redis.keyspaces.ts). Today that is rate limiting only —
 * ThrottlerModule's storage in app.module.ts and LoginThrottleService in
 * core/auth.
 */
@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
