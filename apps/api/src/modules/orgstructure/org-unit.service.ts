import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../core/audit/audit.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { Prisma } from '../../core/prisma/client';

export interface OrgUnitView {
  id: string;
  code: string;
  name: string;
  typeId: string;
  typeKey: string;
  typeLabel: string;
  parentId: string | null;
  path: string[];
  depth: number;
  nodeId: string | null;
  retailBrandId: string | null;
  isActive: boolean;
  closedAt: Date | null;
}

export interface MovePreview {
  /** Every unit this move would touch — the unit itself plus its whole subtree. */
  affectedUnitIds: string[];
  /** Where each affected unit's own path would land, keyed by unit id. */
  resultingPaths: Record<string, string[]>;
}

const UNIT_SELECT = {
  id: true,
  code: true,
  name: true,
  typeId: true,
  type: { select: { key: true, label: true } },
  parentId: true,
  path: true,
  depth: true,
  nodeId: true,
  retailBrandId: true,
  isActive: true,
  closedAt: true,
} satisfies Prisma.OrgUnitSelect;

type UnitRow = Prisma.OrgUnitGetPayload<{ select: typeof UNIT_SELECT }>;

/**
 * The org tree (hr-people-org/19-org-structure-offices-departments.md,
 * DECISIONS.md ADR-044). `move()` is the ONLY code in this codebase that
 * writes `path`, `depth` or `parentId` — the same single-writer discipline
 * `InventoryService.move()` holds for stock (CLAUDE.md, "One writer per
 * invariant"). Every other method here reads the tree; only `move()`
 * (through `create`, which is `move()` with no prior parent, and `close`,
 * which touches neither) reshapes it.
 */
