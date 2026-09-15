import { Test, TestingModule } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module';

/**
 * Full-stack E2E suite. Requires DATABASE_URL + REDIS_URL env vars (set by
 * CI services or a local .env). Skipped automatically when they are absent
 * so developers without a local DB don't hit connection errors.
 */
const SKIP_E2E = !process.env.DATABASE_URL;

(SKIP_E2E ? describe.skip : describe)('App HTTP (e2e) — requires DATABASE_URL', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.setGlobalPrefix('api');
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  }, 30_000);

  afterAll(async () => {
    await app?.close();
  });

  it('GET /api/health → 200 with status ok', async () => {
    const result = await app.inject({ method: 'GET', url: '/api/health' });
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.payload)).toMatchObject({ status: 'ok' });
  });

  it('GET /api/does-not-exist → 404', async () => {
    const result = await app.inject({ method: 'GET', url: '/api/does-not-exist' });
    expect(result.statusCode).toBe(404);
  });

  it('POST /api/auth/login with empty body → 400 (validation)', async () => {
    const result = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {},
      headers: { 'content-type': 'application/json' },
    });
    expect(result.statusCode).toBe(400);
  });

  it('POST /api/auth/login with invalid credentials → 401', async () => {
    const result = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: 'nobody@nowhere.example',
        password: 'definitely-wrong',
        businessUnitId: 'fake-bu-id',
        branchId: 'fake-branch-id',
      },
      headers: { 'content-type': 'application/json' },
    });
    expect(result.statusCode).toBe(401);
  });

  it('GET /api/documents without auth token → 401', async () => {
    const result = await app.inject({ method: 'GET', url: '/api/documents' });
    expect(result.statusCode).toBe(401);
  });

  it('GET /api/inventory without auth token → 401', async () => {
    const result = await app.inject({ method: 'GET', url: '/api/inventory' });
    expect(result.statusCode).toBe(401);
  });
});
