import { Global, Module } from '@nestjs/common';
import { AnaxSensorService } from './anax-sensor.service';
import { AnaxService } from './anax.service';
import { AnaxController } from './anax.controller';

@Global()
@Module({
  controllers: [AnaxController],
  providers: [AnaxSensorService, AnaxService],
  exports: [AnaxService, AnaxSensorService],
})
export class AnaxModule {}
