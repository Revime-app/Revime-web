import {
  resolveApiErrorMessage,
  type ApiErrorBody,
  type BusinessStatusResponse,
  type LookupCompanyResponse,
  type SubmitBusinessVerificationInput,
} from '@revime/shared';
import { authClient } from './auth-client';
import { signalMaintenanceAnswer } from './maintenance-signal';
import { signalSessionStale } from './session-signal';

const BASE = `${process.env.EXPO_PUBLIC_API_URL}/api/v1`;

export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorBody['error']['code'],
    message: string,
    readonly fields?: Record<string, string>,
    readonly status?: number,
    readonly rawBody?: string,
    readonly statusText?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Session cookie + JSON headers, shared by every request. */
function buildInit(init?: RequestInit): RequestInit {
  // The expoClient plugin adds getCookie() at runtime via getActions
  const client = authClient as typeof authClient & { getCookie?: () => string };
  const cookie = client.getCookie?.();
  return {
    ...init,
    headers: {
      'content-type': 'application/json',
      // The Expo plugin stores the session cookie; this replays it.
      ...(cookie ? { cookie } : {}),
      ...(init?.headers ?? {}),
    },
  };
}

/** Every non-2xx carries the French envelope; turn it into an ApiError. */
export function throwApiError(
  body: unknown,
  status?: number,
  statusText?: string,
  rawBody?: string,
): never {
  const resolved = resolveApiErrorMessage(body, status);
  // V7 D5 (U9, U9b): the gate re-reads the status at once rather than at its next timed read.
  if (resolved.code === 'MAINTENANCE' || resolved.code === 'CGU_REACCEPT_REQUIRED') signalMaintenanceAnswer();
  // V9 B1 (final review #2): the account state is not what this screen thinks; read `me` again.
  if (resolved.code === 'CGU_ACCEPTANCE_REQUIRED' || resolved.code === 'CGU_REACCEPT_REQUIRED') signalSessionStale();
  throw new ApiError(
    resolved.code,
    resolved.message,
    resolved.fields,
    status,
    rawBody,
    statusText,
  );
}

async function handleResponseError(res: Response, method: string, path: string): Promise<never> {
  let body: unknown = null;
  let rawText: string | undefined = undefined;
  try {
    rawText = await res.text();
    body = rawText ? JSON.parse(rawText) : null;
  } catch {
    body = null;
  }
  console.error(`[API ERROR] ${method} ${path} -> HTTP ${res.status} ${res.statusText}`, {
    status: res.status,
    body,
    rawBody: rawText?.slice(0, 300),
  });
  throwApiError(body, res.status, res.statusText, rawText);
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const method = init?.method ?? 'GET';
  const res = await fetch(`${BASE}${path}`, buildInit(init));
  if (!res.ok) {
    return handleResponseError(res, method, path);
  }
  // 🛑 V7 FND7-077. A 204 has no body, and `res.json()` throws on an empty one, so every call that
  // reached a 204 route through here REJECTED after the server had done the work: push register and
  // unregister, and the four mark-read mutations, whose `onSuccess` refreshes then never ran. The
  // `.catch(() => null)` that used to cover this was removed by `d6bed4b8` (CF5-02). Keep this line.
  if (res.status === 204) return null as T;
  return res.json() as Promise<T>;
}

/**
 * For endpoints that answer 204 with no body (like withdraw). A 204 has nothing
 * to parse, so this returns on success rather than trying to parse empty content.
 */
async function callNoContent(path: string, init?: RequestInit): Promise<void> {
  const method = init?.method ?? 'GET';
  const res = await fetch(`${BASE}${path}`, buildInit(init));
  if (!res.ok) {
    return handleResponseError(res, method, path);
  }
}

export const api = {
  get: <T>(path: string) => call<T>(path),
  post: <T>(path: string, body: unknown) =>
    call<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    call<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  /**
   * `CF-18`. No body parameter, deliberately: every **bodyless** `PUT` here identifies its
   * resource entirely in the path and sends nothing. Uses `callNoContent` for the same reason
   * `del` does - these routes answer 204, and a 204 has nothing to parse.
   *
   * 🆕 `CF-25` added `putJson` below for a `PUT` whose body IS the new state. This one stayed
   * bodyless rather than growing an optional parameter, because its two `/favorites` callers
   * expect `void` and widening the return type would touch both for nothing.
   */
  put: (path: string) => callNoContent(path, { method: 'PUT' }),
  /**
   * `CF-25`. A `PUT` that carries the new state and answers with it - today only
   * `/users/me/categories`, which replaces a réparateur's speciality set and returns
   * `MeResponse`.
   */
  putJson: <T>(path: string, body: unknown) =>
    call<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  /**
   * A `DELETE` that answers WITH the new state rather than 204 - today only
   * `/identity/verification`, which honours an Article 17 erasure request against the identity
   * verification and returns the refreshed `IdentityStatusResponse` so the screen re-renders from
   * one source instead of guessing.
   *
   * No body parameter, deliberately: the route identifies its resource entirely from the session
   * and sends nothing. It is a sibling of `del` for the same reason `putJson` is a sibling of
   * `put` - `del`'s only caller answers 204 and expects `void`, so widening it would add
   * status-dependent parsing to a function whose comment explains why it has none.
   */
  delJson: <T>(path: string) => call<T>(path, { method: 'DELETE' }),
  del: (path: string) => callNoContent(path, { method: 'DELETE' }),
};

export async function signDocumentUpload(
  filename: string,
  mimeType: string,
  sizeBytes: number,
): Promise<{ path: string; uploadUrl: string }> {
  return api.post<{ path: string; uploadUrl: string }>('/business/sign-document-upload', {
    filename,
    mimeType,
    sizeBytes,
  });
}

export async function lookupBusiness(identifier: string): Promise<LookupCompanyResponse> {
  return api.post<LookupCompanyResponse>('/business/lookup', { identifier });
}

export async function submitBusiness(
  input: SubmitBusinessVerificationInput,
): Promise<BusinessStatusResponse> {
  return api.post<BusinessStatusResponse>('/business/submit', input);
}

export async function getBusinessStatus(): Promise<BusinessStatusResponse> {
  return api.get<BusinessStatusResponse>('/business/status');
}

// V7 A4: moved to its own module, which has no auth-client import, so its French error mapping is
// testable in Node.
export { DocumentUploadError, uploadDocumentToUrl } from './document-upload';

