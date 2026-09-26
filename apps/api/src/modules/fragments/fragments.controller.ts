import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedOnly, CurrentUser, RequirePermission } from '../../core/auth/decorators';
import type { AuthenticatedUser } from '../../core/auth/auth.constants';
import { FragmentsService } from './fragments.service';
import { RegisterFragmentDto, UpdateFragmentDto } from './dto/fragment.dto';

/**
 * architecture-patterns/143-micro-frontend-architecture.md (WO-143.2/143.3).
 * Registering, editing or suspending a fragment is a settings-level trust
 * decision (`settings.fragments.manage`) — introducing third-party runtime
 * code into the admin shell. Viewing the fragments already registered for a
 * mount point, and minting the short-lived token to load one, is scoped to
 * the caller's own identity and the one mount point requested; the
 * embedding screen itself is where real access control for "should this
 * user see this screen at all" already lives.
 */
@ApiTags('admin/fragments')
@Controller('admin/fragments')
export class FragmentsController {
  constructor(private readonly fragments: FragmentsService) {}

  @Get()
  @RequirePermission('settings.fragments.manage')
  @ApiOperation({ summary: 'Every registered fragment, active or suspended — for the management screen' })
  list() {
    return this.fragments.listFragments(false);
  }

  @Get('for-mount-point')
  @AuthenticatedOnly()
  @ApiOperation({ summary: 'Every active fragment registered for one named mount point' })
  listForMountPoint(@Query('mountPoint') mountPoint: string) {
    return this.fragments.listForMountPoint(mountPoint);
  }

  @Post()
  @RequirePermission('settings.fragments.manage')
  @ApiOperation({ summary: 'Register a new micro-frontend fragment, with the required design-law attestation' })
  register(@Body() dto: RegisterFragmentDto, @CurrentUser() user: AuthenticatedUser) {
    return this.fragments.registerFragment(dto, user.id);
  }

  @Patch(':id')
  @RequirePermission('settings.fragments.manage')
  @ApiOperation({ summary: 'Edit a fragment’s label, remote URL, mount points or status' })
  update(@Param('id') id: string, @Body() dto: UpdateFragmentDto, @CurrentUser() user: AuthenticatedUser) {
    return this.fragments.updateFragment(id, dto, user.id);
  }

  @Post(':id/suspend')
  @RequirePermission('settings.fragments.manage')
  @ApiOperation({ summary: 'The kill switch — stop serving a fragment with no deploy' })
  suspend(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.fragments.suspendFragment(id, user.id);
  }

  @Post(':id/activate')
  @RequirePermission('settings.fragments.manage')
  @ApiOperation({ summary: 'Resume serving a previously suspended fragment' })
  activate(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.fragments.activateFragment(id, user.id);
  }

  @Post(':key/token')
  @AuthenticatedOnly()
  @ApiOperation({ summary: 'A short-lived token scoped to one fragment and one mount point — never a raw session credential' })
  issueToken(@Param('key') key: string, @Query('mountPoint') mountPoint: string, @CurrentUser() user: AuthenticatedUser) {
    return this.fragments.issueFragmentToken(user, key, mountPoint);
  }
}
