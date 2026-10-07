import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUrl, Matches } from 'class-validator';

export class CreateEmbeddedWidgetDto {
  @ApiProperty({ description: 'A stable slug — "predictive-analytics" — never the vendor\'s own name verbatim.' })
  @IsString()
  @Matches(/^[a-z][a-z0-9-]*$/, { message: 'key must be kebab-case, starting with a letter.' })
  key!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  label!: string;

  @ApiProperty()
  @IsUrl({ require_protocol: true })
  targetUrl!: string;
}

export class UpdateEmbeddedWidgetDto {
  @ApiPropertyOptional()
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  label?: string;

  @ApiPropertyOptional()
  @IsUrl({ require_protocol: true })
  @IsOptional()
  targetUrl?: string;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
