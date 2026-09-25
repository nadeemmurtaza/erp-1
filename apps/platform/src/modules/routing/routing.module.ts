import { Module } from '@nestjs/common';
import { RoutingController } from './routing.controller';
import { HostnameResolverService } from './hostname-resolver.service';

@Module({
  controllers: [RoutingController],
  providers: [HostnameResolverService],
  exports: [HostnameResolverService],
})
export class RoutingModule {}
