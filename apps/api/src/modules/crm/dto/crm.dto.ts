import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { INTERACTION_KINDS, LEAD_STATUSES } from '@newax/shared';
import { PaginationQueryDto } from '../../../core/common/dto/pagination.dto';

const CONTACT_STATUSES = ['LEAD', 'ACTIVE', 'REPEAT', 'DORMANT', 'BLOCKED'] as const;

export class ContactQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: CONTACT_STATUSES })
  @IsOptional()
  @IsIn([...CONTACT_STATUSES])
  status?: (typeof CONTACT_STATUSES)[number];

  @ApiPropertyOptional({ description: 'Tag name' })
  @IsOptional()
  @IsString()
  tag?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ description: 'At least this many orders — repeat buyers' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minOrders?: number;
}

export class UpdateContactDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  email?: string;

  @ApiPropertyOptional({ description: 'Staff notes, not shown to the customer' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({ enum: CONTACT_STATUSES })
  @IsOptional()
  @IsIn([...CONTACT_STATUSES])
  status?: (typeof CONTACT_STATUSES)[number];

  @ApiPropertyOptional({ description: 'Staff member who owns this relationship' })
  @IsOptional()
  @IsString()
  ownerId?: string;
}

export class AddInteractionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contactId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  leadId?: string;

  @ApiProperty({ enum: INTERACTION_KINDS })
  @IsIn([...INTERACTION_KINDS])
  kind!: (typeof INTERACTION_KINDS)[number];

  @ApiProperty({ example: 'Called about the bridal order; wants a fitting on Friday.' })
  @IsString()
  @IsNotEmpty({ message: 'Write what was said.' })
  @MaxLength(2000)
  body!: string;

  @ApiPropertyOptional({ description: 'Defaults to now' })
  @IsOptional()
  @IsDateString()
  occurredAt?: string;
}

export class AddFollowUpDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contactId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  leadId?: string;

  @ApiProperty({ example: 'Call back about the lawn restock' })
  @IsString()
  @IsNotEmpty({ message: 'Say what needs doing.' })
  @MaxLength(500)
  note!: string;

  @ApiProperty({ example: '2026-08-20T09:00:00.000Z' })
  @IsDateString()
  dueAt!: string;

  @ApiPropertyOptional({ description: 'Defaults to whoever scheduled it' })
  @IsOptional()
  @IsString()
  assigneeId?: string;
}

export class TagContactDto {
  @ApiProperty({ example: 'bridal' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  name!: string;
}

export class CreateLeadDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'Enter your name.' })
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;

  @ApiPropertyOptional({ description: 'whatsapp, instagram, phone, walk_in…' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  source?: string;
}

export class UpdateLeadDto {
  @ApiPropertyOptional({ enum: LEAD_STATUSES })
  @IsOptional()
  @IsIn([...LEAD_STATUSES])
  status?: (typeof LEAD_STATUSES)[number];

  @ApiPropertyOptional({ description: 'Estimated value in paisa' })
  @IsOptional()
  @IsInt()
  @Min(0)
  quotedValue?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  lostReason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ownerId?: string;
}
