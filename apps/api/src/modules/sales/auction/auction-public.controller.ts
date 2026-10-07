import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Public } from '../../../core/auth/decorators';
import { AuctionPublicService } from './auction-public.service';
import { AuctionRealtimeService, CLIENT_RETRY_MS } from './auction-realtime.service';
import { PublicLotListQueryDto } from './dto/auction.dto';

/**
 * The status and headers of a server-sent-events response, sent before the
 * first frame. `no-transform` keeps a compressing proxy from buffering the
 * stream and `X-Accel-Buffering: no` does the same for nginx-style ones; both
 * matter, because a proxy that holds the stream back turns a live page into one
 * that updates in bursts.
 */
export function openEventStream(res: Response): void {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
}

/**
 * What anyone may see of an auction without signing in (launchpad-apps/
 * 234-auction-app.md §11, WO-234.4): lots to browse, one lot's page, and a
 * live stream of its price. Every route is `@Public()`: there is no account to
 * read, and `AuctionPublicService` leaves out the reserve, names and every
 * bidder's maximum.
 *
 * Rate limits, per client address and route, in the shared Redis-backed
 * throttler (the module-wide default is 300 a minute):
 *  - the lot page, 120 a minute: a page that cannot stream polls every 5 s,
 *    which is twelve a minute, so ten watchers behind one office address still
 *    fit with room to browse;
 *  - the stream, 60 a minute: a connection is held open and only reconnects
 *    every five seconds at worst (`CLIENT_RETRY_MS`), also twelve a minute.
 * Over a limit is a 429 and the page shows its last state.
 */
@ApiTags('auctions')
@Controller('auctions/public')
export class AuctionPublicController {
  constructor(
    private readonly publicLots: AuctionPublicService,
    private readonly realtime: AuctionRealtimeService,
  ) {}

  @Public()
  @Get('lots')
  @ApiOperation({ summary: 'Lots to browse: live, upcoming or ended' })
  list(@Query() query: PublicLotListQueryDto) {
    return this.publicLots.listLots(query);
  }

  @Public()
  @Get('lots/:lotId')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @ApiOperation({ summary: 'One lot as a visitor sees it: price, time left, newest bids, and how it ended' })
  lot(@Param('lotId') lotId: string) {
    return this.publicLots.lotPage(lotId);
  }

  /**
   * Server-sent events: the lot's current state first, then every change as it
   * happens, merged to at most four a second. When this node already holds
   * `MAX_STREAMS_PER_NODE` streams the answer is a 503 with `Retry-After`, and
   * the page polls instead. The response is written here, not returned, so the
   * route is a plain `@Res()` handler.
   */
  @Public()
  @Get('lots/:lotId/stream')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'Live price and bids for one lot as server-sent events' })
  async stream(@Param('lotId') lotId: string, @Res() res: Response): Promise<void> {
    const snapshot = await this.publicLots.liveSnapshot(lotId);
    if (!this.realtime.hasRoom()) {
      res.status(503).setHeader('Retry-After', String(Math.ceil(CLIENT_RETRY_MS / 1_000)));
      res.json({ statusCode: 503, message: 'Live updates are busy right now. This page will refresh every few seconds instead.' });
      return;
    }
    // Nothing is awaited between the room check and the attach, so the room cannot go in between.
    openEventStream(res);
    this.realtime.attach(lotId, res, snapshot);
  }
}
