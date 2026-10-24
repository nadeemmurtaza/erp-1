import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../../core/auth/decorators';
import { MarketplaceWebhookGuard } from './marketplace-webhook.guard';
import { ProductReferenceSyncService } from './product-reference-sync.service';
import { ProductReferenceSyncPayloadDto } from './dto/product-reference.dto';

/**
 * 166-unified-product-reference-registry.md, WO-166.4 — the receiving end
 * of a push delivery once the platform's own outbound dispatcher exists
 * (not yet built; see doc 166's own status note — this controller is the
 * consumer side, built ahead of its sender, the same "shape it so a real
 * request isn't a design exercise" pattern doc 18.5's EDI deferral already
 * established). `@Public()`: the platform calls this, not a signed-in
 * staff member, so authenticity comes from `MarketplaceWebhookGuard`'s
 * shared-key check, never a session.
 */
@Controller('webhooks/marketplace')
@Public()
@UseGuards(MarketplaceWebhookGuard)
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class MarketplaceWebhookController {
  constructor(private readonly sync: ProductReferenceSyncService) {}

  @Post('product-reference-sync')
  async productReferenceSync(@Body() dto: ProductReferenceSyncPayloadDto) {
    return this.sync.apply(dto);
  }
}
