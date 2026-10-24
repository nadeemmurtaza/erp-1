import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../../core/common/dto/pagination.dto';

export class WhatsAppConversationQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'true = only conversations waiting on a person' })
  @IsOptional()
  // Same explicit mapping as EmailInboxQueryDto.linked — a query string
  // arrives as "true"/"false", and class-transformer's default Boolean()
  // coercion treats "false" as truthy.
  @Transform(({ value }) => (value === undefined ? undefined : value === true || value === 'true'))
  @IsBoolean()
  handedOff?: boolean;
}

export class ReplyToWhatsAppConversationDto {
  @ApiPropertyOptional({ description: 'Plain text, sent over the WhatsApp channel as-is.' })
  @IsString()
  @IsNotEmpty({ message: 'Write a reply before sending.' })
  @MaxLength(4096)
  text!: string;
}
