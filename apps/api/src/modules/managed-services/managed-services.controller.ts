import { Controller, Get } from '@nestjs/common';
import { RequirePermission } from '../../core/auth/decorators';
import { ManagedServicesService } from './managed-services.service';

/**
 * WO-14.5 — the "Hosting & Billing" admin page's data source. Reuses
 * `settings.manage` (doc 14's own explicit instruction) rather than a new
 * permission — this is one page, not a new capability surface.
 */
@Controller('managed-services')
@RequirePermission('settings.manage')
export class ManagedServicesController {
  constructor(private readonly managedServices: ManagedServicesService) {}

  @Get('usage')
  usage() {
    return this.managedServices.getUsage();
  }

  @Get('invoices')
  invoices() {
    return this.managedServices.getInvoices();
  }
}
