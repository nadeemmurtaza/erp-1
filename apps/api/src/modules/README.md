# API modules

Every business capability is one folder here, grouped into seven domains so a
person can find it. **A domain is only a folder.** It carries no rule and is
never part of a module's identity: packs (`module-packs.ts`), the `MODULES`
allowlist, permissions and the index all know a module by its bare name, so a
module can move between domains without touching any of them.

```
src/modules/<domain>/<module>/
```

| Domain | What it holds | Modules |
|---|---|---|
| `sales` | Selling to a customer, start to finish | `accounts`, `addresses`, `cart`, `fulfilment`, `giftcards`, `loyalty`, `measurements`, `orders`, `payments`, `pos`, `pricing`, `promotions`, `reviews`, `stitching`, `tracking`, `wallet`, `wishlist` |
| `merchandising` | What is sold and how it is presented | `catalog`, `collections`, `content`, `custom-fields`, `embeds`, `entity-attributes`, `fragments`, `marketing`, `metadata-forms`, `recommendations`, `search` |
| `supply-chain` | Getting goods made, bought and moved | `bom`, `inventory`, `marketplace`, `planning`, `production`, `purchasing`, `resilience`, `tradingpartners`, `transfers` |
| `money` | The books | `accounting`, `analytics`, `bankfacilities`, `finance`, `receivables`, `reports`, `settlements`, `tax` |
| `people` | Staff and organization | `attendance`, `hr`, `organization`, `orgstructure`, `payroll`, `tasks` |
| `customers` | Relationships and communication | `crm`, `notification-preferences`, `notify`, `onsitemessages`, `parties`, `support` |
| `system` | Platform capabilities every other area uses | `bpmn-workflows`, `example-hello-world-pack`, `feature-flags`, `identity-verification`, `managed-services`, `rag`, `settings`, `users` |

Two files sit beside the domains: `modules.registry.ts` (which modules can
boot) and `module-packs.ts` (which sector pack each belongs to).

**Rules that still apply, unchanged:** modules never import each other's
internals, cross-module work goes through domain events or extension points,
and `pnpm boundaries` enforces it. The checker finds modules by name wherever
they sit, so importing across domains is judged exactly like importing within
one.

**Adding a module:** create `src/modules/<domain>/<name>/`, add one line to
`module-packs.ts` and one to `modules.registry.ts`. If no domain fits, say so
in the pull request rather than creating an eighth one quietly.
