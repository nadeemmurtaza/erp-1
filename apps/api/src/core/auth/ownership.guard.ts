import { ForbiddenException } from '@nestjs/common';

export interface OwnedEntity {
  ownerId: string | null;
}

/**
 * Throws unless the actor holds "<capability>.manage_all", or holds
 * "<capability>.manage_own" AND entity.ownerId === actor.id. The single
 * reference point for every "my rows only" check in the codebase — see
 * MULTI-SECTOR.md B5 / docs/implementation/access-control-identity/16-pbac-row-scoping.md.
 */
export function assertCanManage(
  actor: { id: string; permissions: string[] },
  capability: string,
  entity: OwnedEntity,
): void {
  if (actor.permissions.includes(`${capability}.manage_all`)) return;
  if (actor.permissions.includes(`${capability}.manage_own`) && entity.ownerId === actor.id) {
    return;
  }
  throw new ForbiddenException(`You do not have access to manage this ${capability} row.`);
}
