import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { AppConfigService } from '../../core/config/app-config.service';

/**
 * WO-14.5 — the client-side half of doc 14. A deliberately thin,
 * server-side proxy: this module never measures or computes anything
 * itself, it only pulls its own tenant's numbers from the Master
 * Platform's read-only reporting API (`agency-reporting.controller.ts`
 * in `apps/platform`), authenticated by `AGENCY_API_KEY` — a header this
 * app's own browser bundle never sees (`AGENCY_API_URL`/`AGENCY_API_KEY`
 * are read from server-side env only, never exposed to the client, same
 * discipline as `NidVerificationProvider`'s own external-API client).
 *
 * "Which tenant" is never a parameter here: the Master Platform resolves
 * it entirely from the presented key (`AgencyApiKeyGuard`, `apps/platform`)
 * — this service is only ever able to ask for "my own" usage/invoices.
 */
@Injectable()
export class ManagedServicesService {
  private readonly logger = new Logger(ManagedServicesService.name);

  constructor(private readonly config: AppConfigService) {}

  async getUsage(): Promise<unknown> {
    return this.get('/agency/clients/me/usage');
  }

  async getInvoices(): Promise<unknown> {
    return this.get('/agency/clients/me/invoices');
  }

  private async get(path: string): Promise<unknown> {
    const baseUrl = this.config.get('AGENCY_API_URL');
    const apiKey = this.config.get('AGENCY_API_KEY');
    if (!baseUrl || !apiKey) {
      throw new ServiceUnavailableException('Managed services is not configured for this deployment.');
    }

    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        headers: { 'x-agency-api-key': apiKey },
      });
    } catch (error) {
      this.logger.error(`Managed services request to ${path} failed to reach the Master Platform — ${error instanceof Error ? error.message : error}`);
      throw new ServiceUnavailableException('Could not reach the managed-services platform right now.');
    }

    if (!response.ok) {
      this.logger.error(`Managed services request to ${path} returned ${response.status}`);
      throw new ServiceUnavailableException('The managed-services platform returned an error.');
    }

    return response.json();
  }
}
