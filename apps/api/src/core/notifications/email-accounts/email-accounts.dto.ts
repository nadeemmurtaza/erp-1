import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDefined,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const PURPOSES = ['TRANSACTIONAL', 'MARKETING', 'SUPPORT'] as const;

export class SmtpFieldsDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  host!: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  @Max(65535)
  port!: number;

  @ApiProperty()
  @IsBoolean()
  secure!: boolean;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  user!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  password!: string;
}

export class PartialSmtpFieldsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  host?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  secure?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  user?: string;

  /** Omit to keep the password already on file. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  password?: string;
}

export class ImapFieldsDto extends SmtpFieldsDto {}
export class PartialImapFieldsDto extends PartialSmtpFieldsDto {}

export class CreateEmailAccountDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  label!: string;

  @ApiProperty({ enum: PURPOSES })
  @IsIn(PURPOSES)
  purpose!: (typeof PURPOSES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  fromName!: string;

  @ApiProperty()
  @IsEmail()
  fromEmail!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  replyTo?: string;

  @ApiProperty({ type: SmtpFieldsDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => SmtpFieldsDto)
  smtp!: SmtpFieldsDto;

  @ApiPropertyOptional({ type: ImapFieldsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ImapFieldsDto)
  imap?: ImapFieldsDto;
}

export class UpdateEmailAccountDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  label?: string;

  @ApiPropertyOptional({ enum: PURPOSES })
  @IsOptional()
  @IsIn(PURPOSES)
  purpose?: (typeof PURPOSES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  fromName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  fromEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  replyTo?: string;

  @ApiPropertyOptional({ type: PartialSmtpFieldsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PartialSmtpFieldsDto)
  smtp?: PartialSmtpFieldsDto;

  @ApiPropertyOptional({ type: PartialImapFieldsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PartialImapFieldsDto)
  imap?: PartialImapFieldsDto;

  /** True removes this account's IMAP connection entirely. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  clearImap?: boolean;
}

export class TestSmtpDto extends SmtpFieldsDto {}
export class TestImapDto extends ImapFieldsDto {}
