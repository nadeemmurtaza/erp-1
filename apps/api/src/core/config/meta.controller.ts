import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { FEATURE_MODULES } from '../../modules/modules.registry';
import { MODULE_PACKS } from '../../modules/module-packs';
import { Public } from '../auth/decorators';
import { AppConfigService } from './app-config.service';

/**
 * What the frontend needs before it can decide what to show: which optional
 * modules this deployment actually has switched on.
 *
 * `AdminNavItem.module` (nav-registry.ts) has always documented itself as
 * "hidden when the module is off in MODULES", but nothing exposed that over
 * HTTP for the admin shell to filter on — a nav entry for a disabled module
 * (Tax, say, on a deployment that never turned it on) rendered anyway and
 * 404'd. See docs/implementation/MULTI-SECTOR.md, "The gap: the web app
 * cannot see which modules are enabled".
 */
@ApiTags('meta')
@Controller('meta')
export class MetaController {
  constructor(private readonly config: AppConfigService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Which optional modules and sector packs this deployment has enabled' })
  get(): { modules: string[]; packs: string[] } {
    const modules = FEATURE_MODULES.filter(
      (entry) => entry.alwaysOn || this.config.isModuleEnabled(entry.name),
    ).map((entry) => entry.name);

    const packs = [...new Set(modules.map((name) => MODULE_PACKS[name]).filter(Boolean))];

    return { modules, packs };
  }
}
