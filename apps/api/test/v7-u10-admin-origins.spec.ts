import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { __setMailSender, type Mail } from '../src/mail/mail.service.js';
import { AdminStaffInvitationsService } from '../src/admin/admin-staff-invitations.service.js';
import { adminLinkOrigin, adminOrigins } from '../src/auth/admin-origins.js';

/**
 * V7 A6 (U10, `DEC7-26`). The dashboard moves to https://admin.revime.fr while
 * https://repareme-admin.vercel.app keeps working. The admin proxy forwards the browser's
 * `Origin` (`apps/admin/lib/proxy.ts`), so Better Auth must trust BOTH hosts or sign-in fails
 * on one of them. `ADMIN_ORIGIN` therefore takes a comma-separated list: every entry is trusted
 * (Better Auth, CORS), and the first one is the host written into e-mail links.
 */

const TWO = 'https://admin.revime.fr, https://repareme-admin.vercel.app';

afterEach(() => {
  delete process.env.ADMIN_ORIGIN;
  __setMailSender(undefined);
});

describe('adminOrigins', () => {
  it('falls back to the local dashboard when unset, empty or only separators', () => {
    expect(adminOrigins(undefined)).toEqual(['http://localhost:3001']);
    expect(adminOrigins('')).toEqual(['http://localhost:3001']);
    expect(adminOrigins(' , ,')).toEqual(['http://localhost:3001']);
  });

  it('keeps a single value exactly as before', () => {
    expect(adminOrigins('https://repareme-admin.vercel.app')).toEqual(['https://repareme-admin.vercel.app']);
  });

  it('splits a list, trims each entry, drops empty ones and duplicates, keeps the order', () => {
    expect(adminOrigins(`${TWO}, ,https://admin.revime.fr`)).toEqual([
      'https://admin.revime.fr',
      'https://repareme-admin.vercel.app',
    ]);
  });

  it('reads ADMIN_ORIGIN when called without an argument', () => {
    process.env.ADMIN_ORIGIN = TWO;
    expect(adminOrigins()).toEqual(['https://admin.revime.fr', 'https://repareme-admin.vercel.app']);
  });
});

describe('adminLinkOrigin', () => {
  it('is the first origin of the list', () => {
    expect(adminLinkOrigin(TWO)).toBe('https://admin.revime.fr');
    expect(adminLinkOrigin('https://repareme-admin.vercel.app')).toBe('https://repareme-admin.vercel.app');
    expect(adminLinkOrigin(undefined)).toBe('http://localhost:3001');
  });
});

describe('the staff invitation link uses the first origin', () => {
  it('writes https://admin.revime.fr/invitation, never the raw list', async () => {
    process.env.ADMIN_ORIGIN = TWO;
    const mails: Mail[] = [];
    __setMailSender({ send: vi.fn(async (mail: Mail) => void mails.push(mail)) });
    const tx = {
      staffInvitation: {
        updateMany: vi.fn(async () => ({ count: 0 })),
        create: vi.fn(async ({ data }: any) => ({ id: 'inv-1', ...data })),
      },
    };
    const prisma = {
      user: {
        findUnique: vi.fn(async ({ where }: any) =>
          where.id === 'actor-1' ? { id: 'actor-1', name: 'Alice', firstName: 'Alice', email: 'a@revime.fr' } : null,
        ),
      },
      $transaction: vi.fn(async (cb: (t: any) => Promise<any>) => cb(tx)),
    };

    await new AdminStaffInvitationsService(prisma as never).createInvitation('actor-1', {
      email: 'new@revime.fr',
      role: 'moderation',
      firstName: 'Bob',
      lastName: 'Mod',
    });

    expect(mails).toHaveLength(1);
    expect(mails[0]!.text).toContain('https://admin.revime.fr/invitation?token=');
    expect(mails[0]!.text).not.toContain('repareme-admin');
  });
});

describe('every reader goes through the helper', () => {
  const readers = [
    '../src/configure-app.ts',
    '../src/auth/auth.ts',
    '../src/admin/admin-staff-invitations.service.ts',
    '../src/auth/throttle/effects.ts',
    '../src/security/security.service.ts',
  ];

  it.each(readers)('%s no longer reads process.env.ADMIN_ORIGIN itself', (path) => {
    const src = readFileSync(new URL(path, import.meta.url), 'utf8');
    expect(src).not.toContain('process.env.ADMIN_ORIGIN');
    expect(src).toMatch(/adminOrigins\(|adminLinkOrigin\(/);
  });

  it('CORS and Better Auth trust the whole list', () => {
    const cors = readFileSync(new URL('../src/configure-app.ts', import.meta.url), 'utf8');
    expect(cors).toMatch(/origin:\s*adminOrigins\(\)/);
    const auth = readFileSync(new URL('../src/auth/auth.ts', import.meta.url), 'utf8');
    // 24/11/2026: the public site's hosts follow the admin's (site-origins.ts).
    expect(auth).toMatch(/trustedOrigins:\s*\['revime:\/\/',\s*\.\.\.adminOrigins\(\),\s*\.\.\.siteOrigins\(\)\]/);
  });
});

describe('the demo seed sends one trusted origin, not the list', () => {
  it('uses the first entry of a list', async () => {
    process.env.ADMIN_ORIGIN = TWO;
    vi.resetModules();
    const { SEED_ORIGIN } = await import('../scripts/seed-demo/phase1-http.mjs');
    expect(SEED_ORIGIN).toBe('https://admin.revime.fr');
  });
});
