import { isStaffRole } from '@revime/shared';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { CreateAdminAlertInput } from '../../admin/admin-alerts.service.js';
import type { MailSender } from '../../mail/mail.service.js';
import {
  renderAccountLockedEmail,
  renderNewDeviceEmail,
  renderStaffLockAlertEmail,
} from '../../mail/security-email.template.js';
import { throttleKey } from './auth-throttle.js';
import { adminLinkOrigin } from '../admin-origins.js';
import type { LockEffects } from './hooks.js';

type PrismaLike = Pick<PrismaClient, 'authLockEvent' | 'user'>;
type AlertRaiser = { raise(input: CreateAdminAlertInput): Promise<void> };

const parisTime = (date: Date) =>
  new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }).format(date);

/**
 * V7 A11 / D3 (U2). The production side effects of a lock. Each step runs on its own: a mail
 * provider outage must not cost the dashboard its alert, nor the alert the history row.
 */
export class PrismaLockEffects implements LockEffects {
  constructor(
    private readonly prisma: PrismaLike,
    private readonly mailer: () => MailSender,
    private readonly alerts: AlertRaiser,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async accountLocked(event: Parameters<LockEffects['accountLocked']>[0]): Promise<void> {
    const { scope, user, level, lockedUntil, resetUrl, notMeUrl } = event;
    const staff = isStaffRole(user.role);

    await step('history row', () =>
      this.prisma.authLockEvent.create({
        data: { scope, key: throttleKey(user.email), userId: user.id, level, lockedUntil },
      }),
    );

    if (scope === 'LOGIN_ACCOUNT') {
      await step('lock e-mail', async () => {
        const { subject, html, text } = renderAccountLockedEmail({ name: user.name, lockedUntil, resetUrl, notMeUrl });
        await this.mailer().send({ to: user.email, subject, html, text });
      });
    }

    await step('alert', () =>
      this.alerts.raise({
        type: 'ACCOUNT_LOCKED',
        severity: staff ? 'CRITICAL' : 'HIGH',
        title: scope === 'LOGIN_ACCOUNT' ? 'Compte bloqué (mots de passe erronés)' : 'Compte bloqué (codes erronés)',
        message: `${user.email}${staff ? ` (équipe, ${user.role})` : ''} est bloqué jusqu'à ${parisTime(lockedUntil)}, palier ${level}.`,
        targetType: 'User',
        targetId: user.id,
        link: `/utilisateurs/${user.id}`,
        metadata: { scope, level, lockedUntil: lockedUntil.toISOString() },
      }),
    );

    if (scope === 'LOGIN_ACCOUNT' && staff) {
      await step('super admin e-mails', async () => {
        const superAdmins = await this.prisma.user.findMany({
          where: { role: 'super_admin', OR: [{ banned: false }, { banned: null }] },
          select: { email: true, name: true },
        });
        const sheetUrl = `${adminLinkOrigin()}/utilisateurs/${user.id}`;
        const { subject, html, text } = renderStaffLockAlertEmail({
          staffEmail: user.email,
          staffName: user.name,
          role: user.role!,
          lockedUntil,
          sheetUrl,
        });
        for (const admin of superAdmins) {
          await step(`super admin e-mail to ${admin.email}`, () => this.mailer().send({ to: admin.email, subject, html, text }));
        }
      });
    }
  }

  async ipBlocked(event: Parameters<LockEffects['ipBlocked']>[0]): Promise<void> {
    const { ip, lockedUntil, accountsTried } = event;
    await step('history row', () =>
      this.prisma.authLockEvent.create({ data: { scope: 'IP', key: ip, userId: null, level: 1, lockedUntil } }),
    );
    await step('alert', () =>
      this.alerts.raise({
        type: 'IP_BLOCKED',
        title: 'Adresse IP bloquée',
        message: `${ip} est bloquée jusqu'à ${parisTime(lockedUntil)} après des échecs de connexion sur ${accountsTried} ${
          accountsTried > 1 ? 'comptes' : 'compte'
        }.`,
        targetType: 'IpAddress',
        targetId: ip,
        link: '/alertes',
        metadata: { accountsTried, lockedUntil: lockedUntil.toISOString() },
      }),
    );
  }

  /** U2b (Q10): only the e-mail. No alert and no history row: a new device is not an incident. */
  async newDevice({ user, label, at, notMeUrl }: Parameters<LockEffects['newDevice']>[0]): Promise<void> {
    await step('new-device e-mail', async () => {
      const { subject, html, text } = renderNewDeviceEmail({ name: user.name, label, at, notMeUrl });
      await this.mailer().send({ to: user.email, subject, html, text });
    });
  }

  async unlockedByPasswordReset({ userId }: { userId: string }): Promise<void> {
    const now = this.clock();
    await this.prisma.authLockEvent.updateMany({
      where: { userId, scope: 'LOGIN_ACCOUNT', unlockedAt: null, lockedUntil: { gt: now } },
      data: { unlockedAt: now, unlockReason: 'PASSWORD_RESET' },
    });
  }
}

async function step(name: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    console.error(`[auth-throttle] ${name} failed`, err);
  }
}
