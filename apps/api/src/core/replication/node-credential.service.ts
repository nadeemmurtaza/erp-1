import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { hashApiKey } from '../security/api-token';
import type { Node } from '../prisma/client';

/**
 * Authenticates an inbound replication call from a child node (WO-20.2) —
 * the raw key it presents, hashed and looked up, mirroring
 * `TradingPartnersService.verifyInboundKey()`. Lives in `core/replication/`
 * and queries `Node` directly rather than going through `NodesService`
 * (`modules/people/organization/`): core platform code stays independent of any
 * one feature module the same way `EventsModule`/`ExtensionPointsModule`
 * already do, and this only ever needs a read.
 */
@Injectable()
export class NodeCredentialService {
  constructor(private readonly prisma: PrismaService) {}

  async verify(rawKey: string): Promise<Node> {
    if (!rawKey.trim()) throw new UnauthorizedException('Missing API key.');

    const node = await this.prisma.node.findUnique({
      where: { inboundApiKeyHash: hashApiKey(rawKey) },
    });
    if (!node) throw new UnauthorizedException('Invalid API key.');
    if (node.status !== 'ACTIVE') {
      throw new UnauthorizedException('This node is not active.');
    }

    // Best-effort — a dropped update here must never fail an otherwise-valid
    // sync call, the same "an audit trail is not the guarantee" discipline
    // logging elsewhere in this codebase already follows.
    void this.prisma.node.update({ where: { id: node.id }, data: { lastSeenAt: new Date() } }).catch(() => undefined);

    return node;
  }
}
