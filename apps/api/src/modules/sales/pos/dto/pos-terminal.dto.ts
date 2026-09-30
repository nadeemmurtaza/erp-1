import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class RegisterPosTerminalDto {
  @ApiProperty({ description: '"LHR-01-T1" — printed on receipts, shown on the branch exception dashboard.' })
  @IsString()
  @IsNotEmpty()
  code!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  label!: string;

  @ApiProperty({ description: 'The Location this terminal sells from.' })
  @IsString()
  @IsNotEmpty()
  locationId!: string;
}

export class UpdatePosTerminalDto extends PartialType(RegisterPosTerminalDto) {
  @ApiPropertyOptional({ enum: ['PENDING', 'ACTIVE', 'SUSPENDED'] })
  @IsOptional()
  @IsIn(['PENDING', 'ACTIVE', 'SUSPENDED'])
  status?: 'PENDING' | 'ACTIVE' | 'SUSPENDED';
}
