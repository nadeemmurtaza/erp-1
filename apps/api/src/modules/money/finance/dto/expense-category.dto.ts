import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class CreateExpenseCategoryDto {
  @ApiPropertyOptional({ example: 'marketing' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9_]+$/, {
    message: 'key must be lowercase letters, digits and underscores only',
  })
  key!: string;

  @ApiPropertyOptional({ example: 'Marketing' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ default: false, description: 'Direct costs sit above the gross-profit line.' })
  @IsBoolean()
  @IsOptional()
  isDirect?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @IsInt()
  @IsOptional()
  order?: number;
}

export class UpdateExpenseCategoryDto extends PartialType(CreateExpenseCategoryDto) {}
