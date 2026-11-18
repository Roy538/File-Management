/**
 * The single HTTP client for the Spring Boot API.
 *
 * - Unwraps the StandardAPIResponse envelope; failures become a typed {@link ApiError}.
 * - The access token lives only in this module's memory (never localStorage): an XSS cannot
 *   read a long-lived credential. The refresh token is an HttpOnly cookie the browser sends to
 *   /api/v1/auth only; the X-Requested-With header is the backend's anti-CSRF requirement.
 * - On 401 it performs one shared ("single-flight") refresh and retries once; if that fails the
 *   session-expired handler runs (the app returns to the sign-in screen).
 */

export interface Envelope<T> {
  data: T;
  errors: Record<string, string> | null;
  message: string;
  successful: boolean;
  timestamp: string;
  code: string | null;
  correlationId: string | null;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fieldErrors: Record<string, string> = {},
    readonly correlationId: string | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isNotFound() { return this.status === 404; }
  get isForbidden() { return this.status === 403; }
  get isConflict() { return this.status === 409; }
}

const BASE = '/api/v1';

let accessToken: string | null = null;
let refreshing: Promise<SessionPayload | null> | null = null;
let onSessionExpired: () => void = () => {};

export const tokens = {
  set(token: string | null) { accessToken = token; },
  get() { return accessToken; },
  onExpired(handler: () => void) { onSessionExpired = handler; },
};

type Query = Record<string, string | number | boolean | null | undefined>;

export function withQuery(path: string, query?: Query): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

async function parse<T>(res: Response): Promise<Envelope<T>> {
  const text = await res.text();
  if (!text) {
    return { data: undefined as T, errors: null, message: res.statusText, successful: res.ok, timestamp: '', code: null, correlationId: null };
  }
  try {
    return JSON.parse(text) as Envelope<T>;
  } catch {
    throw new ApiError(res.status, 'UNEXPECTED_RESPONSE', 'The server returned an unexpected response.');
  }
}

function toError(status: number, env: Envelope<unknown>): ApiError {
  return new ApiError(status, env.code ?? 'ERROR', env.message || 'Request failed', env.errors ?? {}, env.correlationId);
}

/** What login and refresh return (see backend AuthDtos.SessionResponse). */
export interface SessionPayload {
  accessToken: string;
  accessTokenExpiresAt: string;
  user: import('./types').UserProfile;
}

/** Exchanges the refresh cookie for a new session, or null. Shared by concurrent 401s. */
export function refreshSession(): Promise<SessionPayload | null> {
  if (!refreshing) {
    refreshing = fetch(`${BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'X-Requested-With': 'fetch' },
    })
      .then(async (res) => {
        if (!res.ok) return null;
        const env = await parse<SessionPayload>(res);
        accessToken = env.data.accessToken;
        return env.data;
      })
      .catch(() => null)
      .finally(() => { refreshing = null; });
  }
  return refreshing;
}

export async function request<T>(method: string, path: string, body?: unknown, init?: { retry?: boolean; signal?: AbortSignal }): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const isForm = body instanceof FormData;
  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
  if (path.startsWith('/auth/')) headers['X-Requested-With'] = 'fetch';

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    credentials: path.startsWith('/auth/') ? 'include' : 'same-origin',
    signal: init?.signal,
  });

  if (res.status === 401 && init?.retry !== false && !path.startsWith('/auth/')) {
    if (await refreshSession()) return request<T>(method, path, body, { ...init, retry: false });
    accessToken = null;
    onSessionExpired();
  }
  const env = await parse<T>(res);
  if (!res.ok || env.successful === false) throw toError(res.status, env as Envelope<unknown>);
  return env.data;
}

export const api = {
  get: <T>(path: string, query?: Query, signal?: AbortSignal) => request<T>('GET', withQuery(path, query), undefined, { signal }),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};

/**
 * Multipart upload with progress (fetch cannot report upload progress). Same auth rules as
 * {@link request}, including one refresh-and-retry on 401.
 */
export function upload<T>(path: string, form: FormData, onProgress?: (fraction: number) => void, retry = true): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BASE}${path}`);
    if (accessToken) xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
    xhr.onerror = () => reject(new ApiError(0, 'NETWORK', 'The upload could not reach the server. Check your connection and try again.'));
    xhr.onload = async () => {
      if (xhr.status === 401 && retry) {
        if (await refreshSession()) return upload<T>(path, form, onProgress, false).then(resolve, reject);
        onSessionExpired();
      }
      let env: Envelope<T>;
      try {
        env = JSON.parse(xhr.responseText) as Envelope<T>;
      } catch {
        return reject(new ApiError(xhr.status, 'UNEXPECTED_RESPONSE', 'The server returned an unexpected response.'));
      }
      if (xhr.status >= 400 || env.successful === false) return reject(toError(xhr.status, env as Envelope<unknown>));
      resolve(env.data);
    };
    xhr.send(form);
  });
}
