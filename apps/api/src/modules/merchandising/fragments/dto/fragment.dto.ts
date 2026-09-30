import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayNotEmpty, Equals, IsArray, IsEnum, IsNotEmpty, IsOptional, IsString, IsUrl, Matches } from 'class-validator';
import type { FragmentStatus } from '../../../../core/prisma/client';

const FRAGMENT_STATUSES: FragmentStatus[] = ['ACTIVE', 'SUSPENDED'];

export class RegisterFragmentDto {
  @ApiProperty({ description: 'A stable slug — "predictive-analytics-widget" — never the vendor\'s own name verbatim.' })
  @IsString()
  @Matches(/^[a-z][a-z0-9-]*$/, { message: 'key must be kebab-case, starting with a letter.' })
  key!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  label!: string;

  @ApiProperty({ description: 'Where the fragment is served from.' })
  @IsUrl({ require_protocol: true })
  remoteUrl!: string;

  @ApiProperty({ description: 'Which admin screens may embed this fragment — never a blanket grant.', type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  mountPoints!: string[];

  @ApiProperty({
    description:
      'Confirms the fragment’s own remote deployment has run its own equivalent overflow/contrast check before being registered — required, never defaulted true.',
  })
  @Equals(true, { message: 'A fragment cannot be registered without confirming the design-law compliance attestation.' })
  attestationConfirmed!: boolean;
}

export class UpdateFragmentDto {
  @ApiPropertyOptional()
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  label?: string;

  @ApiPropertyOptional()
  @IsUrl({ require_protocol: true })
  @IsOptional()
  remoteUrl?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @IsOptional()
  mountPoints?: string[];

  @ApiPropertyOptional({ enum: FRAGMENT_STATUSES })
  @IsEnum(FRAGMENT_STATUSES)
  @IsOptional()
  status?: FragmentStatus;
}
