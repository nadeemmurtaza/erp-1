import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../auth/auth.constants';
import { CurrentUser, RequirePermission } from '../../auth/decorators';
import {
  CreateEmailAccountDto,
  TestImapDto,
  TestSmtpDto,
  UpdateEmailAccountDto,
} from './email-accounts.dto';
import { EmailAccountsService } from './email-accounts.service';

/**
 * Connected mailboxes for outgoing (and, once something reads a mailbox,
 * incoming) mail — see EmailAccountsService for the routing rules and the
 * honesty note on what IMAP does today.
 *
 * Gated on settings.manage, same as the rest of the admin Settings screen:
 * these are live SMTP/IMAP credentials, not a toggle.
 */
@ApiTags('admin/email-accounts')
@Controller('admin/email-accounts')
@RequirePermission('settings.manage')
export class EmailAccountsAdminController {
  constructor(private readonly accounts: EmailAccountsService) {}

  @Get()
  @ApiOperation({ summary: 'List connected mailboxes' })
  list() {
    return this.accounts.list();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one connected mailbox' })
  get(@Param('id') id: string) {
    return this.accounts.get(id);
  }

  @Post()
  @ApiOperation({ summary: 'Connect a mailbox' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateEmailAccountDto) {
    return this.accounts.create(user.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a connected mailbox' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateEmailAccountDto,
  ) {
    return this.accounts.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Disconnect a mailbox' })
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    await this.accounts.remove(user.id, id);
  }

  @Post('test-smtp')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Test SMTP details before saving them' })
  async testSmtpDraft(@Body() dto: TestSmtpDto): Promise<void> {
    await this.accounts.testSmtp(dto);
  }

  @Post('test-imap')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Test IMAP details before saving them' })
  async testImapDraft(@Body() dto: TestImapDto): Promise<void> {
    await this.accounts.testImap(dto);
  }

  @Post(':id/test-smtp')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Re-test a saved mailbox\'s SMTP connection' })
  async testSavedSmtp(@Param('id') id: string): Promise<void> {
    await this.accounts.testSavedSmtp(id);
  }

  @Post(':id/test-imap')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Re-test a saved mailbox\'s IMAP connection' })
  async testSavedImap(@Param('id') id: string): Promise<void> {
    await this.accounts.testSavedImap(id);
  }
}
