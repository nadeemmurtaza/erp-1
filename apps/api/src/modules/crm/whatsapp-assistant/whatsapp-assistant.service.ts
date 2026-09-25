import { createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { normalizePhone } from '@newax/shared';
import { AppConfigService } from '../../../core/config/app-config.service';
import { AiService } from '../../../core/ai/ai.service';
import { WhatsAppChannel } from '../../../core/notifications/whatsapp.channel';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { paginated, type PaginatedResult } from '../../../core/common/dto/pagination.dto';
import { AiFeature, type Prisma } from '../../../core/prisma/client';
import { CrmService } from '../crm.service';
import { whatsAppAssistantCopy } from './whatsapp-copy';

/** Flat, gateway-agnostic shape — see whatsapp.channel.ts's own header comment on why this codebase does not guess a specific vendor's real webhook envelope. Whichever gateway a deployment picks maps its own payload into this before calling handleInbound(). */
export interface InboundWhatsAppMessage {
  from: string;
  body: string;
  /** The gateway's own id for this message, for idempotency. Optional only because a hand-tested gateway may not always send one; when absent, redelivery protection is best-effort. */
  externalMessageId?: string;
}

const conversationInclude = {
  contact: { select: { id: true, name: true, phoneE164: true } },
  _count: { select: { messages: true } },
} satisfies Prisma.WhatsAppConversationInclude;

const conversationDetailInclude = {
  contact: { select: { id: true, name: true, phoneE164: true } },
  messages: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.WhatsAppConversationInclude;

/** Deterministic, cheap backstop — checked before any AI call, and enforced regardless of what the model itself decides. Covers both non-negotiables the doc lists explicitly (complaint/refund/payment/asks for a person) and the ones the assistant must never itself commit to (a cancellation, a discount). English and Urdu (Roman and script) since customers write in both. */
const HANDOFF_TRIGGERS = [
  'refund',
  'complaint',
  'shikayat',
  'شکایت',
  'واپس',
  'human',
  'agent',
  'representative',
  'talk to someone',
  'talk to a person',
  'real person',
  'cancel my order',
  'cancel order',
  'order cancel',
  'discount',
  'compensation',
  'payment problem',
  'paisay wapis',
  'paise wapas',
];

/** What the model is asked to return — never trusted at face value; parseAssistantReply() re-validates every field. */
interface AssistantReply {
  reply: string;
  handoff: boolean;
  handoffReason: string | null;
}

const SYSTEM_PROMPT = [
  'You are a WhatsApp customer-support assistant for a Pakistani apparel retailer, replying to one already-identified customer.',
  'Reply in the same language (English or Urdu) the customer wrote in, in one short message.',
  'Use ONLY the customer data given to you below. Never invent an order, a status, a date, a tracking number, or a policy detail that is not in the data.',
  'Never promise a delivery date that is not already recorded in the data.',
  'Never offer, apply, mention, or promise a discount, a refund, or a cancellation — those require a person. If asked for any of these, set handoff to true.',
  'If the message is a complaint, mentions a refund amount, a payment problem, or asks for a person, set handoff to true and leave reply empty.',
  "If the customer asks about an order that is not in the data given, say you cannot find an order under that number for this account — never guess, and never say it belongs to someone else.",
  'If you cannot confidently answer from the data given, set handoff to true rather than guessing.',
  'Reply with a single JSON object of exactly this shape and nothing else — no markdown, no prose outside the JSON: {"reply": string, "handoff": boolean, "handoffReason": string | null}',
].join('\n');

interface GroundingOrder {
  number: string;
  status: string;
  placedAt: string;
  deliveredAt: string | null;
  items: string[];
  eligibleForReturn: boolean;
  returnUrl: string | null;
  shipment: { courier: string; status: string; trackingNumber: string | null; trackingUrl: string | null } | null;
}

/**
 * WO-9.7 (09-ai-layer.md) — grounded strictly in the sender's own data,
 * retrieved by their WhatsApp-verified phone number. Two rules the doc
 * states as non-negotiable and this class enforces structurally, not just
 * by prompting the model:
 *
 * 1. "Verify identity before revealing anything" — grounding data is always
 *    queried `where: { contactId }` for the ONE contact this phone number
 *    resolved to. No other customer's row is ever fetched, so the model has
 *    no way to leak one even if asked.
 * 2. "Never let it commit the shop" — HANDOFF_TRIGGERS is a deterministic
 *    keyword backstop checked before any AI call, independent of whatever
 *    the model itself decides; a discount, cancellation or refund request
 *    is handed off regardless of what the assistant would have said.
 */
@Injectable()
export class WhatsAppAssistantService {
  private readonly logger = new Logger(WhatsAppAssistantService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly crm: CrmService,
    private readonly ai: AiService,
    private readonly whatsapp: WhatsAppChannel,
  ) {}

  /** HMAC-SHA256 over `${timestamp}.${rawBody}`, hex — same idiom as identity-verification/providers/nid.provider.ts's own verifySignature, since this codebase does not assume a specific gateway's own scheme. Whichever gateway a deployment picks must be configured to sign this way, or a small adapter in front of this webhook translates its scheme into this one. */
  verifyWebhookSignature(rawBody: string, timestamp: string | undefined, signatureHex: string | undefined): boolean {
    const secret = this.config.get('WHATSAPP_WEBHOOK_SECRET');
    if (!secret) {
      this.logger.error('WhatsApp webhook rejected: WHATSAPP_WEBHOOK_SECRET is not configured.');
      return false;
    }
    if (!timestamp || !signatureHex) {
      this.logger.error('WhatsApp webhook rejected: missing timestamp or signature header.');
      return false;
    }

    const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(signatureHex, 'hex');
    const verified = a.length === b.length && timingSafeEqual(a, b);
    if (!verified) this.logger.error('WhatsApp webhook rejected: signature did not verify.');
    return verified;
  }

  /**
   * The one entry point the webhook controller calls once a signature is
   * verified. Never throws — a webhook must always be ack'd, and any failure
   * here is this shop's own problem to fix, never the sender's to see.
   */
  async handleInbound(message: InboundWhatsAppMessage): Promise<void> {
    try {
      await this.process(message);
    } catch (error) {
      this.logger.error(
        `WhatsApp inbound handling failed for ${message.from}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async process(message: InboundWhatsAppMessage): Promise<void> {
    const phone = normalizePhone(message.from).e164;
    if (!phone) {
      this.logger.warn(`WhatsApp message from unparseable number "${message.from}" dropped.`);
      return;
    }

    const contact = await this.crm.findContactByPhone(phone);
    if (!contact) {
      await this.whatsapp.send({
        template: 'whatsapp.assistant_unrecognised',
        recipient: { phone },
        subject: 'WhatsApp',
        body: whatsAppAssistantCopy(message.body).unrecognisedNumber,
      });
      return;
    }

    if (message.externalMessageId) {
      const existing = await this.prisma.whatsAppMessage.findUnique({
        where: { externalMessageId: message.externalMessageId },
      });
      if (existing) return; // Redelivered webhook — already logged, never a duplicate reply.
    }

    const conversation = await this.findOrCreateConversation(contact.id, phone);

    await this.prisma.$transaction([
      this.prisma.whatsAppMessage.create({
        data: {
          conversationId: conversation.id,
          direction: 'INBOUND',
          body: message.body,
          externalMessageId: message.externalMessageId ?? null,
        },
      }),
      this.prisma.whatsAppConversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: new Date() },
      }),
    ]);

    if (conversation.handedOffToHuman) {
      this.logger.log(`WhatsApp message from ${phone} logged — already handed off, no auto-reply.`);
      return;
    }

    if (containsHandoffTrigger(message.body)) {
      await this.handOff(conversation.id, 'Message concerns a complaint, refund, payment, cancellation, or asked for a person.');
      await this.reply(phone, conversation.id, whatsAppAssistantCopy(message.body).handoff, false);
      return;
    }

    if (!this.ai.isAvailable('complete')) {
      await this.handOff(conversation.id, 'No AI provider is configured.');
      await this.reply(phone, conversation.id, whatsAppAssistantCopy(message.body).handoff, false);
      return;
    }

    const grounding = await this.buildGroundingContext(contact.id);
    const result = await this.ai.complete(AiFeature.WHATSAPP_ASSISTANT, {
      system: SYSTEM_PROMPT,
      prompt: buildPrompt(grounding, message.body),
      jsonMode: true,
      maxTokens: 500,
      temperature: 0.2,
    });

    if (!result) {
      await this.handOff(conversation.id, 'The AI assistant call failed or the monthly budget is spent.');
      await this.reply(phone, conversation.id, whatsAppAssistantCopy(message.body).handoff, false);
      return;
    }

    const parsed = parseAssistantReply(result.text);
    if (!parsed || parsed.handoff || !parsed.reply.trim()) {
      await this.handOff(conversation.id, parsed?.handoffReason ?? 'The assistant could not answer safely.');
      await this.reply(phone, conversation.id, whatsAppAssistantCopy(message.body).handoff, false);
      return;
    }

    await this.reply(phone, conversation.id, parsed.reply.trim(), true);
  }

  private async findOrCreateConversation(contactId: string, phone: string) {
    const existing = await this.prisma.whatsAppConversation.findFirst({
      where: { contactId },
      orderBy: { startedAt: 'desc' },
    });
    if (existing) return existing;
    return this.prisma.whatsAppConversation.create({ data: { contactId, phoneE164: phone } });
  }

  private async handOff(conversationId: string, reason: string): Promise<void> {
    await this.prisma.whatsAppConversation.update({
      where: { id: conversationId },
      data: { handedOffToHuman: true, handoffReason: reason, handedOffAt: new Date() },
    });
  }

  private async reply(phone: string, conversationId: string, body: string, aiGenerated: boolean): Promise<void> {
    await this.prisma.whatsAppMessage.create({
      data: { conversationId, direction: 'OUTBOUND', body, aiGenerated },
    });
    await this.whatsapp.send({
      template: aiGenerated ? 'whatsapp.assistant_reply' : 'whatsapp.assistant_handoff',
      recipient: { phone },
      subject: 'WhatsApp',
      body,
    });
  }

  /** Scoped to this one contact — see this class's own doc comment on why that alone is what makes "never disclose another customer's data" hold structurally. */
  private async buildGroundingContext(contactId: string): Promise<GroundingOrder[]> {
    const orders = await this.prisma.order.findMany({
      where: { contactId },
      orderBy: { placedAt: 'desc' },
      take: 5,
      select: {
        number: true,
        status: true,
        placedAt: true,
        deliveredAt: true,
        items: { select: { nameEn: true, quantity: true } },
        shipments: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { courier: true, status: true, trackingNumber: true, trackingUrl: true },
        },
      },
    });

    return orders.map((order) => ({
      number: order.number,
      status: order.status,
      placedAt: order.placedAt.toISOString(),
      deliveredAt: order.deliveredAt?.toISOString() ?? null,
      items: order.items.map((item) => `${item.nameEn} x${item.quantity}`),
      eligibleForReturn: order.status === 'DELIVERED',
      returnUrl: order.status === 'DELIVERED' ? this.returnUrl(order.number) : null,
      shipment: order.shipments[0]
        ? {
            courier: order.shipments[0].courier,
            status: order.shipments[0].status,
            trackingNumber: order.shipments[0].trackingNumber,
            trackingUrl: order.shipments[0].trackingUrl,
          }
        : null,
    }));
  }

  private returnUrl(orderNumber: string): string {
    const base = this.config.get('STOREFRONT_URL').replace(/\/+$/, '');
    return `${base}/account/returns/new?number=${encodeURIComponent(orderNumber)}`;
  }

  // --- Admin (Support Inbox — WhatsApp channel) -------------------------------

  async listConversations(query: {
    page: number;
    pageSize: number;
    skip: number;
    take: number;
    handedOff?: boolean;
  }): Promise<PaginatedResult<unknown>> {
    const where: Prisma.WhatsAppConversationWhereInput =
      query.handedOff === undefined ? {} : { handedOffToHuman: query.handedOff };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.whatsAppConversation.findMany({
        where,
        include: conversationInclude,
        orderBy: { lastMessageAt: 'desc' },
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.whatsAppConversation.count({ where }),
    ]);

    return paginated(rows, total, query);
  }

  async getConversation(id: string) {
    const conversation = await this.prisma.whatsAppConversation.findUnique({
      where: { id },
      include: conversationDetailInclude,
    });
    if (!conversation) throw new NotFoundException('That conversation no longer exists.');
    return conversation;
  }

  /** A staff reply always hands the conversation off (if it wasn't already) — once a person has typed into it, the assistant must not resume replying on top of them without a deliberate reopen(). */
  async staffReply(id: string, text: string) {
    const conversation = await this.getConversation(id);

    await this.prisma.$transaction([
      this.prisma.whatsAppMessage.create({
        data: { conversationId: id, direction: 'OUTBOUND', body: text, aiGenerated: false },
      }),
      this.prisma.whatsAppConversation.update({
        where: { id },
        data: {
          lastMessageAt: new Date(),
          handedOffToHuman: true,
          handoffReason: conversation.handoffReason ?? 'A staff member replied directly.',
          handedOffAt: conversation.handedOffAt ?? new Date(),
        },
      }),
    ]);

    await this.whatsapp.send({
      template: 'whatsapp.staff_reply',
      recipient: { phone: conversation.phoneE164 },
      subject: 'WhatsApp',
      body: text,
    });

    return this.getConversation(id);
  }

  /** Lets the assistant resume answering a conversation a person has finished handling. */
  async reopen(id: string) {
    await this.getConversation(id);
    await this.prisma.whatsAppConversation.update({
      where: { id },
      data: { handedOffToHuman: false, handoffReason: null, handedOffAt: null },
    });
    return this.getConversation(id);
  }
}

function containsHandoffTrigger(body: string): boolean {
  const lower = body.toLowerCase();
  return HANDOFF_TRIGGERS.some((trigger) => lower.includes(trigger.toLowerCase()));
}

function buildPrompt(orders: GroundingOrder[], customerMessage: string): string {
  return [
    'This customer\'s own orders (most recent first), as JSON — this is the only order data you may reference:',
    JSON.stringify(orders),
    '',
    "The customer's message:",
    customerMessage,
  ].join('\n');
}

/** Never trusts the model's JSON at face value — a shape that doesn't match exactly is treated the same as a failed call: handoff. */
function parseAssistantReply(text: string): AssistantReply | null {
  const candidate = extractJsonObject(text);
  if (!candidate) return null;

  try {
    const value = JSON.parse(candidate) as unknown;
    if (
      typeof value === 'object' &&
      value !== null &&
      'reply' in value &&
      'handoff' in value &&
      typeof (value as { reply: unknown }).reply === 'string' &&
      typeof (value as { handoff: unknown }).handoff === 'boolean'
    ) {
      const handoffReason = (value as { handoffReason?: unknown }).handoffReason;
      return {
        reply: (value as { reply: string }).reply,
        handoff: (value as { handoff: boolean }).handoff,
        handoffReason: typeof handoffReason === 'string' ? handoffReason : null,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/** Claude has no JSON-only mode (only OpenAI's jsonMode is enforced provider-side — see ai-provider.ts), so a reply may still arrive wrapped in prose; this pulls out the first balanced {...} rather than assuming the whole text is JSON. */
function extractJsonObject(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed;
  const match = /\{[\s\S]*\}/.exec(trimmed);
  return match ? match[0] : null;
}
