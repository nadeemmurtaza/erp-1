import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const CHANNELS = ['EMAIL', 'SMS', 'WHATSAPP', 'PUSH'] as const;
const CATEGORIES = ['STITCHING_PROGRESS', 'MARKETING', 'BACK_IN_STOCK'] as const;

export interface PreferenceCell {
  channel: (typeof CHANNELS)[number];
  category: (typeof CATEGORIES)[number];
  enabled: boolean;
}

/**
 * WO-7.8. `marketing` x `email` is the one cell backed by the pre-existing
 * `User.marketingEmailOptOut` column instead of this module's own table —
 * see notification-preferences.prisma's own top-of-file note for why. Every
 * other cell defaults to enabled when no row exists, so a customer who has
 * changed nothing needs no rows at all.
 */
@Injectable()
export class NotificationPreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<PreferenceCell[]> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { marketingEmailOptOut: true } });
    if (!user) throw new NotFoundException('Customer not found.');

    const rows = await this.prisma.notificationPreference.findMany({ where: { userId } });
    const byKey = new Map(rows.map((r) => [`${r.channel}|${r.category}`, r.enabled]));

    const cells: PreferenceCell[] = [];
    for (const category of CATEGORIES) {
      for (const channel of CHANNELS) {
        if (category === 'MARKETING' && channel === 'EMAIL') {
          cells.push({ channel, category, enabled: !user.marketingEmailOptOut });
          continue;
        }
        cells.push({ channel, category, enabled: byKey.get(`${channel}|${category}`) ?? true });
      }
    }
    return cells;
  }

  async update(userId: string, updates: PreferenceCell[]): Promise<PreferenceCell[]> {
    for (const cell of updates) {
      if (cell.category === 'MARKETING' && cell.channel === 'EMAIL') {
        await this.prisma.user.update({ where: { id: userId }, data: { marketingEmailOptOut: !cell.enabled } });
        continue;
      }
      await this.prisma.notificationPreference.upsert({
        where: { userId_channel_category: { userId, channel: cell.channel, category: cell.category } },
        update: { enabled: cell.enabled },
        create: { userId, channel: cell.channel, category: cell.category, enabled: cell.enabled },
      });
    }
    return this.list(userId);
  }

  /** Read by any real notification path before it sends an optional-category message. */
  async isEnabled(userId: string, channel: PreferenceCell['channel'], category: PreferenceCell['category']): Promise<boolean> {
    if (category === 'MARKETING' && channel === 'EMAIL') {
      const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { marketingEmailOptOut: true } });
      return !(user?.marketingEmailOptOut ?? false);
    }
    const row = await this.prisma.notificationPreference.findUnique({
      where: { userId_channel_category: { userId, channel, category } },
    });
    return row?.enabled ?? true;
  }
}
