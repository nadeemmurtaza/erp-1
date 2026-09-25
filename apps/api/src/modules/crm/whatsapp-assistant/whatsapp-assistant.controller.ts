import { BadRequestException, Body, Controller, Get, Param, Post, Query, Req, UnauthorizedException } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public, RequirePermission } from '../../../core/auth/decorators';
import { WhatsAppAssistantService } from './whatsapp-assistant.service';
import { ReplyToWhatsAppConversationDto, WhatsAppConversationQueryDto } from './whatsapp-assistant.dto';

interface InboundWebhookPayload {
  from?: string;
  body?: string;
  messageId?: string;
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

@ApiTags('whatsapp')
@Controller('whatsapp')
export class WhatsAppWebhookController {
  constructor(private readonly assistant: WhatsAppAssistantService) {}

  /**
   * The configured gateway posts here on every inbound message. Public
   * because the gateway calls it, not a logged-in user — authenticity comes
   * from the signature the service verifies over the raw bytes (main.ts's
   * `rawBody: true`), never from a session. Same shape as
   * identity-verification.controller.ts's own webhook() for the same reason.
   */
  @Public()
  @Post('webhook')
  @ApiOperation({ summary: 'Inbound WhatsApp message (signature-verified, not session-authenticated)' })
  async webhook(@Req() req: RawBodyRequest<Request>): Promise<{ ok: true }> {
    const rawBody = req.rawBody?.toString('utf8') ?? '';
    const verified = this.assistant.verifyWebhookSignature(
      rawBody,
      headerValue(req.headers['x-webhook-timestamp']),
      headerValue(req.headers['x-webhook-signature']),
    );
    if (!verified) throw new UnauthorizedException('Signature did not verify.');

    let payload: InboundWebhookPayload;
    try {
      payload = JSON.parse(rawBody) as InboundWebhookPayload;
    } catch {
      throw new BadRequestException('Body was not valid JSON.');
    }
    if (!payload.from || !payload.body) {
      throw new BadRequestException('"from" and "body" are required.');
    }

    // Never awaited into a thrown error from here on — handleInbound() never
    // throws (see its own doc comment), so the gateway always gets a clean
    // 200 for anything it authenticated and shaped correctly.
    await this.assistant.handleInbound({
      from: payload.from,
      body: payload.body,
      externalMessageId: payload.messageId,
    });

    return { ok: true };
  }
}

/**
 * The WhatsApp side of the Support Inbox (email-inbox.admin.controller.ts's
 * sibling) — lives under crm.manage for the same reason: this is customer
 * correspondence, not gateway configuration.
 */
@ApiTags('admin/crm')
@Controller('admin/crm/whatsapp')
@RequirePermission('crm.manage')
export class WhatsAppAssistantAdminController {
  constructor(private readonly assistant: WhatsAppAssistantService) {}

  @Get('conversations')
  @ApiOperation({ summary: 'WhatsApp conversations, most recently active first' })
  list(@Query() query: WhatsAppConversationQueryDto) {
    return this.assistant.listConversations({
      page: query.page,
      pageSize: query.pageSize,
      skip: query.skip,
      take: query.take,
      handedOff: query.handedOff,
    });
  }

  @Get('conversations/:id')
  get(@Param('id') id: string) {
    return this.assistant.getConversation(id);
  }

  @Post('conversations/:id/reply')
  @ApiOperation({ summary: 'Staff reply — hands the conversation off if it was not already' })
  reply(@Param('id') id: string, @Body() dto: ReplyToWhatsAppConversationDto) {
    return this.assistant.staffReply(id, dto.text);
  }

  @Post('conversations/:id/reopen')
  @ApiOperation({ summary: 'Let the assistant resume answering this conversation' })
  reopen(@Param('id') id: string) {
    return this.assistant.reopen(id);
  }
}
