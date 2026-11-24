import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminCommunicationsService } from '../src/admin/admin-communications.service.js';

vi.mock('../src/mail/mail.service.js', () => ({ mailSender: () => ({ send: vi.fn() }) }));

/**
 * V7 D1 (U6). The client's two push broadcasts of 2026-10-27 reached nobody: they were commercial,
 * the four token holders had no marketing consent, and Android had no tokens at all (`FND7-016`).
 * The preview now says who is reachable by push on each platform, so a zero is visible before the
 * send and its cause can be read.
 */
const user = (id: string, platforms: Array<'IOS' | 'ANDROID'>, marketingConsent = false): any => ({
  id,
  name: id,
  email: `${id}@example.com`,
  marketingConsent,
  marketingConsentEmail: false,
  repairerProfile: null,
  pushTokens: platforms.map((platform, i) => ({ id: `${id}-t${i}`, disabledAt: null, platform })),
});

describe('V7 U6 push reach in the audience preview', () => {
  let prisma: any;
  let service: AdminCommunicationsService;

  beforeEach(() => {
    prisma = { user: { findMany: vi.fn(), findUnique: vi.fn() } };
    service = new AdminCommunicationsService(prisma, { dispatch: vi.fn() } as any);
  });

  it('counts the people reachable on iOS and on Android, and those of them who consented', async () => {
    prisma.user.findMany.mockResolvedValue([
      user('a', ['IOS']),
      user('b', ['IOS'], true),
      user('c', ['ANDROID'], true),
      user('d', ['IOS', 'ANDROID']),
      user('e', []),
    ]);
    const p = await service.previewAudience({ type: 'SEGMENT', role: 'ALL', verifiedOnly: false, activeOnly: true });
    expect(p).toMatchObject({
      totalRecipients: 5,
      pushEligibleCount: 4,
      pushIosCount: 3,
      pushAndroidCount: 2,
      marketingPushCount: 2,
      marketingPushIosCount: 1,
      marketingPushAndroidCount: 1,
    });
  });

  it('reads the platform of each active token', async () => {
    prisma.user.findMany.mockResolvedValue([]);
    await service.previewAudience({ type: 'SEGMENT', role: 'ALL', verifiedOnly: false, activeOnly: true });
    const select = prisma.user.findMany.mock.calls[0][0].select;
    expect(select.pushTokens).toMatchObject({ where: { disabledAt: null }, select: { platform: true } });
  });
});
