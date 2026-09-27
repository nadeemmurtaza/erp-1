import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';

/**
 * R20 (resilience-scalability/144-supply-chain-resilience-planning-engine.md)
 * — a projection, never a second model: rebuilt on demand from rows every
 * enabled module already writes, never a maintained graph structure of its
 * own. Extends this document's own type union with `RawMaterial`: this
 * codebase's `BomComponent` consumes a `RawMaterial`, a distinct model from
 * `ProductVariant` ("Sku"), never the "SKU -> Recipe -> SKU" shorthand the
 * document's own prose uses loosely — the real schema draws that line, so
 * the graph does too.
 */
export type GraphNodeType = 'Supplier' | 'Sku' | 'RawMaterial' | 'Location' | 'Obligation';

export interface GraphNode {
  type: GraphNodeType;
  id: string;
}

export interface DependencyEdge {
  from: GraphNode;
  to: GraphNode;
  weight?: number;
}

/**
 * Reads five edge types, each from rows this repository already writes for
 * its own reasons — never invented, never guessed. Two of the document's own
 * illustrative edge types ("SKU -> Channel at Location" via a
 * `LocationAssortment` model, "Sale -> Cash account" via `JournalLine`) are
 * left out: neither has a clean, already-shipped row to project from in
 * this actual schema (no `LocationAssortment` model exists; a per-sale cash
 * edge would mean inventing a projection no work order here names), so
 * building them would violate this same document's own "never invented,
 * never guessed" rule for R21. The five below are the concrete, buildable
 * core; a future work order can add either once a real row exists to read.
 */
@Injectable()
export class DependencyGraphService {
  constructor(private readonly prisma: PrismaService) {}

  async build(): Promise<DependencyEdge[]> {
    const [supplierProducts, bomComponents, stock, transfers, unpaidBills] = await Promise.all([
      this.prisma.supplierProduct.findMany({ select: { supplierId: true, variantId: true } }),
      this.prisma.bomComponent.findMany({
        select: { rawMaterialId: true, recipe: { select: { variantId: true } } },
      }),
      this.prisma.variantLocationStock.findMany({
        where: { quantity: { gt: 0 } },
        select: { variantId: true, locationId: true, quantity: true },
      }),
      this.prisma.stockTransfer.findMany({
        select: { sourceLocationId: true, destinationLocationId: true },
        distinct: ['sourceLocationId', 'destinationLocationId'],
      }),
      this.prisma.supplierBill.findMany({
        select: { supplierId: true, id: true, amount: true, amountPaid: true },
      }),
    ]);

    const edges: DependencyEdge[] = [];

    // Supplier -> SKU: which suppliers can ship which variants.
    for (const sp of supplierProducts) {
      edges.push({ from: { type: 'Supplier', id: sp.supplierId }, to: { type: 'Sku', id: sp.variantId } });
    }

    // RawMaterial -> SKU: a recipe's own inputs feed its finished variant.
    for (const bc of bomComponents) {
      edges.push({ from: { type: 'RawMaterial', id: bc.rawMaterialId }, to: { type: 'Sku', id: bc.recipe.variantId } });
    }

    // SKU -> Location: real, current on-hand stock.
    for (const s of stock) {
      edges.push({ from: { type: 'Sku', id: s.variantId }, to: { type: 'Location', id: s.locationId }, weight: s.quantity });
    }

    // Location -> Location: pairs with real transfer history — a lateral
    // edge only exists where stock has actually moved between them before,
    // never a blanket "any two locations may transfer" assumption.
    for (const t of transfers) {
      edges.push({ from: { type: 'Location', id: t.sourceLocationId }, to: { type: 'Location', id: t.destinationLocationId } });
    }

    // Supplier -> Obligation: what is still owed, unpaid SupplierBills.
    for (const bill of unpaidBills) {
      if (bill.amountPaid >= bill.amount) continue;
      edges.push({
        from: { type: 'Supplier', id: bill.supplierId },
        to: { type: 'Obligation', id: bill.id },
        weight: bill.amount - bill.amountPaid,
      });
    }

    return edges;
  }
}
