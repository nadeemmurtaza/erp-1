import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { OpsAuthGuard } from '../../core/security/ops-auth.guard';
import { RequireOpsPermission } from '../../core/security/decorators';
import { AgencyClientsService } from './agency-clients.service';
import { RegisterAgencyClientDto, UpdateAgencyClientDto } from './dto/register-agency-client.dto';

/** WO-14.1 — ops-only, session-equivalent (`OpsAuthGuard`) management of
 *  which existing `PlatformTenant` rows are onboarded to the agency
 *  managed-services dashboard. Never reachable by an `X-Agency-Api-Key` —
 *  that credential only ever reaches `AgencyReportingController`. */
@Controller('agency/clients')
@UseGuards(OpsAuthGuard)
@RequireOpsPermission('platform.agency.manage')
export class AgencyClientsController {
  constructor(private readonly clients: AgencyClientsService) {}

  @Get()
  list() {
    return this.clients.list();
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.clients.getById(id);
  }

  /** Returns the plaintext `AGENCY_API_KEY` exactly once — the caller is
   *  responsible for handing it to the client the same way the Extractor
   *  already prints it (doc 12), it is never retrievable again. */
  @Post(':id/register')
  register(@Param('id') id: string, @Body() dto: RegisterAgencyClientDto) {
    return this.clients.register(id, dto);
  }

  @Post(':id/rotate-key')
  rotateKey(@Param('id') id: string) {
    return this.clients.rotateKey(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAgencyClientDto) {
    return this.clients.update(id, dto);
  }
}
