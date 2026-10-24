import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../prisma/prisma.service';
import type { PlatformOpsClient } from '../prisma/client';
import { hashOpsKey } from './ops-key';
import { OPS_PERMISSIONS_KEY } from './decorators';
import type { PlatformPermission } from './ops-permissions';

export interface RequestWithOpsClient extends Request {
  opsClient?: PlatformOpsClient;
}

/**
 * The control plane's own auth boundary. There is no session/login here by
 * design (doc 39 WO-39.1/39.2 scope, a staff console is WO-39.8) — every
 * caller is an internal tool presenting a bearer ops key, resolved to a
 * `PlatformOpsClient` and checked against its own `scopes`, the same
 * "server-side, never trusted from the client" rule `PermissionsGuard`
 * already enforces on the tenant side.
 */
@Injectable()
export class OpsAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithOpsClient>();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer ops key.');
    }

    const rawKey = header.slice('Bearer '.length);
    const keyHash = hashOpsKey(rawKey, this.config.get('PLATFORM_OPS_KEY_PEPPER'));
    const client = await this.prisma.platformOpsClient.findUnique({ where: { keyHash } });

    if (!client || client.status !== 'ACTIVE') {
      throw new UnauthorizedException('Ops key is invalid or revoked.');
    }

    const required = this.reflector.getAllAndOverride<PlatformPermission[]>(OPS_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (required && required.length > 0 && !required.some((key) => client.scopes.includes(key))) {
      throw new ForbiddenException('This ops key does not carry the required scope.');
    }

    request.opsClient = client;
    void this.prisma.platformOpsClient.update({ where: { id: client.id }, data: { lastUsedAt: new Date() } });

    return true;
  }
}
