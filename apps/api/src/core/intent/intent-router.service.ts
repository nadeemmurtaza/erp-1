import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { decideApiKeyAccess, type RouteRequirements } from '../auth/api-keys/api-key-access';
import type { Intent, IntentHandlerDefinition } from './intent.types';

/**
 * Resolves an `Intent` to the identical service call an HTTP controller for
 * the same action already makes (135-intent-router-voice-video-agent.md
 * §1) — doc 116's own `McpToolDefinition` registry, generalized to any
 * source. The router does the same lookup regardless of `sourceModality`:
 * resolve `intent.name` to a registered handler, check `intent.actor`
 * against the identical permission/session-only rule `PermissionsGuard`
 * already enforces for HTTP, call the handler. A modality-specific parser
 * (a future `VoiceIntentParser`, a video-call assistant's own adapter) is
 * the only thing that changes when a new interaction paradigm arrives —
 * this class, and every `*Service` method it dispatches to, does not.
 *
 * A module registers its own intents from its own `onModuleInit()` — the
 * core-internal counterpart to `StockIntakeRegistry`
 * (core/extension-points/stock-intake.registry.ts) — never the reverse:
 * this class imports no module-specific type, so a feature module can be
 * absent with nothing here breaking.
 */
@Injectable()
export class IntentRouterService {
  private readonly logger = new Logger(IntentRouterService.name);
  private readonly handlers = new Map<string, IntentHandlerDefinition<Record<string, unknown>, unknown>>();

  register<TParams extends Record<string, unknown>, TResult>(definition: IntentHandlerDefinition<TParams, TResult>): void {
    if (this.handlers.has(definition.name)) {
      throw new Error(`Intent "${definition.name}" is already registered — names must be unique.`);
    }
    this.handlers.set(definition.name, definition as IntentHandlerDefinition<Record<string, unknown>, unknown>);
  }

  /** Every registered intent's name and description — an agent (or an admin screen) reads this to know what it may call. */
  list(): Array<Pick<IntentHandlerDefinition, 'name' | 'description' | 'requiredPermissions' | 'sessionOnly'>> {
    return [...this.handlers.values()].map((definition) => ({
      name: definition.name,
      description: definition.description,
      requiredPermissions: definition.requiredPermissions,
      sessionOnly: definition.sessionOnly ?? false,
    }));
  }

  async route<TResult = unknown>(intent: Intent): Promise<TResult> {
    const definition = this.handlers.get(intent.name);
    if (!definition) {
      throw new NotFoundException(`No handler is registered for intent "${intent.name}".`);
    }

    this.assertAllowed(intent, definition);

    this.logger.log(`routing intent "${intent.name}" from ${intent.sourceModality} for actor ${intent.actor.id}`);
    return definition.handler(intent.parameters, intent.actor) as Promise<TResult>;
  }

  /**
   * The identical decision `PermissionsGuard` makes for an HTTP route with
   * the same `@RequirePermission(...)`/`@SessionOnly()` — reusing
   * `decideApiKeyAccess` for an API-key actor rather than re-deriving it, so
   * this can never silently drift from what the HTTP path enforces.
   */
  private assertAllowed(intent: Intent, definition: IntentHandlerDefinition<Record<string, unknown>, unknown>): void {
    const route: RouteRequirements = {
      isPublic: false,
      sessionOnly: definition.sessionOnly ?? false,
      requiredPermissions: definition.requiredPermissions,
      requiredCustomerScopes: [],
    };

    if (intent.actor.apiKey) {
      const decision = decideApiKeyAccess(intent.actor.apiKey, intent.actor.permissions, route);
      if (!decision.allowed) throw new ForbiddenException(decision.reason);
      return;
    }

    if (route.requiredPermissions.length > 0 && !route.requiredPermissions.some((key) => intent.actor.permissions.includes(key))) {
      throw new ForbiddenException('You do not have access to this resource.');
    }
  }
}
