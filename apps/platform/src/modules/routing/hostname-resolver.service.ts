import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AppConfigService } from '../../core/config/app-config.service';

export interface RoutingInfo {
  tenantId: string;
  slug: string;
  status: 'ACTIVE' | 'TRIAL';
  resourceTier: string;
  /** A pointer to `TenantDeploymentCredential`, never the credential
   *  itself — doc 39 §"the principal with no permission key" names this
   *  column, by name, as the one thing the routing layer may read. */
  deploymentRef: string;
}

interface CacheEntry {
  value: RoutingInfo | null;
  cachedAt: number;
}

const POSITIVE_TTL_MS = 60_000;
const NEGATIVE_TTL_MS = 5_000;

/**
 * WO-39.3 — the application-layer half only: resolves an incoming hostname
 * (subdomain or verified custom domain) to a tenant's own, non-secret
 * routing info. Which orchestrator actually reverse-proxies the request is
 * doc 39's own named "Out of scope."
 *
 * "Four hours down, the counter stays open" (doc 39 §"Four hours down"):
 * a hostname already resolved once stays servable from this cache for
 * `POSITIVE_TTL_MS` even if the database briefly can't be reached — this
 * cache is an in-process Map, not a second source of truth: every hit
 * still re-validates against the database once its TTL expires, and
 * `invalidate()` (called by TenantsService/ProvisioningService on any
 * status or domain change) never lets a stale positive outlive a real
 * suspension for long.
 */
@Injectable()
export class HostnameResolverService {
  private readonly logger = new Logger(HostnameResolverService.name);
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  async resolve(hostnameRaw: string): Promise<RoutingInfo | null> {
    const hostname = hostnameRaw.trim().toLowerCase();
    const cached = this.cache.get(hostname);
    if (cached) {
      const ttl = cached.value ? POSITIVE_TTL_MS : NEGATIVE_TTL_MS;
      if (Date.now() - cached.cachedAt < ttl) return cached.value;
    }

    const value = await this.resolveUncached(hostname);
    this.cache.set(hostname, { value, cachedAt: Date.now() });
    return value;
  }

  private async resolveUncached(hostname: string): Promise<RoutingInfo | null> {
    const baseDomain = this.config.get('PLATFORM_HOSTNAME_BASE_DOMAIN').toLowerCase();
    const suffix = `.${baseDomain}`;

    const tenant = hostname.endsWith(suffix)
      ? await this.prisma.platformTenant.findUnique({ where: { slug: hostname.slice(0, -suffix.length) } })
      : await this.resolveCustomDomain(hostname);

    if (!tenant || !tenant.deploymentRef) return null;
    if (tenant.status !== 'ACTIVE' && tenant.status !== 'TRIAL') return null;

    return {
      tenantId: tenant.id,
      slug: tenant.slug,
      status: tenant.status,
      resourceTier: tenant.resourceTier,
      deploymentRef: tenant.deploymentRef,
    };
  }

  private async resolveCustomDomain(hostname: string) {
    const tenant = await this.prisma.platformTenant.findUnique({ where: { customDomain: hostname } });
    // A claimed-but-unverified custom domain is never routable — the
    // domain-hijack gap `customDomainVerifiedAt`'s own schema comment names.
    if (!tenant || !tenant.customDomainVerifiedAt) return null;
    return tenant;
  }

  /** Called by TenantsService/ProvisioningService on any status or domain
   *  change so a stale cache entry never outlives the fact that changed it. */
  invalidate(...hostnames: (string | null | undefined)[]): void {
    for (const hostname of hostnames) {
      if (!hostname) continue;
      this.cache.delete(hostname.toLowerCase());
    }
  }

  subdomainFor(slug: string): string {
    return `${slug}.${this.config.get('PLATFORM_HOSTNAME_BASE_DOMAIN')}`;
  }
}
