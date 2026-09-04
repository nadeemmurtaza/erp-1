import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../core/common/dto/pagination.dto';

export class EmailInboxQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'true = only messages not yet linked to a contact' })
  @IsOptional()
  // A query string arrives as "true"/"false", and class-transformer's default
  // Boolean() coercion treats "false" as truthy — hence the explicit mapping.
  @Transform(({ value }) => (value === undefined ? undefined : value === true || value === 'true'))
  @IsBoolean()
  linked?: boolean;
}

export class LinkInboundEmailDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'Pick a contact to link this message to.' })
  contactId!: string;
}
