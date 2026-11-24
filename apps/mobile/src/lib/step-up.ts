import { ApiError } from './api';

/**
 * V7 A11 (U2b). « Confirm, then try again » around a sensitive call. The API answers
 * `STEP_UP_REQUIRED` (403) to account deletion and to an IBAN change when this session has not
 * confirmed its password in the last 10 minutes; `confirm` opens the sheet (`StepUpSheet`) and
 * resolves true once the server has stamped the session, false if the user closed it.
 *
 * One retry only: a second refusal is a real error, never a loop of sheets.
 */
export type StepUpResult<T> = { ok: true; value: T } | { ok: false; cancelled: true };

export function isStepUpRequired(err: unknown): boolean {
  return err instanceof ApiError && err.code === 'STEP_UP_REQUIRED';
}

export async function runWithStepUp<T>(call: () => Promise<T>, confirm: () => Promise<boolean>): Promise<StepUpResult<T>> {
  try {
    return { ok: true, value: await call() };
  } catch (err) {
    if (!isStepUpRequired(err)) throw err;
  }
  if (!(await confirm())) return { ok: false, cancelled: true };
  return { ok: true, value: await call() };
}
