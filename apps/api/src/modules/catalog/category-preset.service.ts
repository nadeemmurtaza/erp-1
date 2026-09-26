import { Injectable, NotFoundException } from '@nestjs/common';
import { slugifyWithFallback } from '@newax/shared';
import { AuditService } from '../../core/audit/audit.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { AuthenticatedUser } from '../../core/auth/auth.constants';
import { Prisma } from '../../core/prisma/client';

interface PresetNode {
  name: string;
  nameUr?: string;
  children?: PresetNode[];
}

/**
 * 47-preconfigured-sector-taxonomy.md — a library of starter category
 * trees an admin applies once. Lives inside the always-on `catalog`
 * module, not a new module: "this is data, not a module" per this
 * document's own text — `CategoryPreset` is a seed-data table, gated by
 * the same `catalog.manage` permission every other category write already
 * uses (the doc's own text names a narrower `catalog.categories.manage`
 * key that does not exist in this codebase's real permission catalogue —
 * `CatalogAdminController`'s own class-level `@RequirePermission` is
 * `catalog.manage`, reused here rather than inventing a second key).
 */
@Injectable()
export class CategoryPresetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list() {
    return this.prisma.categoryPreset.findMany({ orderBy: { label: 'asc' } });
  }

  /**
   * The dry run — a pure computation over already-loaded rows, per this
   * document's own "Dry run before live" lens. Names every collision by
   * the preset's own node name, rather than silently skipping or
   * overwriting, so an admin sees exactly what applying will and will not
   * create before committing.
   */
  async preview(key: string): Promise<{ created: number; skipped: number; collisions: string[] }> {
    const preset = await this.prisma.categoryPreset.findUnique({ where: { key } });
    if (!preset) throw new NotFoundException(`No category preset with key "${key}"`);

    const existingSlugs = new Set((await this.prisma.category.findMany({ select: { slug: true } })).map((c) => c.slug));
    const collisions: string[] = [];
    let created = 0;

    const walk = (nodes: PresetNode[]) => {
      for (const node of nodes) {
        const slug = slugifyWithFallback(node.name);
        if (existingSlugs.has(slug)) collisions.push(node.name);
        else created++;
        if (node.children?.length) walk(node.children);
      }
    };
    walk(preset.treeJson as unknown as PresetNode[]);

    return { created, skipped: collisions.length, collisions };
  }

  /**
   * Additive, never destructive: a node whose slug already exists is never
   * recreated or renamed — its children are attached under the EXISTING
   * category instead, so a client's own prior customization of that node
   * is preserved while the rest of the preset's tree still applies
   * underneath it. Runs in one transaction — a failure partway leaves no
   * partial tree, per this document's own acceptance criteria.
   */
  async apply(actor: AuthenticatedUser, key: string): Promise<{ created: number; skipped: number }> {
    const preset = await this.prisma.categoryPreset.findUnique({ where: { key } });
    if (!preset) throw new NotFoundException(`No category preset with key "${key}"`);

    const result = await this.prisma.$transaction((tx) =>
      this.createTree(tx, preset.treeJson as unknown as PresetNode[], null),
    );

    await this.audit.record({
      actorId: actor.id,
      action: 'catalog.category_preset_applied',
      entity: 'CategoryPreset',
      entityId: preset.id,
      data: { key, created: result.created, skipped: result.skipped },
    });

    return result;
  }

  private async createTree(
    tx: Prisma.TransactionClient,
    nodes: PresetNode[],
    parentId: string | null,
  ): Promise<{ created: number; skipped: number }> {
    let created = 0;
    let skipped = 0;
    let order = 0;

    for (const node of nodes) {
      const slug = slugifyWithFallback(node.name);
      const existing = await tx.category.findUnique({ where: { slug } });

      let categoryId: string;
      if (existing) {
        skipped++;
        categoryId = existing.id;
      } else {
        const category = await tx.category.create({
          data: {
            slug,
            parentId,
            order,
            translations: {
              create: [
                { locale: 'en', name: node.name },
                ...(node.nameUr ? [{ locale: 'ur' as const, name: node.nameUr }] : []),
              ],
            },
          },
        });
        created++;
        categoryId = category.id;
      }

      if (node.children?.length) {
        const nested = await this.createTree(tx, node.children, categoryId);
        created += nested.created;
        skipped += nested.skipped;
      }
      order++;
    }

    return { created, skipped };
  }
}
