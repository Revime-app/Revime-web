import { afterEach, describe, expect, it, vi } from 'vitest';
import { UsersController } from '../src/users/users.controller.js';
import { ConnectController } from '../src/connect/connect.controller.js';
import { SecurityController } from '../src/security/security.controller.js';
import { assertChangeEmailSteppedUp } from '../src/security/step-up-hook.js';
import { AppException } from '../src/common/app-exception.js';

/**
 * V7 A11 (U2b, Q6 / Q8). Where the step-up is demanded: deleting the account and changing an IBAN
 * already on file only once `STEP_UP_ENFORCED=true` (flipped at delivery of the end-of-round build),
 * the dashboard's e-mail change always. And the « Ce n'est pas moi » page's two halves.
 */
const session = { session: { id: 'sess-1' }, user: { id: 'u1', email: 'ana@example.com' } } as never;
const refused = new AppException('STEP_UP_REQUIRED', 'Confirmez votre identité pour continuer.');

afterEach(() => {
  delete process.env.STEP_UP_ENFORCED;
});

function users() {
  const service = { deleteAccount: vi.fn(async () => {}) };
  // Amended 2026-11-20 (V9 U3): the controller now asks `assertDeletionConfirmed`, which keeps this rule
  // while `STEP_UP_PROVIDER_ENFORCED` is off (its own spec: v9-u3-provider-step-up.spec.ts).
  const security = {
    assertSteppedUp: vi.fn(async (_sessionId: string) => Promise.reject(refused)),
    assertDeletionConfirmed: vi.fn(async ({ sessionId }: { sessionId: string }) => {
      if (process.env.STEP_UP_ENFORCED === 'true') await security.assertSteppedUp(sessionId);
      return null;
    }),
  };
  return { controller: new UsersController(service as never, security as never), service, security };
}

function connect(ibanLast4: string | null) {
  const service = { startOnboarding: vi.fn(async () => ({ url: 'x' })), hasIbanOnFile: vi.fn(async () => ibanLast4 !== null) };
  const security = { assertSteppedUp: vi.fn(async () => Promise.reject(refused)) };
  return { controller: new ConnectController(service as never, security as never), service, security };
}

describe('account deletion', () => {
  it('needs no step-up until the switch is on (today’s builds keep working, Q8)', async () => {
    const t = users();
    await t.controller.deleteAccount(session);
    expect(t.security.assertSteppedUp).not.toHaveBeenCalled();
    expect(t.service.deleteAccount).toHaveBeenCalledWith('u1', { revoke: { source: 'SELF', confirmation: null } });
  });

  it('is refused without a fresh step-up once the switch is on', async () => {
    process.env.STEP_UP_ENFORCED = 'true';
    const t = users();
    await expect(t.controller.deleteAccount(session)).rejects.toBe(refused);
    expect(t.security.assertSteppedUp).toHaveBeenCalledWith('sess-1');
    expect(t.service.deleteAccount).not.toHaveBeenCalled();
  });
});

describe('payout setup', () => {
  it('changing an IBAN on file needs the step-up once the switch is on', async () => {
    process.env.STEP_UP_ENFORCED = 'true';
    const t = connect('1234');
    await expect(t.controller.onboarding(session)).rejects.toBe(refused);
    expect(t.service.startOnboarding).not.toHaveBeenCalled();
  });

  it('the first setup, with no IBAN yet, needs nothing (Q6)', async () => {
    process.env.STEP_UP_ENFORCED = 'true';
    const t = connect(null);
    await t.controller.onboarding(session);
    expect(t.security.assertSteppedUp).not.toHaveBeenCalled();
    expect(t.service.startOnboarding).toHaveBeenCalledWith('u1');
  });

  it('needs nothing while the switch is off', async () => {
    const t = connect('1234');
    await t.controller.onboarding(session);
    expect(t.service.hasIbanOnFile).not.toHaveBeenCalled();
  });
});

describe('the dashboard’s e-mail change (always enforced)', () => {
  it('is refused with STEP_UP_REQUIRED without a fresh step-up, and passes with one', async () => {
    const ctx = { path: '/change-email' };
    await expect(assertChangeEmailSteppedUp(ctx, 'sess-1', async () => false)).rejects.toMatchObject({
      statusCode: 403,
      body: { code: 'STEP_UP_REQUIRED' },
    });
    await expect(assertChangeEmailSteppedUp(ctx, 'sess-1', async () => true)).resolves.toBeUndefined();
    await expect(assertChangeEmailSteppedUp({ path: '/sign-in/email' }, null, async () => false)).resolves.toBeUndefined();
  });
});

describe('the « Ce n’est pas moi » page', () => {
  function page(valid: boolean, result: { ok: false } | { ok: true; hadPassword: boolean } = { ok: true, hadPassword: true }) {
    const security = { checkNotMeToken: vi.fn(async () => valid), notMe: vi.fn(async () => result) };
    return { controller: new SecurityController(security as never), security };
  }

  it('shows a confirmation form and changes nothing on open', async () => {
    const t = page(true);
    const html = await t.controller.notMePage('T'.repeat(32));
    expect(html).toContain('<form method="post"');
    expect(html).toContain('Sécuriser mon compte');
    expect(html).toContain(`value="${'T'.repeat(32)}"`);
    expect(t.security.notMe).not.toHaveBeenCalled();
  });

  it('says the link is no longer valid', async () => {
    expect(await page(false).controller.notMePage('x')).toContain('Ce lien n’est plus valable');
  });

  it('acts on the button, and says what happened', async () => {
    const t = page(true);
    const html = await t.controller.notMeConfirm({ token: 'T'.repeat(32) });
    expect(t.security.notMe).toHaveBeenCalledWith('T'.repeat(32));
    expect(html).toContain('Votre compte est sécurisé');
    expect(html).toContain('un e-mail pour choisir un nouveau mot de passe');
    expect(await page(true, { ok: true, hadPassword: false }).controller.notMeConfirm({ token: 'T'.repeat(32) })).toContain(
      'Google ou Apple',
    );
    expect(await page(true, { ok: false }).controller.notMeConfirm({ token: 'x' })).toContain('Ce lien n’est plus valable');
  });

  it('escapes the token it echoes', async () => {
    const html = await page(true).controller.notMePage('"><script>');
    expect(html).not.toContain('"><script>');
  });
});

describe('the error body', () => {
  it('keeps STEP_UP_REQUIRED, which shares its 403 with FORBIDDEN', async () => {
    const { AllExceptionsFilter } = await import('../src/common/http-exception.filter.js');
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const host = { switchToHttp: () => ({ getResponse: () => res }) };
    new AllExceptionsFilter().catch(refused, host as never);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'STEP_UP_REQUIRED', message: 'Confirmez votre identité pour continuer.' },
    });
  });
});
