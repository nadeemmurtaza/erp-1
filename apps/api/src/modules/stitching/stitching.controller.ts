import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../core/auth/decorators';
import { StitchingService } from './stitching.service';

@ApiTags('stitching')
@Controller('stitching')
export class StitchingController {
  constructor(private readonly stitching: StitchingService) {}

  @Public()
  @Get('option-groups')
  @ApiOperation({
    summary: 'Style options for a garment, with their price deltas',
  })
  optionGroups(@Query('garmentType') garmentType?: string) {
    return this.stitching.listOptionGroups(garmentType);
  }
}
