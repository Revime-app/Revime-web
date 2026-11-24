import { Injectable } from '@nestjs/common';
import { httpsUrlOrNull, pickDailyTip, type DailyTipDto } from '@revime/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { TipCategory } from '../generated/prisma/client.js';

@Injectable()
export class TipsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * CF4-38 (spec L5). The pool's tips plus ALL, eligibility decided IN MEMORY by `tipState`
   * (active + inside the display window) and the pick by `pickDailyTip` on the Europe/Paris
   * day - the SAME function the admin list uses for its « Aujourd'hui » line, so the two
   * cannot disagree. No `active` filter in the query on purpose: one rule, one place.
   */
  async getDailyTip(category: TipCategory): Promise<DailyTipDto | null> {
    const tips = await this.prisma.tip.findMany({
      where: { OR: [{ category }, { category: 'ALL' }] },
    });
    const tip = pickDailyTip(tips ?? [], category, new Date());
    if (!tip) return null;
    // An anonymous endpoint: never the whole row. A URL stored before the admin schema checked them (P23)
    // is dropped here rather than handed to the app.
    return {
      id: tip.id,
      text: tip.text,
      category: tip.category,
      imageUrl: httpsUrlOrNull(tip.imageUrl),
      linkUrl: httpsUrlOrNull(tip.linkUrl),
    };
  }
}
