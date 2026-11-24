import { describe, expect, it } from 'vitest';
import {
  PUSH_PREVIEW_MAX,
  notificationTypeSchema,
  pushMessageFor,
  pushPlatformSchema,
  pushTokenSchema,
  registerPushTokenSchema,
  truncatePreview,
  type NotificationCopyInput,
  type PushRoutingIds,
} from '@revime/shared';

/**
 * Spec §6 and §11. The push body is `notificationCopy().sub`, so this does not re-test the
 * French - `notification-copy.spec.ts` owns that. It pins what is NEW: every type produces a
 * non-empty title and body with no leaked `undefined`/`null`/`NaN`, the preview truncates on
 * code points, and `data` carries exactly the six routing keys with `null` for absence.
 */
const base: NotificationCopyInput & PushRoutingIds = {
  mode: 'CLIENT',
  type: 'OFFER_RECEIVED',
  actorName: null,
  subject: null,
  amountCents: null,
  // COMMANDE_STEP's copy is keyed on the step, so the sweep below gives it a real one.
  step: 'REPAIR_STARTED',
  messagePreview: null,
  demandeId: null,
  commandeId: null,
  conversationId: null,
};

describe('pushMessageFor - every type, both modes, every snapshot null', () => {
  for (const type of notificationTypeSchema.options) {
    for (const mode of ['CLIENT', 'REPAIRER'] as const) {
      it(`${type} / ${mode} yields a title and a body that leak nothing`, () => {
        const m = pushMessageFor({ ...base, type, mode }, null);
        expect(m.title.length).toBeGreaterThan(0);
        expect(m.body.length).toBeGreaterThan(0);
        for (const leak of ['undefined', 'null', 'NaN']) {
          expect(m.title).not.toContain(leak);
          expect(m.body).not.toContain(leak);
        }
      });
    }
  }
});

describe('pushMessageFor - data', () => {
  it('carries exactly the six routing keys, ids verbatim, id of the row when given', () => {
    const m = pushMessageFor(
      {
        ...base,
        type: 'MESSAGE_RECEIVED',
        conversationId: 'c1',
        demandeId: 'd1',
      },
      'n1',
    );
    expect(m.data).toEqual({
      notificationId: 'n1',
      type: 'MESSAGE_RECEIVED',
      mode: 'CLIENT',
      demandeId: 'd1',
      commandeId: null,
      conversationId: 'c1',
    });
    expect(Object.keys(m.data).sort()).toEqual(
      [
        'commandeId',
        'conversationId',
        'demandeId',
        'mode',
        'notificationId',
        'type',
      ].sort(),
    );
  });

  it('uses the message preview as the body, and falls back to « Nouveau message »', () => {
    const withPreview = pushMessageFor(
      {
        ...base,
        type: 'MESSAGE_RECEIVED',
        actorName: 'Karim R.',
        messagePreview: "C'est prêt !",
      },
      null,
    );
    expect(withPreview.title).toBe('Message de Karim R.');
    expect(withPreview.body).toBe("C'est prêt !");

    const without = pushMessageFor(
      { ...base, type: 'MESSAGE_RECEIVED', messagePreview: null },
      null,
    );
    expect(without.body).toBe('Nouveau message');
  });
});

describe('truncatePreview', () => {
  it('returns null for null, undefined and whitespace', () => {
    expect(truncatePreview(null)).toBeNull();
    expect(truncatePreview(undefined)).toBeNull();
    expect(truncatePreview('   ')).toBeNull();
  });

  it('leaves a short preview alone, trimmed', () => {
    expect(truncatePreview('  Bonjour  ')).toBe('Bonjour');
  });

  it('cuts a long preview to PUSH_PREVIEW_MAX code points ending in an ellipsis', () => {
    const out = truncatePreview('a'.repeat(300))!;
    expect(Array.from(out)).toHaveLength(PUSH_PREVIEW_MAX);
    expect(out.endsWith('…')).toBe(true);
  });

  it('never splits a surrogate pair at the cut', () => {
    // The 120th code point is an astral-plane emoji: a UTF-16 `.slice` would cut it in half.
    const out = truncatePreview(
      'a'.repeat(PUSH_PREVIEW_MAX - 1) + '😀' + 'b'.repeat(50),
    )!;
    expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(out)).toBe(false);
    expect(Array.from(out)).toHaveLength(PUSH_PREVIEW_MAX);
  });

  it('keeps an accented ending intact', () => {
    const out = truncatePreview('é'.repeat(130))!;
    expect(out.startsWith('é'.repeat(PUSH_PREVIEW_MAX - 1))).toBe(true);
    expect(out.endsWith('…')).toBe(true);
  });
});

describe('the wire schemas', () => {
  it('accepts both Expo token spellings and refuses anything else', () => {
    expect(
      pushTokenSchema.safeParse('ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]')
        .success,
    ).toBe(true);
    expect(
      pushTokenSchema.safeParse('ExpoPushToken[abc-DEF_123]').success,
    ).toBe(true);
    expect(pushTokenSchema.safeParse('garbage').success).toBe(false);
    expect(pushTokenSchema.safeParse('ExponentPushToken[]').success).toBe(
      false,
    );
    expect(pushTokenSchema.safeParse('ExponentPushToken[a b]').success).toBe(
      false,
    );
    expect(
      pushTokenSchema.safeParse('ExponentPushToken[' + 'a'.repeat(300) + ']')
        .success,
    ).toBe(false);
  });

  it('registerPushTokenSchema needs a platform from the enum', () => {
    expect(
      registerPushTokenSchema.safeParse({
        token: 'ExponentPushToken[abc]',
        platform: 'IOS',
      }).success,
    ).toBe(true);
    expect(
      registerPushTokenSchema.safeParse({
        token: 'ExponentPushToken[abc]',
        platform: 'ios',
      }).success,
    ).toBe(false);
    expect(pushPlatformSchema.options).toEqual(['IOS', 'ANDROID']);
  });
});
