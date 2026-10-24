import type { AuthenticatedUser } from '../auth/auth.constants';

/**
 * The one shape every future calling modality converges on
 * (135-intent-router-voice-video-agent.md §1) — a dashboard click, a voice
 * transcript, a video-call assistant's structured output, or an MCP tool
 * call are all, by the time they reach this repository's own business
 * logic, reducible to this. `actor` is always an already-authenticated
 * `AuthenticatedUser` (a session or a personal API key, 163-personal-api-
 * keys.md) — the router trusts nothing it wasn't handed already-
 * authenticated; producing an `Intent` from a raw voice/video/MCP payload is
 * the parser's job, not the router's.
 */
export interface Intent<TParams = Record<string, unknown>> {
  name: string;
  parameters: TParams;
  actor: AuthenticatedUser;
  /** "dashboard" | "voice" | "video" | "mcp_agent" | a future one — never a closed enum, so a new modality costs zero changes here. */
  sourceModality: string;
}

/**
 * How one intent name maps onto an existing service call — doc 116's own
 * `McpToolDefinition` registry, generalized to any source
 * (135-intent-router-voice-video-agent.md §1). `requiredPermissions` and
 * `sessionOnly` mirror `@RequirePermission(...)`/`@SessionOnly()` exactly
 * (any one permission suffices, same OR semantics `PermissionsGuard`
 * already uses) so a registered intent is refused to an actor exactly as
 * the equivalent HTTP route would refuse them — never a shortcut around a
 * check a dashboard click would also have to pass.
 */
export interface IntentHandlerDefinition<TParams = Record<string, unknown>, TResult = unknown> {
  name: string;
  /** What an agent (or another developer registering a new source) reads to know what this does. */
  description: string;
  /** Empty means every authenticated actor may call it — same convention as an undecorated route. */
  requiredPermissions: readonly string[];
  /** Mirrors `@SessionOnly()` — refused to every API-key actor, whatever it carries. Default false. */
  sessionOnly?: boolean;
  handler: (parameters: TParams, actor: AuthenticatedUser) => Promise<TResult>;
}
