import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsISO8601, IsNotEmpty, IsNumberString, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

const OPS = ['UPSERT', 'DELETE'] as const;

export class PushRecordDto {
  /** BigInt over the wire is a numeric string — parsed back with BigInt() server-side. */
  @ApiProperty({ description: 'The sending node\'s own sequence for this record, as a string.' })
  @IsNumberString()
  sequence!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  entity!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  entityId!: string;

  @ApiProperty({ enum: OPS })
  @IsIn(OPS)
  op!: (typeof OPS)[number];

  @ApiProperty({ description: 'Opaque to the transport — the registered applier decides what it means.' })
  payload!: unknown;

  @ApiProperty()
  @IsInt()
  @Min(1)
  schemaVersion!: number;

  @ApiProperty()
  @IsISO8601()
  occurredAt!: string;
}

export class PushReplicationDto {
  @ApiProperty({ type: [PushRecordDto] })
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => PushRecordDto)
  records!: PushRecordDto[];
}
