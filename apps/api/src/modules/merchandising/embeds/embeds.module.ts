import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { EmbedWidgetsController } from './embed-widgets.controller';
import { EmbedWidgetsService } from './embed-widgets.service';

/**
 * architecture-patterns/113-micro-frontend-embedding.md — a narrow iframe
 * embed pattern. Always on, like `settings`/`custom-fields`: infrastructure,
 * not a sector-specific pack.
 */
@Module({
  imports: [JwtModule.register({})],
  controllers: [EmbedWidgetsController],
  providers: [EmbedWidgetsService],
  exports: [EmbedWidgetsService],
})
export class EmbedsModule {}
