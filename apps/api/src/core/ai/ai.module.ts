import { Global, Module } from '@nestjs/common';
import { AnthropicProvider } from './providers/anthropic.provider';
import { OpenAiProvider } from './providers/openai.provider';
import { AiService } from './ai.service';

/** Global, same as StorageModule/NotificationsModule — a feature module injects AiService with no import needed. */
@Global()
@Module({
  providers: [AnthropicProvider, OpenAiProvider, AiService],
  exports: [AiService],
})
export class AiModule {}
