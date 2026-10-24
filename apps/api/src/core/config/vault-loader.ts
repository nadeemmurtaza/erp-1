import { Logger } from '@nestjs/common';

/**
 * Result of attempting to load secrets from nID Secrets Vault.
 */
export interface VaultLoadResult {
  loaded: boolean;
  count: number;
  reason?: 'disabled' | 'missing_credentials' | 'unreachable_or_error';
  error?: string;
}

/**
 * Options for loading secrets from nID Secrets Vault.
 */
export interface VaultLoaderOptions {
  vaultEnabled?: boolean;
  nidBaseUrl?: string;
  serviceId?: string;
  serviceSecret?: string;
  timeoutMs?: number;
}

const logger = new Logger('VaultLoader');

/**
 * Pre-bootstrap nID Secrets Vault loader (ECOSYSTEM.md, WO-255.3).
 *
 * When NID_VAULT_ENABLED=true, fetches scoped environment secrets from the
 * nID Vault server-to-server endpoint and injects them into `process.env`
 * before NestJS initializes AppModule.
 *
 * If the vault is disabled, unreachable, or returns an error, it safely falls
 * back to local environment variables with a descriptive warning so offline
 * development and test suites are never blocked.
 */
export async function loadVaultSecrets(options?: VaultLoaderOptions): Promise<VaultLoadResult> {
  const isEnabled = options?.vaultEnabled ?? (process.env.NID_VAULT_ENABLED === 'true');

  if (!isEnabled) {
    return { loaded: false, count: 0, reason: 'disabled' };
  }

  const baseUrl = options?.nidBaseUrl || process.env.NID_BASE_URL || 'http://localhost:4000';
  const serviceId = options?.serviceId || process.env.NID_SERVICE_ID || 'erp-1';
  const serviceSecret = options?.serviceSecret || process.env.NID_SERVICE_SECRET;
  const timeoutMs = options?.timeoutMs ?? 5000;

  if (!serviceSecret) {
    logger.warn(
      `[WO-255.3] NID_VAULT_ENABLED is true but NID_SERVICE_SECRET is unset. ` +
        `Skipping vault secrets fetch and falling back to local environment variables.`,
    );
    return { loaded: false, count: 0, reason: 'missing_credentials' };
  }

  const exportUrl = `${baseUrl.replace(/\/+$/, '')}/api/v1/vault/secrets/export`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(exportUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        serviceId,
        serviceSecret,
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'No response body');
      logger.warn(
        `[WO-255.3] nID Vault returned HTTP ${response.status} for service '${serviceId}'. ` +
          `Message: ${errorText}. Falling back to local environment variables.`,
      );
      return {
        loaded: false,
        count: 0,
        reason: 'unreachable_or_error',
        error: `HTTP ${response.status}: ${errorText}`,
      };
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const secretsMap: Record<string, unknown> =
      payload.secrets && typeof payload.secrets === 'object'
        ? (payload.secrets as Record<string, unknown>)
        : payload;

    let count = 0;
    for (const [key, val] of Object.entries(secretsMap)) {
      if (typeof val === 'string' && val.length > 0) {
        process.env[key] = val;
        count++;
      }
    }

    logger.log(
      `[WO-255.3] Successfully loaded and injected ${count} secrets from nID Vault for service '${serviceId}'.`,
    );
    return { loaded: true, count };
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : String(error);
    logger.warn(
      `[WO-255.3] Unable to reach nID Vault at ${exportUrl} (${errMessage}). ` +
        `Gracefully falling back to local environment variables.`,
    );
    return {
      loaded: false,
      count: 0,
      reason: 'unreachable_or_error',
      error: errMessage,
    };
  }
}
