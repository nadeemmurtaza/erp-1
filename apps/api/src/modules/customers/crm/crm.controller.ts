import { BRAND } from '@newax/shared';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { stringify } from 'csv-stringify/sync';
import { toMajor } from '@newax/shared';
import type { AuthenticatedUser } from '../../../core/auth/auth.constants';
import { CurrentUser, Public, RequirePermission } from '../../../core/auth/decorators';
import { ContactImportService } from './contact-import.service';
import { CrmService } from './crm.service';
import {
  AddInteractionDto,
  AddFollowUpDto,
  ContactQueryDto,
  CreateLeadDto,
  TagContactDto,
  UpdateContactDto,
  UpdateLeadDto,
} from './dto/crm.dto';

@ApiTags('crm')
@Controller('crm')
export class CrmPublicController {
  constructor(private readonly crm: CrmService) {}

  @Public()
  @Post('enquiries')
  @ApiOperation({ summary: 'Contact-form enquiry — becomes a lead in the CRM' })
  createEnquiry(@Body() dto: CreateLeadDto) {
    return this.crm.createLead(dto);
  }
}

/** Uploaded file as Multer hands it over. */
interface UploadedCsv {
  buffer: Buffer;
}

@ApiTags('admin/crm')
@Controller('admin/crm')
@RequirePermission('crm.manage')
export class CrmAdminController {
  constructor(
    private readonly crm: CrmService,
    private readonly contactImporter: ContactImportService,
  ) {}

  // --- Contacts ------------------------------------------------------------

  @Get('contacts')
  @ApiOperation({ summary: 'Customers, filterable and searchable' })
  listContacts(@Query() query: ContactQueryDto) {
    return this.crm.list({
      page: query.page,
      pageSize: query.pageSize,
      skip: query.skip,
      take: query.take,
      q: query.q,
      status: query.status,
      tag: query.tag,
      city: query.city,
      minOrders: query.minOrders,
    });
  }

  @Get('contacts/export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header(
    'Content-Disposition',
    `attachment; filename="${BRAND.identity.domain.split('.')[0]}-contacts.csv"`,
  )
  @ApiOperation({
    summary: 'Export the filtered list as CSV — for a WhatsApp broadcast list',
  })
  async exportContacts(@Query() query: ContactQueryDto): Promise<string> {
    const contacts = await this.crm.listAllMatching({
      q: query.q,
      status: query.status,
      tag: query.tag,
      city: query.city,
      minOrders: query.minOrders,
    });

    return stringify(
      contacts.map((contact) => ({
        name: contact.name,
        phone: contact.phoneE164 ?? '',
        email: contact.email ?? '',
        city: contact.city ?? '',
        status: contact.status,
        orders: contact.orderCount,
        // Rupees, not paisa — this file is read by people.
        lifetime_value_pkr: toMajor(contact.lifetimeValue).toFixed(0),
        last_order: contact.lastOrderAt?.toISOString().slice(0, 10) ?? '',
        tags: contact.tags.map((link) => link.tag.name).join('|'),
      })),
      {
        header: true,
        columns: [
          'name',
          'phone',
          'email',
          'city',
          'status',
          'orders',
          'lifetime_value_pkr',
          'last_order',
          'tags',
        ],
      },
    );
  }

  @Get('contacts/:id')
  getContact(@Param('id') id: string) {
    return this.crm.get(id);
  }

  @Patch('contacts/:id')
  updateContact(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateContactDto,
  ) {
    return this.crm.update(user.id, id, dto);
  }

  @Post('contacts/:id/tags')
  @ApiOperation({ summary: 'Tag a contact — repeat buyer, bridal, wholesale…' })
  tagContact(@Param('id') id: string, @Body() dto: TagContactDto) {
    return this.crm.tagContact(id, dto.name);
  }

  @Delete('contacts/:id/tags/:tagId')
  @HttpCode(HttpStatus.NO_CONTENT)
  untagContact(@Param('id') id: string, @Param('tagId') tagId: string) {
    return this.crm.untagContact(id, tagId);
  }

  @Get('tags')
  listTags() {
    return this.crm.listTags();
  }

  @Post('backfill')
  @ApiOperation({
    summary: 'Build contacts from orders that predate the CRM, and repair rollups',
  })
  backfill() {
    return this.crm.backfillFromOrders();
  }

  // --- Interactions and follow-ups -----------------------------------------

  @Post('interactions')
  @ApiOperation({ summary: 'Log a call, WhatsApp message, visit or complaint' })
  addInteraction(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AddInteractionDto,
  ) {
    return this.crm.addInteraction(user.id, dto);
  }

  @Post('follow-ups')
  @ApiOperation({ summary: 'Schedule a follow-up' })
  addFollowUp(@CurrentUser() user: AuthenticatedUser, @Body() dto: AddFollowUpDto) {
    return this.crm.addFollowUp(user.id, dto);
  }

  @Post('follow-ups/:id/done')
  completeFollowUp(@Param('id') id: string) {
    return this.crm.completeFollowUp(id);
  }

  @Get('follow-ups/due')
  @ApiOperation({ summary: 'Follow-ups due today or overdue' })
  dueFollowUps(@Query('mine') mine: string, @CurrentUser() user: AuthenticatedUser) {
    return this.crm.dueFollowUps(mine === 'true' ? user.id : undefined);
  }

  // --- Leads ---------------------------------------------------------------

  @Get('leads')
  listLeads(@Query('status') status?: string) {
    return this.crm.listLeads(status);
  }

  @Patch('leads/:id')
  updateLead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateLeadDto,
  ) {
    return this.crm.updateLead(user.id, id, dto);
  }

  // --- Bulk import (admin-platform/72-fragmented-tool-consolidation-import.md WO-72.1) --------

  @Get('contacts/import/template')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="contacts-template.csv"')
  @ApiOperation({ summary: 'Download the CSV template for bulk contact upload' })
  contactImportTemplate(): string {
    return this.contactImporter.template();
  }

  @Post('contacts/import')
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Bulk create or update contacts from a CSV file' })
  importContacts(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: UploadedCsv | undefined,
    @Query('dryRun') dryRun?: string,
  ) {
    if (!file) {
      throw new BadRequestException('Choose a CSV file to upload.');
    }
    return this.contactImporter.import(user.id, file.buffer, { dryRun: dryRun === 'true' });
  }
}
