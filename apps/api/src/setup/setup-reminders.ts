import { SETUP_REMINDER_DAYS } from '@revime/shared';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The cron runs every 6 hours at :23 UTC and arrives about 50 minutes late (`reconcile.yml`), so one of its four
 * slots lands around 01:15 in Paris. A « finish your setup » push at that hour is worse than one six hours later:
 * reminders go out only between 08:00 and 21:00 Paris time, the next daytime slot picking up anything due.
 */
export function isParisDaytime(now: Date): boolean {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', hourCycle: 'h23' }).format(now),
  );
  return hour >= 8 && hour < 21;
}

export type ReminderDue = 'NONE' | 'SETTLE' | 'FIRST' | 'SECOND';

/**
 * `DEC8-08` (1), (4). A marker is « settled »: sent, or no longer due. Complete setup settles both and sends
 * nothing, and a marker never reopens, so setup that later drops back is not reminded again. Past 8 days only the
 * 8-day reminder goes; a missed 3-day one is not sent late.
 */
export function reminderDue(
  r: { createdAt: Date; setupReminder3dAt: Date | null; setupReminder8dAt: Date | null; complete: boolean },
  now: Date,
): ReminderDue {
  const owed3 = r.setupReminder3dAt === null;
  const owed8 = r.setupReminder8dAt === null;
  if (!owed3 && !owed8) return 'NONE';
  if (r.complete) return 'SETTLE';
  const age = now.getTime() - r.createdAt.getTime();
  if (owed8 && age >= SETUP_REMINDER_DAYS.second * DAY_MS) return 'SECOND';
  if (owed3 && age >= SETUP_REMINDER_DAYS.first * DAY_MS) return 'FIRST';
  return 'NONE';
}
