import { Injectable } from '@nestjs/common';
import {
  pickDailyTip,
  tipState,
  type AdminTipInput,
  type AdminTipItem,
  type AdminTipListQuery,
  type AdminTipsResponse,
  type AdminTipUpdate,
} from '@revime/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { AppException } from '../common/app-exception.js';

const NOT_FOUND = 'Ressource introuvable.';
const END_AFTER_START = 'La date de fin doit être après la date de début.';

type TipRow = {
  id: string;
  text: string;
  category: 'CLIENT' | 'REPAIRER' | 'ALL';
  active: boolean;
  imageUrl?: string | null;
  linkUrl?: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  createdAt: Date;
};

const toDate = (v: string | null) => (v === null ? null : new Date(v));

/**
 * CF4-38 « Conseils du jour » (spec §4.3). The whole list (tens of rows, no pagination) with
 * each tip's state, and the tip each pool shows today computed by the SAME `pickDailyTip` as
 * `GET /tips/daily` over the unfiltered rows.
 */
@Injectable()
export class AdminTipsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q: AdminTipListQuery): Promise<AdminTipsResponse> {
    const now = new Date();
    const rows = (await this.prisma.tip.findMany({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })) as TipRow[];
    const items = rows
      .map((r) => this.toItem(r, now))
      // A pool's tab shows its own tips and the ALL tips (tagged « Tous »), as the app does.
      .filter((i) => !q.category || i.category === q.category || (q.category !== 'ALL' && i.category === 'ALL'))
      .filter((i) => !q.state || i.state === q.state);
    return {
      items,
      today: {
        CLIENT: pickDailyTip(rows, 'CLIENT', now)?.id ?? null,
        REPAIRER: pickDailyTip(rows, 'REPAIRER', now)?.id ?? null,
      },
    };
  }

  async create(input: AdminTipInput): Promise<AdminTipItem> {
    const row = (await this.prisma.tip.create({
      data: {
        text: input.text,
        category: input.category,
        active: input.active,
        imageUrl: input.imageUrl ?? null,
        linkUrl: input.linkUrl ?? null,
        startsAt: toDate(input.startsAt),
        endsAt: toDate(input.endsAt),
      },
    })) as TipRow;
    return this.toItem(row, new Date());
  }

  async update(id: string, input: AdminTipUpdate): Promise<AdminTipItem> {
    const current = (await this.prisma.tip.findUnique({ where: { id } })) as TipRow | null;
    if (!current) throw new AppException('NOT_FOUND', NOT_FOUND);

    const data: Record<string, unknown> = {};
    if (input.text !== undefined) data.text = input.text;
    if (input.category !== undefined) data.category = input.category;
    if (input.active !== undefined) data.active = input.active;
    if (input.imageUrl !== undefined) data.imageUrl = input.imageUrl;
    if (input.linkUrl !== undefined) data.linkUrl = input.linkUrl;
    if (input.startsAt !== undefined) data.startsAt = toDate(input.startsAt);
    if (input.endsAt !== undefined) data.endsAt = toDate(input.endsAt);

    // The schema's refine only sees the bounds the body carries; check the MERGED window so
    // sending one bound cannot put the end before a stored start.
    const startsAt = data.startsAt !== undefined ? (data.startsAt as Date | null) : current.startsAt;
    const endsAt = data.endsAt !== undefined ? (data.endsAt as Date | null) : current.endsAt;
    if (startsAt && endsAt && endsAt.getTime() <= startsAt.getTime()) {
      throw new AppException('VALIDATION_FAILED', END_AFTER_START, { endsAt: END_AFTER_START });
    }

    const row = (await this.prisma.tip.update({ where: { id }, data })) as TipRow;
    return this.toItem(row, new Date());
  }

  /** « Supprimer » hard-deletes (spec L5). */
  async remove(id: string): Promise<{ ok: true }> {
    const current = await this.prisma.tip.findUnique({ where: { id } });
    if (!current) throw new AppException('NOT_FOUND', NOT_FOUND);
    await this.prisma.tip.delete({ where: { id } });
    return { ok: true };
  }

  private toItem(r: TipRow, now: Date): AdminTipItem {
    return {
      id: r.id,
      text: r.text,
      category: r.category,
      active: r.active,
      imageUrl: r.imageUrl ?? null,
      linkUrl: r.linkUrl ?? null,
      startsAt: r.startsAt ? r.startsAt.toISOString() : null,
      endsAt: r.endsAt ? r.endsAt.toISOString() : null,
      state: tipState(r, now),
      createdAt: r.createdAt.toISOString(),
    };
  }
}
