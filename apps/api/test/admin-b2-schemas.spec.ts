import { describe, expect, it } from 'vitest';
import {
  adminAuditActionSchema,
  adminRevokeVerificationSchema,
  adminSuspendRepairerSchema,
  ADMIN_AUDIT_ACTION_LABEL,
  VERIFICATION_QUEUE_KIND_LABEL,
} from '@revime/shared';

describe("B2's four audit actions", () => {
  const added = [
    'repairer.verification_revoke',
    'repairer.verification_restore',
    'repairer.suspend',
    'repairer.reactivate',
  ] as const;

  it('are members of the enum', () => {
    for (const a of added) expect(adminAuditActionSchema.parse(a)).toBe(a);
  });

  /**
   * Every action needs French, and the Record type makes a missing key a compile error -
   * so this asserts the values are non-empty, which the type cannot.
   */
  it('each have a non-empty French label', () => {
    for (const a of added) expect(ADMIN_AUDIT_ACTION_LABEL[a].length).toBeGreaterThan(0);
  });
});

describe('adminSuspendRepairerSchema', () => {
  it('requires a reason of at least 3 characters', () => {
    expect(adminSuspendRepairerSchema.safeParse({ reason: 'ab' }).success).toBe(false);
    expect(adminSuspendRepairerSchema.safeParse({ reason: 'Propos abusifs' }).success).toBe(true);
  });

  it('treats an absent until as an indefinite suspension', () => {
    const out = adminSuspendRepairerSchema.parse({ reason: 'Propos abusifs' });
    expect(out.until).toBeUndefined();
  });

  /**
   * 🛑 B2 GUARD 4, AND THIS IS B1'S CRITICAL HANDED FORWARD. B1's suspend form sent a naive
   * `datetime-local` value, which z.iso.datetime() REJECTS, so « suspendre temporairement »
   * had never worked and two review seats analysed the semantics of a value the schema threw
   * out before any comparison ran.
   *
   * So this asserts BOTH directions on the string the browser actually produces: the raw
   * input value is refused, and the value after the form's own
   * `new Date(v).toISOString()` conversion is accepted.
   */
  it('rejects a raw datetime-local value and accepts the form-converted one', () => {
    const raw = '2099-12-25T14:30';
    expect(adminSuspendRepairerSchema.safeParse({ reason: 'xxx', until: raw }).success).toBe(false);
    const converted = new Date(raw).toISOString();
    expect(adminSuspendRepairerSchema.safeParse({ reason: 'xxx', until: converted }).success).toBe(true);
  });

  it('refuses a past expiry', () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(adminSuspendRepairerSchema.safeParse({ reason: 'xxx', until: past }).success).toBe(false);
  });
});

describe('adminRevokeVerificationSchema', () => {
  it('requires a reason, because the audit row is the only record of why', () => {
    expect(adminRevokeVerificationSchema.safeParse({}).success).toBe(false);
    expect(adminRevokeVerificationSchema.safeParse({ reason: 'Faux document' }).success).toBe(true);
  });
});

describe('VERIFICATION_QUEUE_KIND_LABEL', () => {
  it('covers all four row kinds with French', () => {
    for (const k of ['level_unbacked', 'identity_stuck', 'registry_refused', 'fraud_signal'] as const) {
      expect(VERIFICATION_QUEUE_KIND_LABEL[k].length).toBeGreaterThan(0);
    }
  });
});
