import { expect, type APIRequestContext, type Page } from '@playwright/test';

export const ORG = process.env.E2E_ORG ?? 'MC';
export const ADMIN = { email: process.env.E2E_ADMIN_EMAIL ?? 'admin@manageedocs.local', password: process.env.E2E_ADMIN_PASSWORD ?? 'ChangeMe-Dev-2026!' };
export const DEMO_PASSWORD = process.env.E2E_DEMO_PASSWORD ?? 'Demo-Password-2026!';
export const GRACE = { email: 'grace.wanjiru@mycredit.test', password: DEMO_PASSWORD, name: 'Grace Wanjiru' };
export const AMINA = { email: 'amina.hassan@mycredit.test', password: DEMO_PASSWORD, name: 'Amina Hassan' };

/** A unique suffix so every run files into its own cabinet and never collides with earlier runs. */
export const runId = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

/** Signs in through the real form (exercises validation, the API and the session bootstrap). */
export async function signIn(page: Page, who: { email: string; password: string }) {
  await page.goto('/sign-in');
  await page.getByLabel('Organisation code').fill(ORG);
  await page.getByLabel('Email').fill(who.email);
  await page.getByLabel('Password').fill(who.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Good to see you');
}

// ── API helpers for arranging test data (same public API the UI uses) ─────────────

interface Envelope<T> { data: T; successful: boolean; message: string }

export class Api {
  private constructor(private readonly request: APIRequestContext, private readonly token: string) {}

  static async as(request: APIRequestContext, who: { email: string; password: string }) {
    const res = await request.post('/api/v1/auth/login', { data: { organisation: ORG, email: who.email, password: who.password } });
    expect(res.ok(), `login ${who.email}`).toBeTruthy();
    return new Api(request, ((await res.json()) as Envelope<{ accessToken: string }>).data.accessToken);
  }

  private headers() {
    return { Authorization: `Bearer ${this.token}` };
  }

  async call<T>(method: 'GET' | 'POST' | 'PUT', path: string, data?: unknown): Promise<T> {
    const res = await this.request.fetch(`/api/v1${path}`, { method, headers: this.headers(), data });
    const body = (await res.json()) as Envelope<T>;
    expect(res.ok(), `${method} ${path}: ${body.message}`).toBeTruthy();
    return body.data;
  }

  async upload(folderId: string, name: string, bytes: Buffer): Promise<string> {
    const res = await this.request.post('/api/v1/documents', {
      headers: this.headers(),
      multipart: { folderId, file: { name, mimeType: 'application/pdf', buffer: bytes } },
    });
    const body = (await res.json()) as Envelope<{ document: { id: string } }>;
    expect(res.ok(), `upload ${name}: ${body.message}`).toBeTruthy();
    return body.data.document.id;
  }

  /** Waits until the security scan has finished (documents are only downloadable after it). */
  async waitUntilAvailable(documentId: string) {
    await expect.poll(async () => {
      const d = await this.call<{ versions: { processingStatus: string }[] }>('GET', `/documents/${documentId}`);
      return d.versions[0]?.processingStatus;
    }, { timeout: 30_000, intervals: [500, 1000, 2000] }).toBe('AVAILABLE');
  }

  async cabinetWithFolder(cabinetName: string, folderName: string) {
    const cabinet = await this.call<{ id: string }>('POST', '/cabinets', { name: cabinetName, visibility: 'DEFAULT' });
    const folder = await this.call<{ id: string }>('POST', `/cabinets/${cabinet.id}/folders`, { name: folderName });
    return { cabinetId: cabinet.id, folderId: folder.id };
  }
}

/** A small valid PDF with real, extractable text. */
export function pdf(lines: string[]): Buffer {
  const esc = (l: string) => l.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const text = `BT /F1 12 Tf 72 720 Td 16 TL ${lines.map((l) => `(${esc(l)}) '`).join(' ')} ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.7\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => { offsets.push(Buffer.byteLength(out, 'latin1')); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
