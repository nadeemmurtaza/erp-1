import { Module } from '@nestjs/common';
import { ReturnsController } from './returns.controller';
import { ReturnsAccountController } from './returns-account.controller';
import { ReturnsService } from './returns.service';

@Module({
  controllers: [ReturnsController, ReturnsAccountController],
  providers: [ReturnsService],
  exports: [ReturnsService],
})
export class ReturnsModule {}
