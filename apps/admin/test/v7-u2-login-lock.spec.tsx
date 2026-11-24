import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import type { AdminUserLoginLock } from '@revime/shared';
import { LoginLockBlock } from '../components/LoginLockBlock';
import { signInErrorMessageFr } from '../lib/login-lock-message';

/** V7 A11 / D3 (U2): the dashboard's view of a lock-out, and the login page's message. */
const lock: AdminUserLoginLock = {
  active: [{ scope: 'LOGIN_ACCOUNT', level: 2, lockedUntil: '2026-10-28T10:15:00.000Z' }],
  history: [
    {
      id: 'ev2',
      scope: 'LOGIN_ACCOUNT',
      level: 2,
      lockedUntil: '2026-10-28T10:15:00.000Z',
      createdAt: '2026-10-28T09:45:00.000Z',
      unlockedAt: null,
      unlockReason: null,
    },
    {
      id: 'ev1',
      scope: 'CODE_ACCOUNT',
      level: 1,
      lockedUntil: '2026-10-27T09:15:00.000Z',
      createdAt: '2026-10-27T09:00:00.000Z',
      unlockedAt: '2026-10-27T09:05:00.000Z',
      unlockReason: 'PASSWORD_RESET',
    },
  ],
};

describe('LoginLockBlock', () => {
  it('states the lock in force in Paris time, with its step', () => {
    const html = renderToString(<LoginLockBlock lock={lock} canUnlock={false} busy={false} onUnlock={() => {}} />);
    expect(html).toContain('Blocage de connexion');
    expect(html).toContain('Connexion par mot de passe bloquée jusqu’au 28/10/2026 à 11:15');
    expect(html).toContain('palier 2');
  });

  it('lists past locks and how each one ended', () => {
    const html = renderToString(<LoginLockBlock lock={lock} canUnlock={false} busy={false} onUnlock={() => {}} />);
    expect(html).toContain('Codes de vérification');
    expect(html).toContain('levé par une réinitialisation du mot de passe');
  });

  it('offers « Débloquer » only to an operator who may, and only while locked', () => {
    const can = renderToString(<LoginLockBlock lock={lock} canUnlock busy={false} onUnlock={() => {}} />);
    expect(can).toContain('data-testid="unlock-login-button"');
    const cannot = renderToString(<LoginLockBlock lock={lock} canUnlock={false} busy={false} onUnlock={() => {}} />);
    expect(cannot).not.toContain('data-testid="unlock-login-button"');
    const notLocked = renderToString(
      <LoginLockBlock lock={{ ...lock, active: [] }} canUnlock busy={false} onUnlock={() => {}} />,
    );
    expect(notLocked).not.toContain('data-testid="unlock-login-button"');
    expect(notLocked).toContain('Aucun blocage en cours.');
  });

  it('renders nothing for an account that was never locked', () => {
    expect(
      renderToString(<LoginLockBlock lock={{ active: [], history: [] }} canUnlock busy={false} onUnlock={() => {}} />),
    ).toBe('');
  });
});

describe('signInErrorMessageFr (Q8: the dashboard shows the real end of the lock)', () => {
  it('gives the end time of a lock', () => {
    expect(
      signInErrorMessageFr({ code: 'TOO_MANY_REQUESTS', lockedUntil: '2026-10-28T10:15:00.000Z' }, 'Connexion impossible.'),
    ).toBe('Trop de tentatives. Compte bloqué jusqu’à 11:15. Réessayez plus tard.');
  });

  it('falls back to the shared text without a time, and to the shared mapping otherwise', () => {
    expect(signInErrorMessageFr({ code: 'TOO_MANY_REQUESTS' }, 'x')).toBe(
      'Trop de tentatives. Votre compte est temporairement bloqué. Réessayez plus tard ou réinitialisez votre mot de passe.',
    );
    expect(signInErrorMessageFr({ code: 'INVALID_EMAIL_OR_PASSWORD' }, 'x')).toBe('Adresse e-mail ou mot de passe incorrect.');
    expect(signInErrorMessageFr(null, 'Connexion impossible.')).toBe('Connexion impossible.');
  });
});

describe('LoginLockBlock, U2b « Ce n’est pas moi » line', () => {
  it('shows a secured account as its own line, not as a lock', () => {
    const html = renderToString(
      <LoginLockBlock
        lock={{
          active: [],
          history: [
            {
              id: 'ev3',
              kind: 'SECURED',
              scope: 'LOGIN_ACCOUNT',
              level: 0,
              lockedUntil: '2026-10-28T09:45:00.000Z',
              createdAt: '2026-10-28T09:45:00.000Z',
              unlockedAt: null,
              unlockReason: null,
            },
          ],
        }}
        canUnlock
        busy={false}
        onUnlock={() => {}}
      />,
    );
    expect(html).toContain('28/10/2026 à 10:45 · sécurisé par l’utilisateur (« Ce n’est pas moi »)');
    expect(html).not.toContain('palier 0');
  });
});
