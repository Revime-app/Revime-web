import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CommandesService } from '../commandes/commandes.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { mailSender } from '../mail/mail.service.js';
import {
  fiscalDeclarationInputSchema,
  isAdultBirthDate,
  type FiscalDeclarationInput,
  type FiscalPreFillResponse,
} from '@revime/shared';
import { AppException } from '../common/app-exception.js';
import { isFiscalComplete } from './fiscal-gate.js';

const NO_REPAIRER_PROFILE =
  "Activez d'abord le mode réparateur pour renseigner vos informations fiscales.";
const UNDERAGE = 'Vous devez être majeur (18 ans ou plus) pour déclarer votre activité de réparateur.';

/** Two reminders, then the payout stays frozen. Relance 2 follows Relance 1 by at least a week. */
const MAX_REMINDERS = 2;
const REMINDER_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
/** The operator's button is not bound by the weekly interval, but two clicks a minute apart are a mistake. */
const MANUAL_REMINDER_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export type FiscalReminderOutcome = { reminderCount: number; lastReminderAt: Date };

type ReminderRecipient = { id: string; email: string; name: string | null; firstName: string | null };
type ReminderTarget = {
  id: string;
  fiscalReminderCount: number;
  lastFiscalReminderAt: Date | null;
  user: ReminderRecipient;
};
/** `lost`: another sweep or click took the slot. `undelivered`: neither channel went out, slot given back. */
type ReminderSlot = 'sent' | 'lost' | 'undelivered';

/** What `RepairerFiscalAuditLog` records for the n-th reminder; the admin drawer parses the same shape. */
function reminderAuditValue(n: number): string {
  return n === MAX_REMINDERS ? `relance_${n}_freeze_warning` : `relance_${n}`;
}

export type FiscalRemindersResult = {
  scanned: number;
  reminded1: number;
  reminded2: number;
  /** Already reminded twice: nothing more is sent, the payouts simply stay on hold. */
  frozen: number;
  /** Chosen for a reminder but neither the e-mail nor the notification went out; retried next run. */
  failed: number;
};

type ReminderCopy = {
  subject: (name: string) => string;
  text: (name: string) => string;
  notification: string;
};

// 🛑 The payouts are ALREADY on hold when these go out: the golden rule holds them from the first
// order, not from the second reminder. The wording says so. It used to promise « pour continuer à
// recevoir vos virements » and a future freeze, which was false the day it was written.
const PROFILE_PATH = 'application REVIME, Profil > Statut de vérification > Informations fiscales';
const RELANCES: Record<1 | 2, ReminderCopy> = {
  1: {
    subject: () => 'Vos versements REVIME sont en attente : complétez vos informations fiscales (DAC7)',
    text: (name) =>
      `Bonjour ${name},\n\nConformément à la directive européenne DAC7, REVIME doit déclarer chaque année les sommes versées à ses réparateurs et doit donc disposer de leurs informations fiscales.\n\nTant que ces informations ne sont pas renseignées, aucun versement ne peut vous être effectué. Les sommes qui vous sont dues restent en attente et vous seront versées dès que votre déclaration sera complète.\n\nPour la compléter : ${PROFILE_PATH}.\n\nL'équipe REVIME`,
    notification: 'Complétez vos informations fiscales pour recevoir vos versements.',
  },
  2: {
    subject: () => 'Dernier rappel : vos versements REVIME restent suspendus (DAC7)',
    text: (name) =>
      `Bonjour ${name},\n\nCeci est notre dernier rappel. Vos informations fiscales sont toujours manquantes : vos versements restent suspendus et les sommes dues restent en attente.\n\nElles vous seront versées dès que votre déclaration sera complète. Pour la compléter : ${PROFILE_PATH}.\n\nL'équipe REVIME`,
    notification: 'Dernier rappel : vos versements restent suspendus tant que vos informations fiscales manquent.',
  },
};

