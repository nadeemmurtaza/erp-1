import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../../core/auth/decorators';
import { TrackEventDto } from './dto/tracking.dto';
import { TrackingService } from './tracking.service';

/**
 * One public, fire-and-forget endpoint for first-party, anonymous analytics —
 * a browsing guest has no token, so this must work without one. No response
 * body: the frontend beacon never meaningfully awaits the result.
 */
@ApiTags('track')
@Controller('track')
@Public()
export class TrackingController {
  constructor(private readonly tracking: TrackingService) {}

  @Post('event')
  @ApiOperation({ summary: 'Record one page_view / add_to_cart / checkout_started event' })
  // Stricter than the global 300/60s default (see app.module.ts): this route
  // has no auth to fall back on, so it's the one a scripted flood would
  // actually hit. A real browsing session firing a handful of events per page
  // load stays well under this.
  @Throttle({ default: { limit: 40, ttl: 60_000 } })
  async track(@Body() dto: TrackEventDto): Promise<void> {
    await this.tracking.record(dto);
  }
}
