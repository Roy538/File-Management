import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, tokens, withQuery } from './client';

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
const ok = (data: unknown) => json(200, { data, errors: null, message: 'ok', successful: true, timestamp: '', code: null, correlationId: 'c-1' });
const fail = (status: number, code: string, message: string, errors: Record<string, string> | null = null) =>
  json(status, { data: null, errors, message, successful: false, timestamp: '', code, correlationId: 'c-2' });

describe('api client', () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    tokens.set('access-1');
  });
  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('unwraps the envelope and sends the bearer token', async () => {
    fetchMock.mockResolvedValueOnce(ok({ id: 'x' }));
    await expect(api.get<{ id: string }>('/documents/x')).resolves.toEqual({ id: 'x' });
    const init = fetchMock.mock.calls[0]![1]!;
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer access-1');
  });

  it('turns failures into typed errors with code, field errors and correlation id', async () => {
    fetchMock.mockResolvedValueOnce(fail(400, 'VALIDATION_FAILED', 'Some fields are invalid', { name: 'must not be blank' }));
    const err = await api.post('/cabinets', {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 400, code: 'VALIDATION_FAILED', fieldErrors: { name: 'must not be blank' }, correlationId: 'c-2' });
  });

  it('refreshes once on 401 and retries the original request with the new token', async () => {
    fetchMock
      .mockResolvedValueOnce(fail(401, 'UNAUTHORIZED', 'Authentication required'))
      .mockResolvedValueOnce(ok({ accessToken: 'access-2', accessTokenExpiresAt: '', user: {} }))
      .mockResolvedValueOnce(ok(['ok']));
    await expect(api.get('/tasks')).resolves.toEqual(['ok']);
    const [, refreshCall, retryCall] = fetchMock.mock.calls;
    expect(refreshCall![0]).toBe('/api/v1/auth/refresh');
    expect((refreshCall![1]!.headers as Record<string, string>)['X-Requested-With']).toBe('fetch');
    expect(refreshCall![1]!.credentials).toBe('include');
    expect((retryCall![1]!.headers as Record<string, string>).Authorization).toBe('Bearer access-2');
  });

  it('shares one refresh between concurrent 401s', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/auth/refresh')) return ok({ accessToken: 'access-3', accessTokenExpiresAt: '', user: {} });
      return tokens.get() === 'access-3' ? ok(url) : fail(401, 'UNAUTHORIZED', 'Authentication required');
    });
    await Promise.all([api.get('/a'), api.get('/b'), api.get('/c')]);
    expect(fetchMock.mock.calls.filter(([u]) => String(u).endsWith('/auth/refresh'))).toHaveLength(1);
  });

  it('expires the session when refresh fails', async () => {
    const expired = vi.fn();
    tokens.onExpired(expired);
    fetchMock
      .mockResolvedValueOnce(fail(401, 'UNAUTHORIZED', 'Authentication required'))
      .mockResolvedValueOnce(fail(401, 'UNAUTHORIZED', 'Session expired'));
    await expect(api.get('/tasks')).rejects.toBeInstanceOf(ApiError);
    expect(expired).toHaveBeenCalledOnce();
    expect(tokens.get()).toBeNull();
  });

  it('builds query strings without empty values', () => {
    expect(withQuery('/search', { q: 'loan', page: 0, cabinetId: undefined, status: '' })).toBe('/search?q=loan&page=0');
  });
});
