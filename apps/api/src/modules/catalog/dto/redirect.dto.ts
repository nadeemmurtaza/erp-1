import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateRedirectDto {
  @ApiProperty({ example: '/product/old-slug' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  fromPath!: string;

  @ApiProperty({ example: '/product/new-slug' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  toPath!: string;

  @ApiPropertyOptional({ enum: [301, 302], default: 301 })
  @IsOptional()
  @IsIn([301, 302])
  @IsInt()
  statusCode?: number;
}
