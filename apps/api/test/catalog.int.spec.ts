import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './create-test-app.js';

describe('categories', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('lists the seeded categories in sort order', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/categories').expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(44);

    const labels = res.body.map((c: { labelFr: string }) => c.labelFr);
    // The provisional labels are gone: 'Smartphone' is now 'Smartphones' and
    // 'Montre connectée' is deactivated, absorbed into 'Objets connectés'.
    expect(labels).toContain('Smartphones');
    expect(labels).toContain('Objets connectés');
    expect(labels).not.toContain('Montre connectée');
    expect(labels).not.toContain('Écran');
  });

  it('exposes id, parentId, slug and labelFr', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/categories').expect(200);
    expect(Object.keys(res.body[0]).sort()).toEqual(['id', 'labelFr', 'parentId', 'slug']);
  });

  it('returns the eight parents first, in sort order', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/categories').expect(200);

    const parents = res.body.filter((c: { parentId: string | null }) => c.parentId === null);
    expect(parents).toHaveLength(8);
    expect(parents.map((c: { labelFr: string }) => c.labelFr)).toEqual([
      'Électronique',
      'Maison & Jardin',
      'Mode & accessoires',
      'Mobilité',
      'Famille',
      'Loisirs',
      'Véhicules',
      'Autres',
    ]);
  });

  it('parents the reused smartphone row under Électronique', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/categories').expect(200);

    const electronique = res.body.find((c: { slug: string }) => c.slug === 'electronique');
    const smartphone = res.body.find((c: { slug: string }) => c.slug === 'smartphone');
    expect(smartphone.labelFr).toBe('Smartphones');
    expect(smartphone.parentId).toBe(electronique.id);

    const children = res.body.filter(
      (c: { parentId: string | null }) => c.parentId === electronique.id,
    );
    expect(children).toHaveLength(10);
  });

  it('gives Autres no children, so it is a terminal choice', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/categories').expect(200);
    const autres = res.body.find((c: { slug: string }) => c.slug === 'autres');
    expect(autres).toBeDefined();
    expect(
      res.body.filter((c: { parentId: string | null }) => c.parentId === autres.id),
    ).toHaveLength(0);
  });

  it('excludes an active child of an inactive parent, not just the parent', async () => {
    const parent = await prisma.category.create({
      data: { slug: 'tmp-parent-inactive', labelFr: 'Parent désactivé', sortOrder: 99, active: false },
    });
    const child = await prisma.category.create({
      data: {
        slug: 'tmp-child-active',
        labelFr: 'Enfant actif',
        sortOrder: 1,
        active: true,
        parentId: parent.id,
      },
    });

    try {
      const res = await request(app.getHttpServer()).get('/api/v1/categories').expect(200);
      const slugs = res.body.map((c: { slug: string }) => c.slug);
      expect(slugs).not.toContain('tmp-parent-inactive');
      // The point of the test: the CHILD is active and must still be absent.
      expect(slugs).not.toContain('tmp-child-active');
    } finally {
      await prisma.category.delete({ where: { id: child.id } });
      await prisma.category.delete({ where: { id: parent.id } });
    }
  });
});
