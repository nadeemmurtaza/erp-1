import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { WhatsAppWebhookController } from './whatsapp-assistant.controller';
import type { WhatsAppAssistantService } from './whatsapp-assistant.service';

/**
 * The webhook is public and unauthenticated by session (identical reasoning
 * to identity-verification.controller.ts's own webhook()) — everything here
 * checks that a request only reaches handleInbound() once the service has
 * proven it is genuinely signed, and that a malformed-but-signed body is
 * rejected before it ever reaches the assistant.
 */
describe('WhatsAppWebhookController', () => {
  function makeController(assistant: Partial<WhatsAppAssistantService>) {
    return new WhatsAppWebhookController(assistant as WhatsAppAssistantService);
  }

  function reqWith(rawBody: string, headers: Record<string, string> = {}) {
    return { rawBody: Buffer.from(rawBody), headers } as any;
  }

  it('rejects a request whose signature does not verify', async () => {
    const assistant = { verifyWebhookSignature: jest.fn().mockReturnValue(false), handleInbound: jest.fn() };
    const controller = makeController(assistant);

    await expect(controller.webhook(reqWith('{"from":"+923001234567","body":"hi"}'))).rejects.toThrow(
      UnauthorizedException,
    );
    expect(assistant.handleInbound).not.toHaveBeenCalled();
  });

  it('rejects a verified request whose body is not valid JSON', async () => {
    const assistant = { verifyWebhookSignature: jest.fn().mockReturnValue(true), handleInbound: jest.fn() };
    const controller = makeController(assistant);

    await expect(controller.webhook(reqWith('not json'))).rejects.toThrow(BadRequestException);
    expect(assistant.handleInbound).not.toHaveBeenCalled();
  });

  it('rejects a verified, valid-JSON request missing "from" or "body"', async () => {
    const assistant = { verifyWebhookSignature: jest.fn().mockReturnValue(true), handleInbound: jest.fn() };
    const controller = makeController(assistant);

    await expect(controller.webhook(reqWith('{"body":"hi"}'))).rejects.toThrow(BadRequestException);
    await expect(controller.webhook(reqWith('{"from":"+923001234567"}'))).rejects.toThrow(BadRequestException);
    expect(assistant.handleInbound).not.toHaveBeenCalled();
  });

  it('forwards a verified, well-formed message and acknowledges the webhook', async () => {
    const assistant = { verifyWebhookSignature: jest.fn().mockReturnValue(true), handleInbound: jest.fn().mockResolvedValue(undefined) };
    const controller = makeController(assistant);

    const result = await controller.webhook(
      reqWith('{"from":"+923001234567","body":"Where is my order?","messageId":"wamid.1"}'),
    );

    expect(assistant.handleInbound).toHaveBeenCalledWith({
      from: '+923001234567',
      body: 'Where is my order?',
      externalMessageId: 'wamid.1',
    });
    expect(result).toEqual({ ok: true });
  });
});
