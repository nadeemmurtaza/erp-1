import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateOrgUnitDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  typeId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  parentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nodeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  retailBrandId?: string;
}

export class RenameOrgUnitDto {
  @IsString()
  @IsNotEmpty()
  name!: string;
}

export class MoveOrgUnitDto {
  @ApiPropertyOptional({ description: 'null moves the unit to root' })
  @IsOptional()
  @IsString()
  newParentId?: string | null;
}
