import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AppConfigService } from '../../core/config/app-config.service';
import { generateApiKey, hashApiKey } from '../../core/security/api-token';
import type { Node, NodeRole } from '../../core/prisma/client';

const INBOUND_KEY_PREFIX = 'node';

/**
 * The registry of child nodes this deployment is authoritative for — a
 * brand's branches, or an organization's brands (RETAIL-ERP.md R1, WO-18.1;
 * moved into the `organization` module in WO-18.3 once it had siblings to
 * live beside — Part 5 owns it here, not core platform infra).
 *
 * What tier of child a deployment may hold follows directly from its own
 * NODE_ROLE: an ORG registers BRAND children, a BRAND registers BRANCH
 * children, and a BRANCH or STANDALONE deployment — the bottom of whatever
 * topology it has — registers none. That mapping is `childRole` below, and
 * it is what keeps an invalid row (a branch trying to register a "branch" of
 * its own) unrepresentable rather than merely rejected.
 *
 * No caching, unlike SettingsService — registering a node is an
 * administrative act, not a hot path, and the drill-down dashboard (WO-18.5)
 * reads this rarely enough that a query is cheaper than a bug from a stale
 * cache showing a node as active after it was suspended.
 */
@Injectable()
export class NodesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  private get childRole(): NodeRole | null {
    switch (this.config.nodeRole) {
      case 'ORG':
        return 'BRAND';
      case 'BRAND':
        return 'BRANCH';
      default:
        return null;
    }
  }

  /**
   * Registers a child node, or re-activates and updates one that already
   * exists. Idempotent on `nodeId` so a child can safely retry its own
   * registration call.
   */
  async register(input: { nodeId: string; label: string; url: string }): Promise<Node> {
    const role = this.childRole;
    if (!role) {
      throw new Error(
        `NODE_ROLE=${this.config.nodeRole} does not take child nodes — only BRAND and ORG ` +
          'deployments register children.',
      );
    }

    return this.prisma.node.upsert({
      where: { nodeId: input.nodeId },
      create: { nodeId: input.nodeId, role, label: input.label, url: input.url },
      update: { label: input.label, url: input.url, status: 'ACTIVE' },
    });
  }

  async list(): Promise<Node[]> {
    return this.prisma.node.findMany({ orderBy: { label: 'asc' } });
  }

  /** Marks a child inactive without deleting it — its history (and its own database) stays put. */
  async suspend(nodeId: string): Promise<Node> {
    return this.prisma.node.update({ where: { nodeId }, data: { status: 'SUSPENDED' } });
  }

  /**
   * Issues a fresh replication credential for a child node and returns it
   * once, raw — only its SHA-256 is kept, the same shape as
   * `TradingPartnersService.rotateInboundKey()`. The child is configured
   * with the raw value as its own `PARENT_API_KEY` (WO-20.2). Rotating
   * invalidates whatever key was issued before, since the hash column is
   * overwritten, not appended to.
   */
  async rotateInboundKey(nodeId: string): Promise<{ apiKey: string }> {
    const exists = await this.prisma.node.findUnique({ where: { nodeId }, select: { id: true } });
    if (!exists) throw new NotFoundException('Node not found');

    const apiKey = generateApiKey(INBOUND_KEY_PREFIX);
    await this.prisma.node.update({
      where: { nodeId },
      data: { inboundApiKeyHash: hashApiKey(apiKey) },
    });
    return { apiKey };
  }
}
