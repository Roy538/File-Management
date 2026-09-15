const API_BASE = import.meta.env.VITE_API_URL ?? '';

let _accessToken: string | null = null;
let refreshPromise: Promise<string> | null = null;

export function setAccessToken(token: string) {
  _accessToken = token;
}

export function setTokens(accessToken: string, refreshToken: string) {
  _accessToken = accessToken;
  localStorage.setItem('refreshToken', refreshToken);
}

export function clearTokens() {
  _accessToken = null;
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
}

async function doRefresh(): Promise<string> {
  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) {
    clearTokens();
    window.location.href = '/login';
    throw new Error('No refresh token');
  }
  const res = await fetch(`${API_BASE}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) {
    clearTokens();
    window.location.href = '/login';
    throw new Error('Session expired');
  }
  const data = await res.json();
  setTokens(data.accessToken, data.refreshToken);
  return data.accessToken;
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = _accessToken;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });

  if (res.status === 401 && token) {
    if (!refreshPromise) {
      refreshPromise = doRefresh().finally(() => { refreshPromise = null; });
    }
    const newToken = await refreshPromise;
    headers['Authorization'] = `Bearer ${newToken}`;
    const retry = await fetch(`${API_BASE}${path}`, { ...init, headers });
    if (!retry.ok) throw await retry.json();
    return retry.json() as Promise<T>;
  }

  if (!res.ok) throw await res.json();
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => apiRequest<T>(path, { method: 'GET' }),
  post: <T>(path: string, body: unknown) =>
    apiRequest<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    apiRequest<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => apiRequest<T>(path, { method: 'DELETE' }),
};

export async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  const token = _accessToken;
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { method: 'POST', headers, body: formData });

  if (res.status === 401 && token) {
    if (!refreshPromise) {
      refreshPromise = doRefresh().finally(() => { refreshPromise = null; });
    }
    const newToken = await refreshPromise;
    headers['Authorization'] = `Bearer ${newToken}`;
    const retry = await fetch(`${API_BASE}${path}`, { method: 'POST', headers, body: formData });
    if (!retry.ok) throw await retry.json();
    return retry.json() as Promise<T>;
  }

  if (!res.ok) throw await res.json();
  return res.json() as Promise<T>;
}

/** POST multipart/form-data and receive a binary file back (with its filename). */
export async function apiConvert(
  path: string,
  formData: FormData,
): Promise<{ blob: Blob; filename: string }> {
  const token = _accessToken;
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const doFetch = () => fetch(`${API_BASE}${path}`, { method: 'POST', headers, body: formData });

  let res = await doFetch();
  if (res.status === 401 && token) {
    if (!refreshPromise) {
      refreshPromise = doRefresh().finally(() => { refreshPromise = null; });
    }
    const newToken = await refreshPromise;
    headers['Authorization'] = `Bearer ${newToken}`;
    res = await doFetch();
  }

  if (!res.ok) {
    // error responses are JSON
    let message = 'Conversion failed';
    try { const j = await res.json(); message = j.message ?? message; } catch { /* ignore */ }
    throw new Error(Array.isArray(message) ? message.join(', ') : message);
  }

  const disposition = res.headers.get('Content-Disposition') ?? '';
  const match = disposition.match(/filename="?([^"]+)"?/);
  const filename = match ? decodeURIComponent(match[1]) : 'download';
  const blob = await res.blob();
  return { blob, filename };
}

export async function apiDownload(path: string): Promise<Blob> {
  const token = _accessToken;
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { method: 'GET', headers });

  if (res.status === 401 && token) {
    if (!refreshPromise) {
      refreshPromise = doRefresh().finally(() => { refreshPromise = null; });
    }
    const newToken = await refreshPromise;
    headers['Authorization'] = `Bearer ${newToken}`;
    const retry = await fetch(`${API_BASE}${path}`, { method: 'GET', headers });
    if (!retry.ok) throw new Error('Download failed');
    return retry.blob();
  }

  if (!res.ok) throw new Error('Download failed');
  return res.blob();
}
