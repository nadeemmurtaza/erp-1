import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import type { TicketPriority, TicketStatus } from '../../../core/prisma/client';

const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
const STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const;

export class CreateTicketDto {
  @IsString()
  @IsNotEmpty()
  subject!: string;

  @IsString()
  @IsNotEmpty()
  category!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(PRIORITIES)
  priority?: TicketPriority;
}

export class ReplyTicketDto {
  @IsString()
  @IsNotEmpty()
  body!: string;
}

export class AssignTicketDto {
  @IsString()
  @IsNotEmpty()
  assigneeUserId!: string;
}

export class TransitionTicketDto {
  @IsIn(STATUSES)
  status!: TicketStatus;
}
