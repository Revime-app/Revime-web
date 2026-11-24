import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminTipsService } from '../src/admin/admin-tips.service.js';
import { TipsService } from '../src/tips/tips.service.js';
import { pickDailyTip } from '@revime/shared';

type Row = {
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

const NOW = new Date('2026-10-15T12:00:00.000Z');

function makePrisma(initialRows: Row[] = []) {
  const rows = [...initialRows];
  return {
    tip: {
      findMany: vi.fn(async ({ where }: { where?: any } = {}) => {
        if (!where?.OR) return rows;
        return rows.filter((r) =>
          where.OR.some((clause: any) => clause.category === r.category)
        );
      }),
      findUnique: vi.fn(async ({ where: { id } }: { where: { id: string } }) =>
        rows.find((r) => r.id === id) ?? null
      ),
      create: vi.fn(async ({ data }: { data: any }) => {
        const created: Row = {
          id: `tip-${rows.length + 1}`,
          createdAt: NOW,
          text: data.text,
          category: data.category,
          active: data.active ?? true,
          imageUrl: data.imageUrl ?? null,
          linkUrl: data.linkUrl ?? null,
          startsAt: data.startsAt ?? null,
          endsAt: data.endsAt ?? null,
        };
        rows.push(created);
        return created;
      }),
      update: vi.fn(async ({ where: { id }, data }: { where: { id: string }; data: any }) => {
        const idx = rows.findIndex((r) => r.id === id);
        if (idx === -1) return null;
        rows[idx] = { ...rows[idx]!, ...data };
        return rows[idx];
      }),
      delete: vi.fn(async ({ where: { id } }: { where: { id: string } }) => {
        const idx = rows.findIndex((r) => r.id === id);
        if (idx === -1) return null;
        return rows.splice(idx, 1)[0];
      }),
    },
  };
}

describe('P23: AdminTipsService - Image, Link & Rotation Status', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('create persists imageUrl and linkUrl and returns them in DTO', async () => {
    const prisma = makePrisma();
    const service = new AdminTipsService(prisma as any);

    const created = await service.create({
      text: 'Conseil avec média et lien externe',
      category: 'CLIENT',
      active: true,
      imageUrl: 'https://images.unsplash.com/photo-phone-repair.jpg',
      linkUrl: 'https://repareme.fr/guides/batterie',
      startsAt: null,
      endsAt: null,
    } as any);

    expect(prisma.tip.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        imageUrl: 'https://images.unsplash.com/photo-phone-repair.jpg',
        linkUrl: 'https://repareme.fr/guides/batterie',
      }),
    });
    expect(created.imageUrl).toBe('https://images.unsplash.com/photo-phone-repair.jpg');
    expect(created.linkUrl).toBe('https://repareme.fr/guides/batterie');
  });

  it('create handles null or undefined imageUrl and linkUrl gracefully', async () => {
    const prisma = makePrisma();
    const service = new AdminTipsService(prisma as any);

    const created = await service.create({
      text: 'Conseil simple sans média',
      category: 'REPAIRER',
      active: true,
      imageUrl: null,
      linkUrl: null,
      startsAt: null,
      endsAt: null,
    } as any);

    expect(created.imageUrl).toBeNull();
    expect(created.linkUrl).toBeNull();
  });

  it('update persists updated imageUrl and linkUrl', async () => {
    const initialRow: Row = {
      id: 'tip-1',
      text: 'Texte initial',
      category: 'CLIENT',
      active: true,
      imageUrl: null,
      linkUrl: null,
      startsAt: null,
      endsAt: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    };
    const prisma = makePrisma([initialRow]);
    const service = new AdminTipsService(prisma as any);

    const updated = await service.update('tip-1', {
      imageUrl: 'https://cdn.repareme.fr/tips/banner.png',
      linkUrl: 'https://repareme.fr/aide',
    } as any);

    expect(prisma.tip.update).toHaveBeenCalledWith({
      where: { id: 'tip-1' },
      data: expect.objectContaining({
        imageUrl: 'https://cdn.repareme.fr/tips/banner.png',
        linkUrl: 'https://repareme.fr/aide',
      }),
    });
    expect(updated.imageUrl).toBe('https://cdn.repareme.fr/tips/banner.png');
    expect(updated.linkUrl).toBe('https://repareme.fr/aide');
  });

  it('list returns imageUrl and linkUrl for each tip', async () => {
    const rows: Row[] = [
      {
        id: 'tip-client',
        text: 'Astuce client avec photo',
        category: 'CLIENT',
        active: true,
        imageUrl: 'https://cdn.repareme.fr/tips/clean.jpg',
        linkUrl: 'https://repareme.fr/astuce-1',
        startsAt: null,
        endsAt: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
      {
        id: 'tip-repairer',
        text: 'Astuce réparateur sans média',
        category: 'REPAIRER',
        active: true,
        imageUrl: null,
        linkUrl: null,
        startsAt: null,
        endsAt: null,
        createdAt: new Date('2026-01-02T00:00:00Z'),
      },
    ];
    const prisma = makePrisma(rows);
    const service = new AdminTipsService(prisma as any);

    const result = await service.list({});
    const clientTip = result.items.find((i) => i.id === 'tip-client');
    const repairerTip = result.items.find((i) => i.id === 'tip-repairer');

    expect(clientTip?.imageUrl).toBe('https://cdn.repareme.fr/tips/clean.jpg');
    expect(clientTip?.linkUrl).toBe('https://repareme.fr/astuce-1');
    expect(repairerTip?.imageUrl).toBeNull();
    expect(repairerTip?.linkUrl).toBeNull();
  });

  it('pickDailyTip and TipsService return imageUrl and linkUrl when available', async () => {
    const tipRow: Row = {
      id: 'tip-today',
      text: 'Nettoyez votre port de charge avec un cure-dent en bois',
      category: 'CLIENT',
      active: true,
      imageUrl: 'https://cdn.repareme.fr/tips/port.jpg',
      linkUrl: 'https://repareme.fr/blog/nettoyer-port-charge',
      startsAt: null,
      endsAt: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    };
    const prisma = makePrisma([tipRow]);
    const tipsService = new TipsService(prisma as any);

    const daily = await tipsService.getDailyTip('CLIENT');
    expect(daily).not.toBeNull();
    expect(daily?.id).toBe('tip-today');
    expect(daily?.imageUrl).toBe('https://cdn.repareme.fr/tips/port.jpg');
    expect(daily?.linkUrl).toBe('https://repareme.fr/blog/nettoyer-port-charge');

    const picked = pickDailyTip([tipRow], 'CLIENT', NOW);
    expect(picked?.imageUrl).toBe('https://cdn.repareme.fr/tips/port.jpg');
    expect(picked?.linkUrl).toBe('https://repareme.fr/blog/nettoyer-port-charge');
  });
});
