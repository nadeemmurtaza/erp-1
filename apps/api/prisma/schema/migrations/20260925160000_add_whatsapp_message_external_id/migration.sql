-- WO-9.7 (docs/implementation/ai-layer/09-ai-layer.md) — the WhatsApp gateway's
-- own message id for an INBOUND message, so a redelivered webhook is a no-op
-- instead of a duplicate log entry (same idiom as InboundEmail's own
-- (emailAccountId, messageId) unique key).
ALTER TABLE "WhatsAppMessage" ADD COLUMN "externalMessageId" TEXT;

CREATE UNIQUE INDEX "WhatsAppMessage_externalMessageId_key" ON "WhatsAppMessage"("externalMessageId");
