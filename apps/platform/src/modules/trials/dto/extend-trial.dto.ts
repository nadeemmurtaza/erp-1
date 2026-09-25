import { IsISO8601, IsString, MaxLength, MinLength } from 'class-validator';

export class ExtendTrialDto {
  @IsISO8601()
  newExpiresAt!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  reason!: string;
}
