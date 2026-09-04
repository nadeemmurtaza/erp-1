import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { DEFAULT_LOCALE, isLocale, type Locale } from '@yaseen/shared';
import { RequirePermission } from '../../auth/decorators';
import { AppConfigService } from '../../config/app-config.service';
import { EMAIL_TEMPLATE_CATALOG } from './catalog';
import { renderEmail, type EmailContext } from './templates';

/**
 * The "manage email templates" screen's backend: a list of every registered
 * template with what triggers it (or the honest admission that nothing
 * does yet), and a live-rendered preview against sample data.
 *
 * Read-only on purpose — there is no database-backed template to edit here.
 * Every template is TypeScript source under core/notifications/email, so
 * "editing" one is a code change and a deploy, same as any other template
 * change has always been. This screen is where staff go to see what exists
 * and what each one actually looks like, in both languages.
 */
@ApiTags('admin/email-templates')
@Controller('admin/email-templates')
@RequirePermission('settings.manage')
export class EmailTemplatesAdminController {
  private readonly context: EmailContext;

  constructor(config: AppConfigService) {
    this.context = {
      storeName: config.get('STORE_NAME'),
      storefrontUrl: config.get('STOREFRONT_URL'),
      contactEmail: config.get('MAIL_REPLY_TO') || config.get('SEED_ADMIN_EMAIL'),
      supportWhatsapp: config.get('SUPPORT_WHATSAPP') || undefined,
      bankTransferDetails: config.get('BANK_TRANSFER_DETAILS') || undefined,
    };
  }

  @Get()
  @ApiOperation({ summary: 'Every registered email template and what triggers it' })
  list() {
    return EMAIL_TEMPLATE_CATALOG.map(({ sampleData: _sampleData, ...entry }) => entry);
  }

  @Get(':key/preview')
  @ApiOperation({ summary: 'Render a template against sample data' })
  preview(@Param('key') key: string, @Query('locale') localeParam?: string) {
    const entry = EMAIL_TEMPLATE_CATALOG.find((template) => template.key === key);
    if (!entry) {
      throw new NotFoundException(`No email template registered as "${key}".`);
    }

    const locale: Locale = localeParam && isLocale(localeParam) ? localeParam : DEFAULT_LOCALE;
    const rendered = renderEmail(entry.key, entry.sampleData, locale, this.context);
    if (!rendered) {
      throw new NotFoundException(`"${key}" has no renderer in EMAIL_TEMPLATES.`);
    }

    return rendered;
  }
}
