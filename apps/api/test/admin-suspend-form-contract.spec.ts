import { describe, expect, it } from 'vitest';
import {
  adminSuspendRepairerSchema,
  adminSuspendUserSchema,
  toApiDateTime,
} from '@revime/shared';

/**
 * 🛑 THE ONE TEST THAT SPANS THE ADMIN APP AND THE API - roadmap follow-up #5.
 *
 * B1 shipped a Critical here: the suspend form sent the raw `datetime-local` value, which
 * `z.iso.datetime()` REJECTS, so « suspendre temporairement » had never worked. No test could
 * have caught it, because the api specs exercised the schema with the `…Z` form while the UI
 * sent the naive one. Two review seats then analysed the semantics of a value the schema
 * threw out before any comparison ran.
 *
 * This is not an integration harness. It is a contract test on one seam: the form's own
 * conversion function, against the schema that receives it.
 *
 * ## Operational note
 *
 * `toApiDateTime` lives in `packages/shared`, which means changes to it require
 * `npm run build -w @revime/shared` before this test picks them up. A developer editing the
 * conversion and running only `npm run test:unit -w @revime/api` will get a **stale pass**
 * from the old built version. This is standard for the monorepo but worth stating explicitly
 * when debugging a failure.
 */
describe('the admin suspend form produces what the API accepts', () => {
  const browserValue = '2099-12-25T14:30';

  it('converts a datetime-local value into something both schemas accept', () => {
    const sent = toApiDateTime(browserValue);
    expect(
      adminSuspendRepairerSchema.safeParse({ reason: 'Propos abusifs', until: sent }).success,
    ).toBe(true);
    expect(
      adminSuspendUserSchema.safeParse({ reason: 'Propos abusifs', until: sent }).success,
    ).toBe(true);
  });

  /**
   * 🛑 `reason` MUST STAY AT THREE CHARACTERS OR LONGER, AND THAT IS THE WHOLE POINT OF THIS
   * TEST. Both schemas require `reason.min(3)`, so the original `reason: 'x'` made these two
   * assertions fail on the **reason** and never reach `until` at all - the gate written to
   * catch B1's Critical passed for a reason unrelated to the Critical, and a *valid* converted
   * datetime passed it too. Verified by running it both ways: with a three-character reason a
   * valid `until` flips both assertions to `true` and the test fails, which is the proof it is
   * load-bearing.
   *
   * This is the same defect a ruling caught in Task 2's brief - same `'x'`, same two schemas,
   * same `toBe(false)` lines - recurring ten tasks later INSIDE the gate written to prevent the
   * class. Do not shorten `reason` here for any reason.
   */
  it('and the RAW browser value is refused, which is why the conversion exists', () => {
    expect(
      adminSuspendRepairerSchema.safeParse({ reason: 'xxx', until: browserValue }).success,
    ).toBe(false);
    expect(
      adminSuspendUserSchema.safeParse({ reason: 'xxx', until: browserValue }).success,
    ).toBe(false);
  });
});
