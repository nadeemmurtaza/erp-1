import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../config/app-config.service';
import type { Node, NodeRole } from '../prisma/client';

/**
 * The registry of child nodes this deployment is authoritative for — a
 * brand's branches, or an organization's brands (RETAIL-ERP.md R1, WO-18.1).
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
}
