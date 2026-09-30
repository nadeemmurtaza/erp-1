import { ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, IsUrl, Max, MaxLength, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../../core/common/dto/pagination.dto';

const REVIEW_STATUSES = ['PENDING', 'PUBLISHED', 'REJECTED'] as const;
const FIT_FEEDBACK = ['too_small', 'true_to_size', 'too_large'] as const;

export class CreateReviewDto {
  @ApiPropertyOptional()
  @IsString()
  productId!: string;

  @ApiPropertyOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  body?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsUrl({}, { each: true })
  photoUrls?: string[];

  @ApiPropertyOptional({ enum: FIT_FEEDBACK })
  @IsOptional()
  @IsIn(FIT_FEEDBACK)
  fitFeedback?: (typeof FIT_FEEDBACK)[number];
}

export class ModerateReviewDto {
  @ApiPropertyOptional({ enum: ['PUBLISHED', 'REJECTED'] })
  @IsIn(['PUBLISHED', 'REJECTED'])
  status!: 'PUBLISHED' | 'REJECTED';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  staffReply?: string;
}

export class ReviewQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: REVIEW_STATUSES })
  @IsOptional()
  @IsIn(REVIEW_STATUSES)
  status?: (typeof REVIEW_STATUSES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  productId?: string;
}
