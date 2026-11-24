import { describe, expect, it } from 'vitest';
import { scrubMonitoringEvent } from '../src/monitoring-scrub';

/**
 * REVIME_APP_PUBLICATION_PREPARATION.md PUB-31. Every error report the app or the API sends to Sentry
 * goes through this function first, so personal data never leaves for a third party in a crash
 * report: the Data safety and App Privacy answers say crash data is collected, nothing more.
 */
describe('scrubMonitoringEvent', () => {
  it('redacts e-mail addresses wherever they appear in text', () => {
    const out = scrubMonitoringEvent({
      message: 'Send failed for marie.dupont@example.fr',
      exception: { values: [{ value: 'Duplicate key: jean@revime.fr' }] },
      breadcrumbs: [{ message: 'login jean@revime.fr' }],
    });
    const text = JSON.stringify(out);
    expect(text).not.toContain('marie.dupont@example.fr');
    expect(text).not.toContain('jean@revime.fr');
    expect(out.message).toBe('Send failed for [email]');
  });

  it('redacts French phone numbers and IBANs', () => {
    const out = scrubMonitoringEvent({
      message: 'phone +33 6 12 34 56 78 and 0612345678, iban FR76 3000 6000 0112 3456 7890 189',
    });
    expect(out.message).not.toMatch(/6 12 34 56 78|0612345678|FR76/);
    expect(out.message).toContain('[phone]');
    expect(out.message).toContain('[iban]');
  });

  it('drops values under sensitive keys, at any depth', () => {
    const out = scrubMonitoringEvent({
      extra: {
        body: { password: 'hunter2', nif: '1234567890123', birthDate: '1990-01-01', city: 'Paris' },
        headers: { Authorization: 'Bearer abc.def', cookie: 'session=xyz', 'x-request-id': 'r1' },
        token: 'tok_123',
      },
    }) as { extra: { body: Record<string, unknown>; headers: Record<string, unknown>; token: unknown } };
    expect(out.extra.body.password).toBe('[redacted]');
    expect(out.extra.body.nif).toBe('[redacted]');
    expect(out.extra.body.birthDate).toBe('[redacted]');
    expect(out.extra.body.city).toBe('Paris');
    expect(out.extra.headers.Authorization).toBe('[redacted]');
    expect(out.extra.headers.cookie).toBe('[redacted]');
    expect(out.extra.headers['x-request-id']).toBe('r1');
    expect(out.extra.token).toBe('[redacted]');
  });

  it('keeps only the user id', () => {
    const out = scrubMonitoringEvent({
      user: { id: 'u_1', email: 'a@b.fr', username: 'marie', ip_address: '1.2.3.4' },
    });
    expect(out.user).toEqual({ id: 'u_1' });
  });

  it('drops request bodies, cookies and query strings but keeps the method and path', () => {
    const out = scrubMonitoringEvent({
      request: {
        method: 'POST',
        url: 'https://api.revime.fr/api/v1/fiscal?email=a@b.fr',
        data: { iban: 'FR7630006000011234567890189' },
        cookies: { session: 'x' },
        query_string: 'email=a@b.fr',
        headers: { authorization: 'Bearer t', 'user-agent': 'Revime/45' },
      },
    }) as { request: Record<string, unknown> };
    expect(out.request.method).toBe('POST');
    expect(out.request.url).toBe('https://api.revime.fr/api/v1/fiscal');
    expect(out.request.data).toBeUndefined();
    expect(out.request.cookies).toBeUndefined();
    expect(out.request.query_string).toBeUndefined();
    expect((out.request.headers as Record<string, unknown>).authorization).toBe('[redacted]');
    expect((out.request.headers as Record<string, unknown>)['user-agent']).toBe('Revime/45');
  });

  it('keeps the parts that make a report useful', () => {
    const event = {
      level: 'error',
      exception: {
        values: [
          {
            type: 'TypeError',
            value: "Cannot read properties of undefined (reading 'id')",
            stacktrace: { frames: [{ filename: 'app:///demande.tsx', lineno: 42 }] },
          },
        ],
      },
      tags: { route: '/demande/[id]' },
    };
    expect(scrubMonitoringEvent(event)).toEqual(event);
  });

  it('does not change the event it was given', () => {
    const event = { message: 'x@y.fr', user: { id: 'u', email: 'x@y.fr' } };
    const copy = JSON.parse(JSON.stringify(event));
    scrubMonitoringEvent(event);
    expect(event).toEqual(copy);
  });

  it('survives a reference cycle', () => {
    const a: Record<string, unknown> = { message: 'cycle' };
    a.self = a;
    expect(() => scrubMonitoringEvent(a)).not.toThrow();
  });
});
