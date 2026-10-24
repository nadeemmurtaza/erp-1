import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PlatformEnv } from './env.validation';

/**
 * Typed accessor over ConfigService — one place an env var name is spelled
 * out, mirroring apps/api's AppConfigService.
 */
@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService<PlatformEnv, true>) {}

  get<K extends keyof PlatformEnv>(key: K): PlatformEnv[K] {
    return this.config.get(key, { infer: true });
  }

  get isProduction(): boolean {
    return this.get('NODE_ENV') === 'production';
  }

  get isTest(): boolean {
    return this.get('NODE_ENV') === 'test';
  }
}
