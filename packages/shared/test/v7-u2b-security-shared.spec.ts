import { describe, expect, it } from 'vitest';
import {
  ADMIN_ALERT_TYPE_LABELS,
  ADMIN_ALERT_TYPES,
  API_ERROR_CODES,
  DEVICE_ID_HEADER,
  DEVICE_LABEL_HEADER,
  STEP_UP_REQUIRED_MESSAGE_FR,
  stepUpCodeSchema,
  stepUpPasswordSchema,
} from '../src/index.js';

/** V7 A11 (U2b): the shared vocabulary of new devices and the step-up. */
describe('V7 U2b shared security vocabulary', () => {
  it('has the « Ce n’est pas moi » alert type', () => {
    expect(ADMIN_ALERT_TYPES).toContain('ACCOUNT_SECURED');
    expect(ADMIN_ALERT_TYPE_LABELS.ACCOUNT_SECURED).toMatchObject({ label: 'Compte sécurisé par l’utilisateur', defaultSeverity: 'HIGH' });
  });

  it('names the device headers the app sends', () => {
    expect(DEVICE_ID_HEADER).toBe('x-revime-device');
    expect(DEVICE_LABEL_HEADER).toBe('x-revime-device-label');
  });

  it('has an error code the app can recognise as « confirm your password »', () => {
    expect(API_ERROR_CODES).toContain('STEP_UP_REQUIRED');
    expect(STEP_UP_REQUIRED_MESSAGE_FR).toBe('Confirmez votre identité pour continuer.');
  });

  it('validates the two step-up answers', () => {
    expect(stepUpPasswordSchema.safeParse({ password: 'x' }).success).toBe(true);
    expect(stepUpPasswordSchema.safeParse({ password: '' }).success).toBe(false);
    expect(stepUpCodeSchema.safeParse({ code: '123456' }).success).toBe(true);
    expect(stepUpCodeSchema.safeParse({ code: '12345' }).success).toBe(false);
    expect(stepUpCodeSchema.safeParse({ code: '12a456' }).success).toBe(false);
  });
});
