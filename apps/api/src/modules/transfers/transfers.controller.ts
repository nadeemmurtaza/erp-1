import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermission } from '../../core/auth/decorators';
import type { AuthenticatedUser } from '../../core/auth/auth.constants';
import { TransfersService } from './transfers.service';
import { CancelTransferDto, DispatchTransferDto, ReceiveTransferDto, TransferQueryDto } from './dto/transfer.dto';

@ApiTags('admin/transfers')
@Controller('admin/transfers')
@RequirePermission('transfers.manage')
export class TransfersController {
  constructor(private readonly transfers: TransfersService) {}

  @Get()
  @ApiOperation({ summary: 'Transfers, filterable by status' })
  list(@Query() query: TransferQueryDto) {
    return this.transfers.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One transfer with its lines' })
  get(@Param('id') id: string) {
    return this.transfers.get(id);
  }

  @Post()
  @ApiOperation({ summary: 'Dispatch a transfer — moves stock out of source into its own in-transit location' })
  dispatch(@CurrentUser() user: AuthenticatedUser, @Body() dto: DispatchTransferDto) {
    return this.transfers.dispatch(user.id, dto.sourceLocationId, dto.destinationLocationId, dto.lines, dto.note);
  }

  @Post(':id/receive')
  @ApiOperation({ summary: 'Receive a transfer — moves stock from in-transit into the destination; a short receipt writes off the difference' })
  receive(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: ReceiveTransferDto) {
    return this.transfers.receive(user.id, id, dto.lines ?? []);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel a transfer still in transit — returns its stock to the source' })
  cancel(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: CancelTransferDto) {
    return this.transfers.cancel(user.id, id, dto.note);
  }
}
