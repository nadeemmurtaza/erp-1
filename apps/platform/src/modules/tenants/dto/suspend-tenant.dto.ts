import { IsString, MinLength } from 'class-validator';

export class SuspendTenantDto {
  @IsString()
  @MinLength(1)
  reason!: string;
}