@Injectable()
export class FiscalService {
  private readonly logger = new Logger(FiscalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly commandesService: CommandesService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Retrieves legal identity fields and any existing fiscal declaration for the user.
   *
   * 🛑 The name and the date of birth are what REVIME holds on the account, NOT Stripe Identity's
   * verified outputs: nothing in this codebase reads them back from Stripe (the date of birth needs a
   * restricted key and is available for 48 hours only). The screen must not say otherwise. Review
   * RU-27, `ISS-052`.
   */
  async getPreFill(userId: string): Promise<FiscalPreFillResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        firstName: true,
        lastName: true,
        birthDate: true,
      },
    });

    if (!user) {
      throw new AppException('NOT_FOUND', 'Utilisateur introuvable.');
    }

    const declaration = await this.prisma.repairerFiscalDeclaration.findUnique({
      where: { userId },
    });

    const isBirthDateLocked = user.birthDate !== null;

    return {
      legalName: user.name ?? (user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : null),
      firstName: user.firstName,
      lastName: user.lastName,
      birthDate: user.birthDate ? user.birthDate.toISOString() : null,
      isBirthDateLocked,
      declaration: declaration
        ? {
            taxResidence: declaration.taxResidence,
            addressLine: declaration.addressLine,
            postalCode: declaration.postalCode,
            city: declaration.city,
            country: declaration.country,
            nif: declaration.nif,
            hasNoNif: declaration.hasNoNif,
            birthCity: declaration.birthCity,
            birthCountry: declaration.birthCountry,
            submittedAt: declaration.submittedAt.toISOString(),
          }
        : null,
    };
  }

  /**
   * Validates and submits the fiscal declaration (DAC7).
   * Upserts RepairerFiscalDeclaration, writes the audit trail (old value, new value, date: the proof
   * of due diligence), and stamps fiscalCompletedAt on the RepairerProfile, all in ONE transaction.
   */
  async submitDeclaration(userId: string, rawInput: FiscalDeclarationInput): Promise<FiscalPreFillResponse> {
    const input = fiscalDeclarationInputSchema.parse(rawInput);

    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, birthDate: true },
      });

      if (!user) {
        throw new AppException('NOT_FOUND', 'Utilisateur introuvable.');
      }

      // Mandatory birthDate verification: must either already exist on record or be provided in this payload
      if (user.birthDate === null && !input.birthDate) {
        throw new AppException(
          'VALIDATION_FAILED',
          'La date de naissance est obligatoire pour compléter la déclaration fiscale.',
        );
      }

      // The schema checks a date of birth that arrives in the payload. One already on record is never
      // sent, so it is checked here: a verified minor must not complete a declaration either.
      if (user.birthDate !== null && !isAdultBirthDate(user.birthDate)) {
        throw new AppException('VALIDATION_FAILED', UNDERAGE);
      }

      // If user had no birth date on record and one is provided, save it with UTC noon normalization
      if (user.birthDate === null && input.birthDate) {
        const [year, month, day] = input.birthDate.split('-').map(Number) as [number, number, number];
        await tx.user.update({
          where: { id: userId },
          data: { birthDate: new Date(Date.UTC(year, month - 1, day, 12, 0, 0)) },
        });

        await tx.repairerFiscalAuditLog.create({
          data: { userId, fieldName: 'birthDate', oldValue: null, newValue: input.birthDate },
        });
      }

      // The record exactly as it is stored: what is audited is what is written, so a field the
      // declaration discards (a birth city when the NIF is given) is never logged as if it had been kept.
      const next = {
        taxResidence: 'FR',
        addressLine: input.addressLine,
        postalCode: input.postalCode,
        city: input.city,
        country: input.country,
        nif: input.hasNoNif ? null : (input.nif ?? null),
        hasNoNif: input.hasNoNif,
        birthCity: input.hasNoNif ? (input.birthCity ?? null) : null,
        birthCountry: input.hasNoNif ? (input.birthCountry ?? null) : null,
      };

      const existing = await tx.repairerFiscalDeclaration.findUnique({ where: { userId } });

      // Every field that changed, old value and new value. The first submission has no old values, so
      // every stored field is logged as a change from nothing: « initial_submission » alone proved
      // that a declaration existed and not what it said.
      const auditRows: { userId: string; fieldName: string; oldValue: string | null; newValue: string | null }[] =
        [];
      if (!existing) {
        auditRows.push({ userId, fieldName: 'declaration', oldValue: null, newValue: 'initial_submission' });
      }
      for (const [fieldName, value] of Object.entries(next)) {
        const oldValue = existing ? stringOrNull(existing[fieldName as keyof typeof next]) : null;
        const newValue = stringOrNull(value);
        if (oldValue !== newValue) auditRows.push({ userId, fieldName, oldValue, newValue });
      }
      if (auditRows.length > 0) {
        await tx.repairerFiscalAuditLog.createMany({ data: auditRows });
      }

      await tx.repairerFiscalDeclaration.upsert({
        where: { userId },
        create: { userId, ...next },
        update: next,
      });

      // Stamp fiscalCompletedAt on RepairerProfile (step 3 done). `updateMany` so a missing profile is
      // a count of 0 rather than an exception, and 0 rolls the whole declaration back: without a
      // profile nothing could ever read the stamp, and the user would be told it worked.
      const stamped = await tx.repairerProfile.updateMany({
        where: { userId },
        data: { fiscalCompletedAt: new Date() },
      });
      if (stamped.count === 0) {
        throw new AppException('UNPROCESSABLE_ENTITY', NO_REPAIRER_PROFILE);
      }
    });

    // Execute query outside transaction to guarantee committed read isolation
    const preFill = await this.getPreFill(userId);

    // CMP-D3: Automatically unblock and disburse any held payouts now that fiscal info is complete
    this.commandesService.payoutStrandedCommandes(userId).catch((err) => {
      this.logger.error(`Failed to unblock stranded payouts for user ${userId}: ${err?.message ?? err}`);
    });

    return preFill;
  }

  /**
   * CMP-D3: DAC7 fiscal reminders sweep (run by the cron and by the operator's button).
   * Scans individual repairers who have a paid order this year and no completed declaration, and
   * sends them up to two reminders (e-mail and notification), a week apart. Their payouts are on hold
   * from the first order whether or not a reminder went out; the reminders are how they find out.
   */
  async sendFiscalReminders(): Promise<FiscalRemindersResult> {
    const currentYear = new Date().getFullYear();
    const startOfYear = new Date(Date.UTC(currentYear, 0, 1));

    // Find individual repairers with paid/released orders in current year whose fiscal declaration is incomplete
    const candidates = await this.prisma.repairerProfile.findMany({
      where: {
        kind: 'INDIVIDUAL',
        fiscalCompletedAt: null,
        deletedAt: null,
        user: {
          banned: false,
          commandesAsRepairer: {
            some: {
              status: 'PAID',
              OR: [
                { paidAt: { gte: startOfYear } },
                { releasedAt: { gte: startOfYear } },
                { createdAt: { gte: startOfYear } },
              ],
            },
          },
        },
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            firstName: true,
          },
        },
      },
    });

    const result: FiscalRemindersResult = {
      scanned: candidates.length,
      reminded1: 0,
      reminded2: 0,
      frozen: 0,
      failed: 0,
    };

    const now = new Date();
    const waitedLongEnough = new Date(now.getTime() - REMINDER_INTERVAL_MS);

    for (const profile of candidates) {
      const user = profile.user;
      if (!user?.email) continue;

      const sent = profile.fiscalReminderCount;
      if (sent >= MAX_REMINDERS) {
        result.frozen++;
        continue;
      }
      if (sent === 1 && profile.lastFiscalReminderAt && profile.lastFiscalReminderAt > waitedLongEnough) {
        continue; // too soon for the 2nd reminder
      }

      try {
        const slot = await this.sendReminderSlot(profile, now);
        if (slot === 'lost') continue;
        if (slot === 'undelivered') {
          result.failed++;
          continue;
        }
        if (sent === 0) result.reminded1++;
        else result.reminded2++;
      } catch (e) {
        // One réparateur's failure must not stop the others from being reminded.
        this.logger.error(`Fiscal reminder failed for user ${user.id}:`, e);
        result.failed++;
      }
    }

    return result;
  }

  /**
   * The operator's « Relancer pour infos fiscales » on one réparateur's page. The same claim, wording,
   * delivery and audit as {@link sendFiscalReminders}, for the réparateurs the golden rule holds
   * (`isFiscalComplete`, so an approved professional is refused), and every refusal says why.
   */
  async remindOne(userId: string): Promise<FiscalReminderOutcome> {
    const profile = await this.prisma.repairerProfile.findUnique({
      where: { userId },
      select: {
        id: true,
        kind: true,
        fiscalCompletedAt: true,
        fiscalReminderCount: true,
        lastFiscalReminderAt: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            firstName: true,
            profile: { select: { deletedAt: true, verificationLevel: true } },
            businessVerification: { select: { status: true } },
          },
        },
      },
    });
    if (!profile) {
      throw new AppException('UNPROCESSABLE_ENTITY', "Cet utilisateur n'est pas un réparateur.");
    }
    if (profile.user.profile?.deletedAt) {
      throw new AppException('UNPROCESSABLE_ENTITY', 'Ce compte est supprimé.');
    }
    if (
      isFiscalComplete({
        kind: profile.kind,
        fiscalCompletedAt: profile.fiscalCompletedAt,
        verificationLevel: profile.user.profile?.verificationLevel,
        businessStatus: profile.user.businessVerification?.status,
      })
    ) {
      throw new AppException(
        'UNPROCESSABLE_ENTITY',
        'Les informations fiscales de cet utilisateur sont déjà complètes.',
      );
    }

    const now = new Date();
    if (
      profile.lastFiscalReminderAt &&
      now.getTime() - profile.lastFiscalReminderAt.getTime() < MANUAL_REMINDER_COOLDOWN_MS
    ) {
      throw new AppException('TOO_MANY_REQUESTS', 'Une relance a déjà été envoyée il y a moins de 24 heures.');
    }

    const slot = await this.sendReminderSlot(profile, now);
    if (slot === 'lost') {
      throw new AppException('CONFLICT', "Une relance vient d'être envoyée à ce réparateur.");
    }
    if (slot === 'undelivered') {
      throw new AppException(
        'SERVICE_UNAVAILABLE',
        "La relance n'a pas pu être envoyée (ni l'e-mail ni la notification). Réessayez plus tard.",
      );
    }
    return { reminderCount: profile.fiscalReminderCount + 1, lastReminderAt: now };
  }

  /**
   * Claim the next reminder slot, deliver it, audit it. The slot is claimed BEFORE sending, on the count
   * we read: two overlapping sweeps (the cron and the operator's button) read the same count and only
   * one claim can match it, so only one sends. The copy is the n-th reminder's, from the second on the
   * « dernier rappel ».
   */
  private async sendReminderSlot(profile: ReminderTarget, now: Date): Promise<ReminderSlot> {
    const sent = profile.fiscalReminderCount;
    const claimed = await this.prisma.repairerProfile.updateMany({
      where: { id: profile.id, fiscalReminderCount: sent },
      data: { fiscalReminderCount: sent + 1, lastFiscalReminderAt: now },
    });
    if (claimed.count === 0) return 'lost';

    const delivered = await this.deliver(profile.user, RELANCES[Math.min(sent + 1, MAX_REMINDERS) as 1 | 2]);
    if (!delivered) {
      // Neither channel went out. Give the slot back so the next run tries again, instead of
      // recording a reminder the réparateur never received.
      await this.prisma.repairerProfile.updateMany({
        where: { id: profile.id, fiscalReminderCount: sent + 1 },
        data: { fiscalReminderCount: sent, lastFiscalReminderAt: profile.lastFiscalReminderAt },
      });
      return 'undelivered';
    }

    await this.prisma.repairerFiscalAuditLog.create({
      data: {
        userId: profile.user.id,
        fieldName: 'reminder',
        oldValue: sent === 0 ? null : reminderAuditValue(sent),
        newValue: reminderAuditValue(sent + 1),
      },
    });
    return 'sent';
  }

  /** E-mail and in-app notification. True when at least one of the two went out. */
  private async deliver(
    user: ReminderRecipient,
    copy: ReminderCopy,
  ): Promise<boolean> {
    const recipientName = user.firstName || user.name || 'Réparateur';
    let delivered = false;

    try {
      // Strict: Resend RETURNS a refusal instead of throwing, and without `strict` a refused e-mail
      // counted as delivered (the reminder was then recorded and never re-sent).
      await mailSender().send(
        {
          to: user.email,
          subject: copy.subject(recipientName),
          text: copy.text(recipientName),
        },
        { strict: true },
      );
      delivered = true;
    } catch (e) {
      this.logger.error(`Failed to send fiscal reminder e-mail to ${user.email}:`, e);
    }

    try {
      await this.notificationsService.emit({
        userId: user.id,
        mode: 'REPAIRER',
        type: 'FISCAL_DECLARATION_REQUIRED',
        actorName: 'REVIME',
        subject: copy.notification,
      });
      delivered = true;
    } catch (e) {
      this.logger.error(`Failed to emit fiscal reminder notification to ${user.id}:`, e);
    }

    return delivered;
  }
}

function stringOrNull(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}
