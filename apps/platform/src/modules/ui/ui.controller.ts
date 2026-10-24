import { join } from 'node:path';
import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';

/**
 * The minimum UI these three documents actually require — CLAUDE.md's own
 * "a feature ships whole, not backend-only" applied minimally rather than
 * as a reason to build a second frontend app: `apps/platform` has no
 * existing frontend infrastructure (no Next.js app, no design-system
 * wiring — `.claude/rules/ui.md`/`design.md` scope themselves to
 * apps/web/pos/mobile only, not this one), so these are plain, static,
 * dependency-free HTML pages served directly by this API, not a new build
 * pipeline.
 *
 * - `/ui/pricing` — doc 154 §3's own public pricing-comparison page, the
 *   one genuinely new screen that document adds; its plan cards link into
 *   `/ui/signup` below with a `plan` query param, never a second signup
 *   mechanism.
 * - `/ui/signup` — WO-51.2's own public self-service form.
 * - `/ui/verify` — the landing page the emailed verification link opens
 *   (a GET-safe page that itself POSTs the token, so an email-scanning
 *   bot prefetching the raw link can never accidentally consume it).
 * - `/ui/admin` — WO-50.5's "plan catalogue admin" plus the other ops
 *   surfaces (tenants, trials, custom quotes, support access, resource
 *   quotas) these documents' own permissions already gate; it takes an
 *   ops key pasted into the page (this app has no session/login system —
 *   see `OpsAuthGuard`'s own doc comment) rather than inventing one here.
 */
@Controller('ui')
export class UiController {
  private readonly pagesDir = join(__dirname, 'pages');

  @Get('pricing')
  pricing(@Res() res: Response): void {
    res.sendFile('pricing.html', { root: this.pagesDir });
  }

  @Get('signup')
  signup(@Res() res: Response): void {
    res.sendFile('signup.html', { root: this.pagesDir });
  }

  @Get('verify')
  verify(@Res() res: Response): void {
    res.sendFile('verify.html', { root: this.pagesDir });
  }

  @Get('admin')
  admin(@Res() res: Response): void {
    res.sendFile('admin.html', { root: this.pagesDir });
  }
}
