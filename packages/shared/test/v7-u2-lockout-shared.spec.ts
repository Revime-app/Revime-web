import { describe, expect, it } from 'vitest';
import {
  ADMIN_ALERT_TARGET_TYPES,
  ADMIN_ALERT_TYPE_LABELS,
  ADMIN_ALERT_TYPES,
  ADMIN_AUDIT_ACTION_LABEL,
  adminAuditActionSchema,
  authErrorMessageFr,
} from '../src/index.js';

/** V7 A11 / D3 (U2): the shared vocabulary of the lock-out. */
describe('V7 U2 shared lock-out vocabulary', () => {
  it('has the two security alert types, with labels', () => {
    expect(ADMIN_ALERT_TYPES).toEqual(expect.arrayContaining(['ACCOUNT_LOCKED', 'IP_BLOCKED']));
    expect(ADMIN_ALERT_TYPE_LABELS.ACCOUNT_LOCKED).toMatchObject({ label: 'Compte bloqué', defaultSeverity: 'HIGH' });
    expect(ADMIN_ALERT_TYPE_LABELS.IP_BLOCKED).toMatchObject({ label: 'Adresse IP bloquée', defaultSeverity: 'MEDIUM' });
  });

  it('lets an alert target a user or an IP address', () => {
    expect(ADMIN_ALERT_TARGET_TYPES).toEqual(expect.arrayContaining(['User', 'IpAddress']));
  });

  it('audits the admin unlock', () => {
    expect(adminAuditActionSchema.safeParse('user.unlock_login').success).toBe(true);
    expect(ADMIN_AUDIT_ACTION_LABEL['user.unlock_login']).toBe('Déblocage de connexion');
  });

  it('gives the app a lock message with no duration (Q8)', () => {
    expect(authErrorMessageFr('TOO_MANY_REQUESTS')).toBe(
      'Trop de tentatives. Votre compte est temporairement bloqué. Réessayez plus tard ou réinitialisez votre mot de passe.',
    );
  });
});
