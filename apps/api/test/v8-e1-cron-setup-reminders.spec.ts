import { describe, expect, it, vi } from 'vitest';
import { CronService } from '../src/cron/cron.service.js';

/** V8 E1. The cron runs the setup reminders, after the DAC7 reminders, and reports the sweep's own counts. */
function cronWith(setupReminders: object) {
  return new CronService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    setupReminders as never,
  );
}

describe('CronService, setup reminders (V8 E1)', () => {
  it('run() includes setupReminders right after fiscalReminders and reports its counts', async () => {
    const sweep = vi.fn().mockResolvedValue({ scanned: 4, acted: 2, failed: 1 });
    const cron = cronWith({ sweep });
    const names: string[] = [];
    vi.spyOn(cron as never as { guard: (...a: unknown[]) => unknown }, 'guard').mockImplementation(
      async (job: unknown, body: unknown) => {
        names.push(job as string);
        if (job === 'setupReminders') return { job, error: null, ...(await (body as () => Promise<object>)()) };
        return { job, error: null, scanned: 0, acted: 0, failed: 0 };
      },
    );

    const res = await cron.run();

    expect(names.indexOf('setupReminders')).toBe(names.indexOf('fiscalReminders') + 1);
    expect(res.jobs.find((j) => j.job === 'setupReminders')).toMatchObject({ scanned: 4, acted: 2, failed: 1 });
    expect(sweep).toHaveBeenCalledTimes(1);
  });
});
