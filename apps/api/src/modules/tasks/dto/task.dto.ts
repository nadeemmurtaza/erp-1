import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateTaskDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  detail?: string;

  @IsString()
  @IsNotEmpty()
  positionId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  priority?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueAt?: string;
}

export class AssignTaskDto {
  @ApiPropertyOptional({ description: 'Null clears the assignment — unclaimed at the post.' })
  @IsOptional()
  @IsString()
  assigneeUserId?: string | null;
}

export class TransitionTaskDto {
  @IsIn(['OPEN', 'IN_PROGRESS', 'BLOCKED'])
  to!: 'OPEN' | 'IN_PROGRESS' | 'BLOCKED';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  stageId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

export class CloseTaskDto {
  @IsIn(['DONE', 'CANCELLED'])
  to!: 'DONE' | 'CANCELLED';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

export class CreateTaskStageDto {
  @IsString()
  @IsNotEmpty()
  key!: string;

  @IsString()
  @IsNotEmpty()
  label!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  order?: number;
}

export class ReorderTaskStageDto {
  @IsInt()
  order!: number;
}
