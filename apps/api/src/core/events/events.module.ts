import { Global, Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { EventBusService } from './event-bus.service';
import { OutboxDispatcher } from './outbox.dispatcher';

@Global()
@Module({
  imports: [
    EventEmitterModule.forRoot({
      // A missing subscriber is normal — most events have none at first.
      ignoreErrors: false,
      maxListeners: 50,
    }),
  ],
  providers: [EventBusService, OutboxDispatcher],
  exports: [EventBusService, OutboxDispatcher],
})
export class EventsModule {}
