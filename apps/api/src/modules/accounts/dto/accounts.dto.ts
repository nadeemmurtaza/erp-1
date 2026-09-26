import { ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

/** Staff-side — creating a standing account for a buyer's own Contact. */
export class CreateB2BAccountDto {
  @IsString()
  @IsNotEmpty()
  customerId!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresPurchaseOrder?: boolean;
}

export class UpdateB2BAccountDto {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresPurchaseOrder?: boolean;
}

/** Staff-side — this organization sets the threshold; the buyer's own admin
 * contact names who among their staff may approve (WO-149.4's portal screen). */
export class SetApprovalPolicyDto {
  @IsInt()
  @Min(0)
  thresholdMinor!: number;

  @IsArray()
  @ArrayMinSize(1, { message: 'A policy needs at least one approver contact.' })
  @IsString({ each: true })
  approverContactIds!: string[];
}

export class DecideB2BOrderRequestDto {
  @IsIn(['APPROVE', 'REJECT'])
  decision!: 'APPROVE' | 'REJECT';

  @IsOptional()
  @IsString()
  comment?: string;
}
