import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from './env.validation';

/**
 * Typed accessor over ConfigService. Everything else in the codebase reads
 * configuration through this class, so there is one place where an env var name
 * is spelled out and one place to change when one is renamed.
 */
@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  get<K extends keyof Env>(key: K): Env[K] {
    return this.config.get(key, { infer: true });
  }

  get isProduction(): boolean {
    return this.get('NODE_ENV') === 'production';
  }

  get isTest(): boolean {
    return this.get('NODE_ENV') === 'test';
  }

  get nodeRole(): Env['NODE_ROLE'] {
    return this.get('NODE_ROLE');
  }

  get nodeId(): string {
    return this.get('NODE_ID');
  }

  get parentUrl(): string | undefined {
    return this.get('PARENT_URL');
  }

  get parentApiKey(): string | undefined {
    return this.get('PARENT_API_KEY');
  }

  /**
   * False for every deployment today. Once true, chain-topology UI (a brand
   * picker, a scope selector, a sync screen) is allowed to render — RETAIL-ERP.md
   * R14's "every tier concept must be invisible in Solo".
   */
  get isChainNode(): boolean {
    return this.get('NODE_ROLE') !== 'STANDALONE';
  }

  get isEcosystemEnabled(): boolean {
    return this.get('ECOSYSTEM_ENABLED');
  }

  get ecosystemGatewayUrl(): string | undefined {
    return this.get('ECOSYSTEM_GATEWAY_URL');
  }

  get ecosystemGatewayKey(): string | undefined {
    return this.get('ECOSYSTEM_GATEWAY_KEY');
  }

  get ecosystemEventBusUrl(): string | undefined {
    return this.get('ECOSYSTEM_EVENT_BUS_URL');
  }

  /** Optional feature modules switched on by the MODULES allowlist. */
  isModuleEnabled(name: string): boolean {
    return this.get('MODULES').includes(name);
  }

  isPaymentProviderEnabled(name: string): boolean {
    return this.get('PAYMENT_PROVIDERS').includes(name);
  }

  isCourierProviderEnabled(name: string): boolean {
    return this.get('COURIER_PROVIDERS').includes(name);
  }

  isNotificationChannelEnabled(name: string): boolean {
    return this.get('NOTIFICATION_CHANNELS').includes(name);
  }

  isAiProviderEnabled(name: string): boolean {
    return this.get('AI_PROVIDERS').includes(name);
  }
}
