import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsPositive } from 'class-validator';

export class SetMonthlyTargetDto {
  @ApiProperty({ description: 'Paisa, e.g. 100000000 for Rs 1,000,000' })
  @IsInt()
  @IsPositive()
  targetAmount!: number;
}
