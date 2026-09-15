import { spawn, spawnSync } from 'child_process';
import { randomBytes } from 'crypto';
import { mkdtemp, readFile, rm, writeFile, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { Logger } from '@nestjs/common';

const logger = new Logger('LibreOffice');

/**
 * Thin wrapper around a headless LibreOffice (`soffice`) binary used for
 * high-fidelity Office <-> PDF conversions. Detection is lazy and cached:
 * the engine simply reports "unavailable" when no binary is found, letting
 * callers fall back to the pure-JS engine.
 */

let cachedPath: string | null | undefined; // undefined = not probed yet, null = probed & absent

const WINDOWS_CANDIDATES = [
  'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
  'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
  'D:\\LibreOffice\\program\\soffice.exe',
  'D:\\Program Files\\LibreOffice\\program\\soffice.exe',
];
const UNIX_CANDIDATES = [
  '/usr/bin/soffice',
  '/usr/bin/libreoffice',
  '/opt/libreoffice/program/soffice',
  '/snap/bin/libreoffice',
];

function probeOnPath(): string | null {
  const isWin = process.platform === 'win32';
  const finder = isWin ? 'where' : 'which';
  for (const name of isWin ? ['soffice.exe', 'soffice.com'] : ['soffice', 'libreoffice']) {
    try {
      const r = spawnSync(finder, [name], { encoding: 'utf-8' });
      if (r.status === 0 && r.stdout) {
        const first = r.stdout.split(/\r?\n/).map(s => s.trim()).find(Boolean);
        if (first && existsSync(first)) return first;
      }
    } catch { /* ignore */ }
  }
  return null;
}

/** Resolve the soffice binary (env override → PATH → common install dirs). Cached. */
export function resolveSoffice(): string | null {
  if (cachedPath !== undefined) return cachedPath;

  if ((process.env.LIBREOFFICE_ENGINE ?? '').toLowerCase() === 'off') {
    cachedPath = null;
    return cachedPath;
  }

  const envPath = process.env.LIBREOFFICE_PATH;
  if (envPath && existsSync(envPath)) { cachedPath = envPath; }
  else {
    const onPath = probeOnPath();
    if (onPath) cachedPath = onPath;
    else {
      const candidates = process.platform === 'win32' ? WINDOWS_CANDIDATES : UNIX_CANDIDATES;
      cachedPath = candidates.find(c => existsSync(c)) ?? null;
    }
  }

  logger.log(cachedPath ? `LibreOffice engine available: ${cachedPath}` : 'LibreOffice engine not found — using pure-JS fallback');
  return cachedPath;
}

export function isLibreOfficeAvailable(): boolean {
  return resolveSoffice() !== null;
}

/** For tests / after installing LibreOffice at runtime. */
export function resetLibreOfficeCache(): void {
  cachedPath = undefined;
}

export interface LoConvertOptions {
  /** LibreOffice output filter, e.g. 'pdf' or 'docx:MS Word 2007 XML'. */
  convertTo: string;
  /** Optional import filter, e.g. 'writer_pdf_import' for reading PDFs. */
  inFilter?: string;
  /** Expected output extension (e.g. 'pdf', 'docx'). */
  outExt: string;
  timeoutMs?: number;
}

/**
 * Convert a document buffer using headless LibreOffice.
 * Runs with a per-call user profile + temp dir so concurrent conversions
 * don't collide, and always cleans up.
 */
export async function libreOfficeConvert(
  input: Buffer,
  inputExt: string,
  opts: LoConvertOptions,
): Promise<Buffer> {
  const soffice = resolveSoffice();
  if (!soffice) throw new Error('LibreOffice engine is not available on this server');

  const id = randomBytes(6).toString('hex');
  const work = await mkdtemp(join(tmpdir(), `lo-work-${id}-`));
  const profile = await mkdtemp(join(tmpdir(), `lo-prof-${id}-`));
  const inName = `input.${inputExt.replace(/^\./, '')}`;
  const inPath = join(work, inName);

  try {
    await writeFile(inPath, input);

    const args = [
      '--headless', '--norestore', '--invisible', '--nodefault',
      '--nologo', '--nofirststartwizard',
      `-env:UserInstallation=${pathToFileURL(profile).href}`,
    ];
    if (opts.inFilter) args.push(`--infilter=${opts.inFilter}`);
    args.push('--convert-to', opts.convertTo, '--outdir', work, inPath);

    await runSoffice(soffice, args, opts.timeoutMs ?? 90_000);

    // LibreOffice writes "<basename>.<outExt>" into the outdir.
    const produced = await findOutput(work, opts.outExt, inName);
    if (!produced) throw new Error('LibreOffice produced no output (unsupported or corrupt input?)');
    return await readFile(join(work, produced));
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => undefined);
    await rm(profile, { recursive: true, force: true }).catch(() => undefined);
  }
}

function runSoffice(bin: string, args: string[], timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true });
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`LibreOffice conversion timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stderr?.on('data', d => { stderr += d.toString(); });
    child.on('error', err => { clearTimeout(timer); reject(err); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`LibreOffice exited with code ${code}${stderr ? `: ${stderr.trim()}` : ''}`));
    });
  });
}

async function findOutput(dir: string, outExt: string, inputName: string): Promise<string | undefined> {
  const ext = outExt.replace(/^\./, '').toLowerCase();
  const files = await readdir(dir);
  // Prefer the file matching the input base name; else any file with the target extension.
  const base = inputName.replace(/\.[^.]+$/, '');
  return (
    files.find(f => f.toLowerCase() === `${base}.${ext}`.toLowerCase()) ??
    files.find(f => f.toLowerCase().endsWith(`.${ext}`) && f !== inputName)
  );
}
