import { describe, expect, it } from 'vitest';
import { NAME_MAX_LENGTH, profileNameInput } from '../lib/settings';

/** « Paramètres » › Profil: the staff member's own first / last name. */
describe('profileNameInput', () => {
  it('trims and builds the display name from first and last name', () => {
    expect(profileNameInput('  Malek ', ' Klimane  ')).toEqual({
      ok: true,
      data: { firstName: 'Malek', lastName: 'Klimane', name: 'Malek Klimane' },
    });
  });

  it('accepts a first name alone', () => {
    expect(profileNameInput('Malek', '   ')).toEqual({
      ok: true,
      data: { firstName: 'Malek', lastName: '', name: 'Malek' },
    });
  });

  it('collapses inner whitespace', () => {
    expect(profileNameInput('Jean   Pierre', 'de  la Tour')).toEqual({
      ok: true,
      data: { firstName: 'Jean Pierre', lastName: 'de la Tour', name: 'Jean Pierre de la Tour' },
    });
  });

  it('requires a first name', () => {
    expect(profileNameInput('  ', 'Klimane')).toEqual({ ok: false, error: 'Saisissez votre prénom.' });
  });

  it('rejects a name that is too long', () => {
    const long = 'a'.repeat(NAME_MAX_LENGTH + 1);
    expect(profileNameInput(long, '')).toEqual({
      ok: false,
      error: `Le prénom et le nom font au plus ${NAME_MAX_LENGTH} caractères chacun.`,
    });
    expect(profileNameInput('Malek', long).ok).toBe(false);
  });
});
