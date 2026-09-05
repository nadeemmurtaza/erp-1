import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators';
import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../prisma/prisma.service';
import { isValidUnsubscribeToken } from '../security/unsubscribe-token';
import { UnsubscribeDto } from './unsubscribe.dto';

/**
 * The link every automated marketing send carries (see
 * MarketingAutomationCron, modules/marketing). No login required — that is
 * the whole point of a one-click unsubscribe — so the token is what proves
 * the request is genuine, not a session.
 */
@ApiTags('email')
@Controller('email')
export class UnsubscribeController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  @Public()
  @Post('unsubscribe')
  @ApiOperation({ summary: 'Opt a customer out of automated marketing email' })
  async unsubscribe(@Body() dto: UnsubscribeDto): Promise<void> {
    const key = this.config.get('APP_ENCRYPTION_KEY');
    if (!isValidUnsubscribeToken(dto.userId, dto.token, key)) {
      throw new BadRequestException('This unsubscribe link is invalid.');
    }

    // updateMany, not update: a link for an account that no longer exists
    // should still report success rather than 404 — there is nothing left
    // to unsubscribe, which is the same end state the customer wants.
    await this.prisma.user.updateMany({
      where: { id: dto.userId },
      data: { marketingEmailOptOut: true },
    });
  }
}
