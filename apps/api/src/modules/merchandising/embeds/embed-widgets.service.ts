import { Injectable, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AppConfigService } from '../../../core/config/app-config.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import type { AuthenticatedUser } from '../../../core/auth/auth.constants';
import type { EmbeddedWidget } from '../../../core/prisma/client';

const EMBED_TOKEN_TTL_SECONDS = 5 * 60;
const EMBED_TOKEN_AUDIENCE = 'embed-widget';

/**
 * architecture-patterns/113-micro-frontend-embedding.md (WO-113.1) — a
 * narrow embed-token issuer, not a micro-frontend runtime. The token is
 * signed with the same `JWT_ACCESS_SECRET` this codebase already manages as
 * a secret, under a distinct `aud` claim and a `sub` that is the widget's
 * own key rather than a user id — it can never be mistaken for, or replayed
 * as, a real session access token by `JwtStrategy.validate()`, which looks
 * up `sub` as a `User.id`.
 */
@Injectable()
export class EmbedWidgetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
  ) {}

  listWidgets(activeOnly: boolean): Promise<EmbeddedWidget[]> {
    return this.prisma.embeddedWidget.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      orderBy: { createdAt: 'asc' },
    });
  }

  createWidget(input: { key: string; label: string; targetUrl: string }, createdByUserId: string): Promise<EmbeddedWidget> {
    return this.prisma.embeddedWidget.create({ data: { ...input, createdByUserId } });
  }

  async updateWidget(id: string, patch: { label?: string; targetUrl?: string; isActive?: boolean }): Promise<EmbeddedWidget> {
    await this.assertExists(id);
    return this.prisma.embeddedWidget.update({ where: { id }, data: patch });
  }

  async deleteWidget(id: string): Promise<void> {
    await this.assertExists(id);
    await this.prisma.embeddedWidget.delete({ where: { id } });
  }

  /**
   * Short-lived, scoped to the caller's own identity — never a raw session
   * token handed to a third-party iframe. `organizationId`/`locationId`
   * scoping named in the doc's own sketch does not apply as written: no
   * `AuthenticatedUser` in this codebase carries either today (ADR-044/
   * ADR-040 — this deployment IS the tenant), so the real, honest scope is
   * the caller's own `userId`.
   */
  async issueEmbedToken(user: AuthenticatedUser, widgetKey: string): Promise<{ token: string; expiresAt: Date }> {
    const widget = await this.prisma.embeddedWidget.findUnique({ where: { key: widgetKey } });
    if (!widget || !widget.isActive) throw new NotFoundException(`No active embedded widget "${widgetKey}".`);

    const token = await this.jwt.signAsync(
      { sub: widget.key, userId: user.id, aud: EMBED_TOKEN_AUDIENCE },
      { secret: this.config.get('JWT_ACCESS_SECRET'), expiresIn: EMBED_TOKEN_TTL_SECONDS },
    );
    return { token, expiresAt: new Date(Date.now() + EMBED_TOKEN_TTL_SECONDS * 1000) };
  }

  private async assertExists(id: string): Promise<void> {
    const widget = await this.prisma.embeddedWidget.findUnique({ where: { id }, select: { id: true } });
    if (!widget) throw new NotFoundException('No such embedded widget.');
  }
}
