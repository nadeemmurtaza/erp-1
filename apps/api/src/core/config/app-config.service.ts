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

  /** Optional feature modules switched on by the MODULES allowlist. */
  isModuleEnabled(name: string): boolean {
    return this.get('MODULES').includes(name);
  }

  isPaymentProviderEnabled(name: string): boolean {
    return this.get('PAYMENT_PROVIDERS').includes(name);
  }

  isNotificationChannelEnabled(name: string): boolean {
    return this.get('NOTIFICATION_CHANNELS').includes(name);
  }
}
