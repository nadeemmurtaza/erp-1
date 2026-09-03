import { Module } from '@nestjs/common';
import { TaxController } from './tax.controller';
import { TaxService } from './tax.service';

@Module({
  controllers: [TaxController],
  providers: [TaxService],
  // Exported for orders (and, eventually, cart, for a live checkout preview)
  // to resolve rates without importing anything but this module's service.
  exports: [TaxService],
})
export class TaxModule {}
