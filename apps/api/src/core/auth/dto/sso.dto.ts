import { BadRequestException } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import type { SsoCallbackParams } from '../identity-provider';

/*
 * Shape and bounds only. Whether an issuer URL is safe to trust, a domain
 * may be allowed, or a role is safe to provision every new sign-in into is
 * SsoService's decision — the same split api-key.dto.ts makes.
 */

export const SSO_PROTOCOLS = ['OIDC'] as const;
export const SSO_CONNECTION_STATUSES = ['ACTIVE', 'SUSPENDED'] as const;

export const SSO_LABEL_MAX_LENGTH = 80;
export const SSO_MAX_ALLOWED_DOMAINS = 50;

export class CreateSsoConnectionDto {
  @ApiProperty({ enum: SSO_PROTOCOLS, description: 'OIDC only today; SAML is WO-161.2b.' })
  @IsIn(SSO_PROTOCOLS)
  protocol!: (typeof SSO_PROTOCOLS)[number];

  @ApiProperty({ example: 'Company Google Workspace', maxLength: SSO_LABEL_MAX_LENGTH })
  @IsString()
  @IsNotEmpty()
  @MaxLength(SSO_LABEL_MAX_LENGTH)
  label!: string;

  @ApiProperty({ example: 'https://accounts.google.com', description: 'The issuer identifier (https).' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  issuerUrl!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  clientId!: string;

  @ApiProperty({ description: 'The OIDC client secret. Write-only: stored encrypted, never returned.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  credential!: string;

  @ApiProperty({ type: [String], example: ['example.com'], description: 'Exact domains; a subdomain is not the domain.' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(SSO_MAX_ALLOWED_DOMAINS)
  @IsString({ each: true })
  @MaxLength(253, { each: true })
  allowedEmailDomains!: string[];

  @ApiProperty({ example: 'Staff', description: 'The role a brand-new sign-in is provisioned into.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  defaultRoleName!: string;
}

/** Every field optional; `credential` replaces the stored secret only when sent. */
export class UpdateSsoConnectionDto {
  @ApiPropertyOptional({ enum: SSO_PROTOCOLS })
  @IsOptional()
  @IsIn(SSO_PROTOCOLS)
  protocol?: (typeof SSO_PROTOCOLS)[number];

  @ApiPropertyOptional({ maxLength: SSO_LABEL_MAX_LENGTH })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(SSO_LABEL_MAX_LENGTH)
  label?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  issuerUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  clientId?: string;

  @ApiPropertyOptional({ description: 'A new client secret. Omit to keep the stored one.' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  credential?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(SSO_MAX_ALLOWED_DOMAINS)
  @IsString({ each: true })
  @MaxLength(253, { each: true })
  allowedEmailDomains?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  defaultRoleName?: string;

  @ApiPropertyOptional({ enum: SSO_CONNECTION_STATUSES, description: 'SUSPENDED stops new sign-ins; ACTIVE resumes them.' })
  @IsOptional()
  @IsIn(SSO_CONNECTION_STATUSES)
  status?: (typeof SSO_CONNECTION_STATUSES)[number];

  @ApiPropertyOptional({
    description:
      'When true, staff password sign-in is refused with a message pointing at this SSO button — except the ' +
      'admin who enabled it, who can always undo the change. Turn this on only after confirming sign-in through ' +
      'this connection already works.',
  })
  @IsOptional()
  @IsBoolean()
  enforceSso?: boolean;
}

/** What the provider sent back: a code to exchange, or an error (the person cancelled, or the provider refused). */
export type SsoCallbackQuery =
  | { outcome: 'code'; params: SsoCallbackParams }
  | { outcome: 'error'; error: string; state: string | null };

/**
 * Reads the callback's query string.
 *
 * Deliberately not a class-validator DTO: the global ValidationPipe runs
 * with `forbidNonWhitelisted`, and providers add parameters of their own to
 * this redirect (Google sends `scope`, `authuser`, `hd` and `prompt`), so a
 * whitelisting DTO would turn every such sign-in into a 400. This keeps the
 * authorization-code parameters — and never a front-channel `id_token`,
 * `access_token` or JARM `response` — and ignores the rest. A repeated
 * parameter (`?code=a&code=b` parses to an array) is refused outright.
 */
export function readSsoCallbackQuery(query: Record<string, unknown>): SsoCallbackQuery {
  const read = (name: string, max: number): string | undefined => {
    const value = query[name];
    if (value === undefined) return undefined;
    if (typeof value !== 'string' || value.length === 0 || value.length > max) {
      throw new BadRequestException(`The sign-in response carried an invalid "${name}".`);
    }
    return value;
  };

  const state = read('state', 512);
  const error = read('error', 256);
  if (error !== undefined) {
    return { outcome: 'error', error, state: state ?? null };
  }

  const code = read('code', 4096);
  if (code === undefined || state === undefined) {
    throw new BadRequestException('The sign-in response carried no code or no state.');
  }

  const iss = read('iss', 2048);
  const sessionState = read('session_state', 2048);
  return {
    outcome: 'code',
    params: {
      code,
      state,
      ...(iss !== undefined ? { iss } : {}),
      ...(sessionState !== undefined ? { session_state: sessionState } : {}),
    },
  };
}
