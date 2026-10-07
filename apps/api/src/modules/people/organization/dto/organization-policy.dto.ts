import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

/** R9's org.allow_inter_brand_transfers — see OrganizationService.setInterBrandTransfersPolicy(). */
export class SetInterBrandTransfersPolicyDto {
  @ApiProperty()
  @IsBoolean()
  allow!: boolean;
}
