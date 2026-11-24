'use client';

import { resolveApiErrorMessage } from '@revime/shared';
import { DEMO } from './config';
import { demoGet, demoPost } from './demo-data';

/**
 * Same-origin calls: `/api/v1/*` is proxied to the API by next.config.ts, so the browser sends the
 * first-party session cookie and the API sees the site's Origin. Errors carry the API's French
 * message, resolved by the same helper the app uses.
 */
const BASE = '/api/v1';

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status?: number,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  if (DEMO) {
    const method = init?.method ?? 'GET';
    if (method === 'GET') return demoGet<T>(path);
    return demoPost<T>(path, init?.body ? JSON.parse(String(init.body)) : undefined);
  }
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    const resolved = resolveApiErrorMessage(body, res.status);
    throw new ApiError(resolved.code, resolved.message, res.status, resolved.fields);
  }
  if (res.status === 204) return null as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => call<T>(path),
  post: <T>(path: string, body: unknown) => call<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) => call<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
};

/** A French message for anything thrown by a call. */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  return 'Connexion impossible. Vérifiez votre réseau et réessayez.';
}
