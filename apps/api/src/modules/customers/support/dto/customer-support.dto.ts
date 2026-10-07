import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import type { CustomerTicketStatus, TicketPriority } from '../../../../core/prisma/client';

const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
const CUSTOMER_STATUSES = ['OPEN', 'AWAITING_CUSTOMER', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const;

export class RaiseCustomerTicketDto {
  @IsString()
  @IsNotEmpty()
  subject!: string;

  @IsString()
  @IsNotEmpty()
  category!: string;

  @IsString()
  @IsNotEmpty()
  body!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  orderId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(PRIORITIES)
  priority?: TicketPriority;
}

export class ReplyCustomerTicketDto {
  @IsString()
  @IsNotEmpty()
  body!: string;
}

export class AssignCustomerTicketDto {
  @IsString()
  @IsNotEmpty()
  assigneeUserId!: string;
}

export class TransitionCustomerTicketDto {
  @IsIn(CUSTOMER_STATUSES)
  status!: CustomerTicketStatus;
}