@Injectable()
export class OrgUnitService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listTypes() {
    return this.prisma.orgUnitType.findMany({ orderBy: { rank: 'asc' } });
  }

  async tree(): Promise<OrgUnitView[]> {
    const rows = await this.prisma.orgUnit.findMany({
      select: UNIT_SELECT,
      orderBy: [{ depth: 'asc' }, { name: 'asc' }],
    });
    return rows.map(toView);
  }

  async subtree(unitId: string): Promise<OrgUnitView[]> {
    const root = await this.findRow(unitId);
    const rows = await this.prisma.orgUnit.findMany({
      where: { path: { has: root.id } },
      select: UNIT_SELECT,
      orderBy: [{ depth: 'asc' }, { name: 'asc' }],
    });
    return rows.map(toView);
  }

  async get(unitId: string): Promise<OrgUnitView> {
    return toView(await this.findRow(unitId));
  }

  /** A brand-new root or child unit. A create with no `parentId` is the tree's own root case. */
  async create(
    input: { code: string; name: string; typeId: string; parentId?: string | null; nodeId?: string | null; retailBrandId?: string | null },
    actorId: string,
  ): Promise<OrgUnitView> {
    const code = cleanRequired(input.code, 'a code');
    const name = cleanRequired(input.name, 'a name');
    const type = await this.prisma.orgUnitType.findUnique({ where: { id: input.typeId } });
    if (!type) throw new BadRequestException('That unit type does not exist.');

    const parent = input.parentId ? await this.activeRow(input.parentId) : null;
    const path = parent ? [...parent.path] : [];
    const depth = parent ? parent.depth + 1 : 0;
    const retailBrandId = input.retailBrandId ?? parent?.retailBrandId ?? null;

    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.orgUnit.create({
        data: {
          code,
          name,
          typeId: input.typeId,
          parentId: parent?.id ?? null,
          nodeId: input.nodeId ?? null,
          retailBrandId,
          path: [],
          depth,
        },
        select: UNIT_SELECT,
      });
      // path includes this unit's own id, only known once the row exists.
      const finalPath = [...path, row.id];
      const updated = await tx.orgUnit.update({
        where: { id: row.id },
        data: { path: finalPath },
        select: UNIT_SELECT,
      });

      await this.audit.recordEvidence(tx, {
        actorId,
        action: 'org_unit.created',
        entity: 'OrgUnit',
        entityId: row.id,
        data: { code, name, parentId: parent?.id ?? null, path: finalPath },
      });

      return updated;
    });

    return toView(created);
  }

  async rename(unitId: string, name: string, actorId: string): Promise<OrgUnitView> {
    const existing = await this.findRow(unitId);
    const cleaned = cleanRequired(name, 'a name');
    if (cleaned === existing.name) return toView(existing);

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.orgUnit.update({ where: { id: unitId }, data: { name: cleaned }, select: UNIT_SELECT });
      await this.audit.recordEvidence(tx, {
        actorId,
        action: 'org_unit.renamed',
        entity: 'OrgUnit',
        entityId: unitId,
        data: { from: existing.name, to: cleaned },
      });
      return row;
    });

    return toView(updated);
  }

  /**
   * Closes a unit — never deleted, per the doc's own "reversal document"
   * lens: attendance, journal lines and completed tasks reference it years
   * later. Refused if it still holds active positions (doc 20's own
   * reassignment step is a human action, not a cascade) or open children.
   */
  async close(unitId: string, actorId: string): Promise<OrgUnitView> {
    const existing = await this.findRow(unitId);
    if (existing.closedAt) return toView(existing);

    const openChild = await this.prisma.orgUnit.findFirst({ where: { parentId: unitId, closedAt: null } });
    if (openChild) {
      throw new ConflictException('This unit still has open child units. Close or move them first.');
    }
    const activePosition = await this.prisma.position.findFirst({ where: { orgUnitId: unitId } });
    if (activePosition) {
      throw new ConflictException('This unit still holds positions. Move them to another unit first.');
    }

    const closedAt = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.orgUnit.update({
        where: { id: unitId },
        data: { closedAt, isActive: false },
        select: UNIT_SELECT,
      });
      await this.audit.recordEvidence(tx, {
        actorId,
        action: 'org_unit.closed',
        entity: 'OrgUnit',
        entityId: unitId,
        data: { closedAt },
      });
      return row;
    });

    return toView(updated);
  }

  /** What `move()` would do, without writing anything — the identical computation the button that greys itself out calls. */
  async previewMove(unitId: string, newParentId: string | null): Promise<MovePreview> {
    return this.computeMove(unitId, newParentId);
  }

  /**
   * Re-parents a unit and rewrites the whole affected subtree's `path`/
   * `depth` in one transaction — the only place either column is written.
   * Refuses a move that would make a unit its own ancestor.
   */
  async move(unitId: string, newParentId: string | null, actorId: string): Promise<OrgUnitView> {
    const { affectedUnitIds, resultingPaths } = await this.computeMove(unitId, newParentId);
    const existing = await this.findRow(unitId);

    const updated = await this.prisma.$transaction(async (tx) => {
      for (const id of affectedUnitIds) {
        const path = resultingPaths[id]!;
        await tx.orgUnit.update({ where: { id }, data: { path, depth: path.length - 1 } });
      }
      const row = await tx.orgUnit.update({
        where: { id: unitId },
        data: { parentId: newParentId },
        select: UNIT_SELECT,
      });

      await this.audit.recordEvidence(tx, {
        actorId,
        action: 'org_unit.moved',
        entity: 'OrgUnit',
        entityId: unitId,
        data: { from: { parentId: existing.parentId, path: existing.path }, to: { parentId: newParentId, path: resultingPaths[unitId] } },
      });

      return row;
    });

    return toView(updated);
  }

  private async computeMove(unitId: string, newParentId: string | null): Promise<MovePreview> {
    const unit = await this.findRow(unitId);
    const newParent = newParentId ? await this.activeRow(newParentId) : null;

    if (newParentId === unitId) {
      throw new BadRequestException('A unit cannot be its own parent.');
    }
    if (newParent && newParent.path.includes(unitId)) {
      throw new BadRequestException('That would make this unit its own ancestor.');
    }

    const newBasePath = newParent ? newParent.path : [];
    const subtree = await this.prisma.orgUnit.findMany({
      where: { path: { has: unitId } },
      select: { id: true, path: true },
    });

    const oldPrefixLength = unit.path.length - 1; // ancestors above `unit` itself
    const resultingPaths: Record<string, string[]> = {};
    for (const row of subtree) {
      const suffix = row.path.slice(oldPrefixLength); // this row's own path from `unit` downward, `unit`'s id included
      resultingPaths[row.id] = [...newBasePath, ...suffix];
    }

    return { affectedUnitIds: subtree.map((row) => row.id), resultingPaths };
  }

  private async findRow(unitId: string): Promise<UnitRow> {
    const row = await this.prisma.orgUnit.findUnique({ where: { id: unitId }, select: UNIT_SELECT });
    if (!row) throw new NotFoundException('That org unit does not exist.');
    return row;
  }

  private async activeRow(unitId: string): Promise<UnitRow> {
    const row = await this.findRow(unitId);
    if (row.closedAt) throw new ConflictException('That unit is closed and cannot receive a new child or move.');
    return row;
  }
}

function toView(row: UnitRow): OrgUnitView {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    typeId: row.typeId,
    typeKey: row.type.key,
    typeLabel: row.type.label,
    parentId: row.parentId,
    path: row.path,
    depth: row.depth,
    nodeId: row.nodeId,
    retailBrandId: row.retailBrandId,
    isActive: row.isActive,
    closedAt: row.closedAt,
  };
}

function cleanRequired(raw: string, what: string): string {
  const value = raw.trim();
  if (!value) throw new BadRequestException(`Enter ${what}.`);
  return value;
}
