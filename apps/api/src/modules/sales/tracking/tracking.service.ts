import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../../../core/config/app-config.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import type { Prisma } from '../../../core/prisma/client';
import type { TrackEventDto } from './dto/tracking.dto';

const ORGANIC_HOSTS = ['google', 'bing', 'yahoo', 'duckduckgo'];
const SOCIAL_HOSTS = [
  'facebook',
  'instagram',
  'twitter',
  'x.com',
  'tiktok',
  'pinterest',
  'linkedin',
];

/**
 * Buckets a visit into the fixed set of sources the dashboard understands.
 *
 * Pure and exported on its own so it's unit-testable without a Nest context —
 * and so the classification never lives in the controller, where a client
 * could get near enough to influence it. The caller never trusts a
 * client-sent "source" value directly; this is the only place source is
 * decided.
 */
export function classifySource(
  referrer: string | undefined,
  utmSource: string | undefined,
  ownOrigin: string | undefined,
): string {
  if (utmSource === 'email') {
    return 'email';
  }

  if (!referrer) {
    return 'direct';
  }

  let referrerOrigin: string;
  let referrerHost: string;
  try {
    const url = new URL(referrer);
    referrerOrigin = url.origin;
    referrerHost = url.hostname.toLowerCase();
  } catch {
    // A referrer was sent but isn't a parseable URL (e.g. an app-scheme
    // referrer) — there's clearly a referrer, just not one worth naming.
    return 'referral';
  }

  if (ownOrigin && referrerOrigin === ownOrigin) {
    return 'direct';
  }

  if (ORGANIC_HOSTS.some((needle) => referrerHost.includes(needle))) {
    return 'organic';
  }

  if (SOCIAL_HOSTS.some((needle) => referrerHost.includes(needle))) {
    return 'social';
  }

  return 'referral';
}

/**
 * Writes one AnalyticsEvent row. Nothing else — no other module's services
 * are called from here, so a flood of guest traffic can never cascade into
 * slower carts, orders, or anything else on the request path.
 */
@Injectable()
export class TrackingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  async record(dto: TrackEventDto): Promise<void> {
    // CORS_ORIGINS' first entry is the storefront's own origin — the same
    // value classifySource needs to tell "the visitor came from our own
    // site" (direct) apart from an actual external referrer.
    const ownOrigin = this.config.get('CORS_ORIGINS')[0];
    const source = classifySource(dto.referrer, dto.utmSource, ownOrigin);

    // Deliberately not wrapped in a transaction or paired with an audit log —
    // this is a single anonymous insert, and the privacy contract forbids
    // storing anything (IP, User-Agent) that would make it more than that.
    await this.prisma.analyticsEvent.create({
      data: {
        type: dto.type,
        path: dto.path,
        source,
        sessionId: dto.sessionId,
        meta: dto.meta as Prisma.InputJsonValue | undefined,
      },
    });
  }
}
