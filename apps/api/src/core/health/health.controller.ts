import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../auth/decorators';

@ApiTags('health')
@Controller('health')
export class HealthController {
  private readonly startedAt = Date.now();

  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Liveness probe' })
  live() {
    return { status: 'ok', uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000) };
  }

  /**
   * Readiness: reports whether the API can actually serve traffic. A load
   * balancer should route on this, not on the liveness probe — a process that
   * is up but cannot reach Postgres has nothing useful to say.
   */
  @Public()
  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe — checks the database' })
  async ready() {
    const checks: Record<string, { ok: boolean; detail?: string }> = {};

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.database = { ok: true };
    } catch (error) {
      checks.database = {
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      };
    }

    const pendingEvents = checks.database.ok
      ? await this.prisma.outboxEvent.count({ where: { status: 'PENDING' } })
      : -1;
    const failedEvents = checks.database.ok
      ? await this.prisma.outboxEvent.count({ where: { status: 'FAILED' } })
      : -1;

    const ok = Object.values(checks).every((check) => check.ok);
    return { status: ok ? 'ok' : 'degraded', checks, outbox: { pendingEvents, failedEvents } };
  }
}
