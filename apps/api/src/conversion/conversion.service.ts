import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PDFDocument, StandardFonts, degrees, rgb, PDFFont, PDFPage } from 'pdf-lib';
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import * as mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import { isLibreOfficeAvailable, libreOfficeConvert } from './libreoffice';
// CJS default/callable module (esModuleInterop is off in this project):
import JSZip = require('jszip');

/** Extract the full plain text of a PDF using pdf-parse v2. */
async function extractPdfText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return (result.text ?? '').replace(/\r\n/g, '\n');
  } finally {
    await parser.destroy();
  }
}

// ── Public types ──────────────────────────────────────────────────────────────

export interface UploadedFile {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
}

export interface ConversionResult {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
}

export interface ToolOption {
  key: string;
  label: string;
  type: 'text' | 'select';
  choices?: string[];
  default?: string;
}

export interface ToolMeta {
  key: string;
  name: string;
  description: string;
  accept: string;      // comma-separated extensions for the file picker
  multiple: boolean;   // accepts more than one input file
  batch?: boolean;     // per-file tool that can run over many files → ZIP of results
  out: string;         // output extension
  engine: 'js' | 'libreoffice' | 'hybrid'; // conversion backend
  loOnly?: boolean;    // requires LibreOffice; hidden/disabled when unavailable
  available?: boolean; // computed at request time (LibreOffice presence)
  options?: ToolOption[];
}

// ── Tool catalogue (also drives dispatch + the UI) ──────────────────────────────

export const TOOLS: ToolMeta[] = [
  { key: 'pdf-to-word',      name: 'PDF to Word',       description: 'Convert PDFs into editable Word (.docx) documents — supports bulk.', accept: '.pdf', multiple: true, batch: true, out: 'docx', engine: 'hybrid' },
  { key: 'word-to-pdf',      name: 'Word to PDF',       description: 'Convert Word documents (.doc/.docx/.odt/.rtf) into PDFs — supports bulk.', accept: '.docx,.doc,.odt,.rtf', multiple: true, batch: true, out: 'pdf', engine: 'hybrid' },
  { key: 'excel-to-pdf',     name: 'Excel to PDF',      description: 'Convert Excel / CSV / ODS spreadsheets to PDF (LibreOffice).',    accept: '.xlsx,.xls,.csv,.ods', multiple: true, batch: true, out: 'pdf', engine: 'libreoffice', loOnly: true },
  { key: 'powerpoint-to-pdf', name: 'PowerPoint to PDF', description: 'Convert PowerPoint / ODP presentations to PDF (LibreOffice).',    accept: '.pptx,.ppt,.odp', multiple: true, batch: true, out: 'pdf', engine: 'libreoffice', loOnly: true },
  { key: 'merge',            name: 'Merge PDF',         description: 'Combine several PDFs into a single document.',                     accept: '.pdf', multiple: true,  out: 'pdf', engine: 'js' },
  { key: 'split',            name: 'Split PDF',         description: 'Split a PDF into separate pages (downloaded as a ZIP).',           accept: '.pdf', multiple: false, out: 'zip', engine: 'js',
    options: [{ key: 'ranges', label: 'Pages (e.g. 1-3,5) — leave blank for all', type: 'text' }] },
  { key: 'images-to-pdf',    name: 'Images to PDF',     description: 'Turn JPG / PNG images into a PDF, one image per page.',            accept: '.jpg,.jpeg,.png', multiple: true, out: 'pdf', engine: 'js' },
  { key: 'rotate',           name: 'Rotate PDF',        description: 'Rotate every page of a PDF — supports bulk.',                     accept: '.pdf', multiple: true, batch: true, out: 'pdf', engine: 'js',
    options: [{ key: 'degrees', label: 'Rotation', type: 'select', choices: ['90', '180', '270'], default: '90' }] },
  { key: 'page-numbers',     name: 'Add Page Numbers',  description: 'Stamp "Page X of Y" on every page — supports bulk.',              accept: '.pdf', multiple: true, batch: true, out: 'pdf', engine: 'js' },
  { key: 'watermark',        name: 'Watermark PDF',     description: 'Add a diagonal text watermark to every page — supports bulk.',    accept: '.pdf', multiple: true, batch: true, out: 'pdf', engine: 'js',
    options: [{ key: 'text', label: 'Watermark text', type: 'text', default: 'CONFIDENTIAL' }] },
  { key: 'extract-text',     name: 'PDF to Text',       description: 'Extract the plain text from PDFs — supports bulk.',               accept: '.pdf', multiple: true, batch: true, out: 'txt', engine: 'js' },
  { key: 'optimize',         name: 'Optimize PDF',      description: 'Re-save and optimise PDF structure — supports bulk.',             accept: '.pdf', multiple: true, batch: true, out: 'pdf', engine: 'js' },
];

const MIME: Record<string, string> = {
  pdf:  'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt:  'text/plain; charset=utf-8',
  zip:  'application/zip',
};

@Injectable()
export class ConversionService {
  private readonly logger = new Logger(ConversionService.name);

  /** Tool catalogue with per-request LibreOffice availability filled in. */
  listTools(): ToolMeta[] {
    const lo = isLibreOfficeAvailable();
    return TOOLS.map(t => ({ ...t, available: t.loOnly ? lo : true }));
  }

  /** Whether the high-fidelity LibreOffice engine is present. */
  engineStatus() {
    const lo = isLibreOfficeAvailable();
    return { libreOffice: lo, activeEngine: lo ? 'libreoffice' : 'js' as const };
  }

  async convert(tool: string, files: UploadedFile[], options: Record<string, string>): Promise<ConversionResult> {
    const meta = TOOLS.find(t => t.key === tool);
    if (!meta) throw new BadRequestException(`Unknown tool "${tool}"`);
    if (!files.length) throw new BadRequestException('No file uploaded');
    if (files.length > 30) throw new BadRequestException('Too many files (max 30)');
    if (meta.loOnly && !isLibreOfficeAvailable()) {
      throw new BadRequestException(`${meta.name} requires the LibreOffice engine, which is not installed on this server.`);
    }

    // Aggregate tools: many inputs → one output.
    if (tool === 'merge') {
      return { buffer: await this.mergePdfs(files), fileName: `${stripExt(files[0].fileName) || 'merged'}.pdf`, mimeType: MIME.pdf };
    }
    if (tool === 'images-to-pdf') {
      return { buffer: await this.imagesToPdf(files), fileName: `${stripExt(files[0].fileName) || 'images'}.pdf`, mimeType: MIME.pdf };
    }

    // Per-file tools: one file → one output.
    if (files.length === 1) {
      return this.convertOne(tool, files[0], options);
    }

    // Bulk: run the tool on each file and package the results as a ZIP.
    if (!meta.batch) throw new BadRequestException(`${meta.name} accepts a single file`);

    const zip = new JSZip();
    const used = new Map<string, number>();
    for (const file of files) {
      const result = await this.convertOne(tool, file, options);
      let name = result.fileName;
      const seen = used.get(name);
      if (seen) {
        used.set(name, seen + 1);
        const dot = name.lastIndexOf('.');
        name = dot > 0 ? `${name.slice(0, dot)} (${seen})${name.slice(dot)}` : `${name} (${seen})`;
      } else {
        used.set(name, 1);
      }
      zip.file(name, result.buffer);
    }
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    return { buffer, fileName: `${meta.key}-batch.zip`, mimeType: MIME.zip };
  }

  /** Run a single-file tool on one file. */
  private async convertOne(tool: string, file: UploadedFile, options: Record<string, string>): Promise<ConversionResult> {
    const meta = TOOLS.find(t => t.key === tool)!;
    const base = stripExt(file.fileName) || 'converted';
    const outName = `${base}.${meta.out}`;
    const mimeType = MIME[meta.out];
    const lo = isLibreOfficeAvailable();

    let buffer: Buffer;
    switch (tool) {
      case 'pdf-to-word':
        buffer = lo
          ? await libreOfficeConvert(file.buffer, 'pdf', { convertTo: 'docx:MS Word 2007 XML', inFilter: 'writer_pdf_import', outExt: 'docx' })
          : await this.pdfToWord(file);
        break;
      case 'word-to-pdf':
        buffer = lo
          ? await libreOfficeConvert(file.buffer, extOf(file.fileName, 'docx'), { convertTo: 'pdf', outExt: 'pdf' })
          : await this.wordToPdf(file);
        break;
      case 'excel-to-pdf':
      case 'powerpoint-to-pdf':
        buffer = await libreOfficeConvert(file.buffer, extOf(file.fileName, meta.key === 'excel-to-pdf' ? 'xlsx' : 'pptx'), { convertTo: 'pdf', outExt: 'pdf' });
        break;
      case 'split':         buffer = await this.splitPdf(file, options.ranges); break;
      case 'rotate':        buffer = await this.rotatePdf(file, Number(options.degrees ?? 90)); break;
      case 'page-numbers':  buffer = await this.addPageNumbers(file); break;
      case 'watermark':     buffer = await this.watermark(file, options.text || 'CONFIDENTIAL'); break;
      case 'extract-text':  buffer = await this.extractText(file); break;
      case 'optimize':      buffer = await this.optimize(file); break;
      default: throw new BadRequestException(`Tool "${tool}" is not implemented`);
    }

    return { buffer, fileName: outName, mimeType };
  }

  // ── PDF → Word (pure-JS fallback) ─────────────────────────────────────────

  private async pdfToWord(file: UploadedFile): Promise<Buffer> {
    const raw = (await extractPdfText(file.buffer)).trim();
    const blocks = raw.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);

    const children: Paragraph[] = [
      new Paragraph({ text: stripExt(file.fileName), heading: HeadingLevel.HEADING_1 }),
    ];
    if (!blocks.length) {
      children.push(new Paragraph({ children: [new TextRun({ text: '(No extractable text — this may be a scanned PDF.)', italics: true })] }));
    }
    for (const block of blocks) {
      // Collapse hard-wrapped lines within a paragraph into a single flowing line.
      const textLine = block.replace(/\n/g, ' ').replace(/\s{2,}/g, ' ').trim();
      children.push(new Paragraph({ children: [new TextRun(textLine)] }));
    }

    const doc = new Document({ sections: [{ children }] });
    return Buffer.from(await Packer.toBuffer(doc));
  }

  // ── Word → PDF ──────────────────────────────────────────────────────────────

  private async wordToPdf(file: UploadedFile): Promise<Buffer> {
    let html = '';
    try {
      const res = await mammoth.convertToHtml({ buffer: file.buffer });
      html = res.value ?? '';
    } catch (e) {
      throw new BadRequestException(`Could not read Word document: ${(e as Error).message}`);
    }
    const blocks = htmlToBlocks(html);

    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

    const PAGE_W = 595, PAGE_H = 842, MARGIN = 56;
    const maxWidth = PAGE_W - MARGIN * 2;
    let page = pdf.addPage([PAGE_W, PAGE_H]);
    let y = PAGE_H - MARGIN;

    const ensure = (needed: number) => {
      if (y - needed < MARGIN) { page = pdf.addPage([PAGE_W, PAGE_H]); y = PAGE_H - MARGIN; }
    };

    if (!blocks.length) blocks.push({ kind: 'p', text: '(Empty document)' });

    for (const b of blocks) {
      const size = b.kind === 'h1' ? 22 : b.kind === 'h2' ? 17 : b.kind === 'h3' ? 14 : 11;
      const useFont = b.kind.startsWith('h') ? bold : font;
      const prefix = b.kind === 'li' ? '•  ' : '';
      const lineHeight = size * 1.35;
      const lines = wrapText(prefix + b.text, useFont, size, maxWidth);
      // spacing before headings
      if (b.kind.startsWith('h')) { ensure(size); y -= size * 0.6; }
      for (const line of lines) {
        ensure(lineHeight);
        page.drawText(line, { x: MARGIN, y: y - size, size, font: useFont, color: rgb(0.12, 0.12, 0.12) });
        y -= lineHeight;
      }
      y -= size * 0.5; // paragraph gap
    }

    return Buffer.from(await pdf.save());
  }

  // ── Merge ─────────────────────────────────────────────────────────────────

  private async mergePdfs(files: UploadedFile[]): Promise<Buffer> {
    const out = await PDFDocument.create();
    for (const f of files) {
      const src = await loadPdf(f);
      const pages = await out.copyPages(src, src.getPageIndices());
      pages.forEach(p => out.addPage(p));
    }
    return Buffer.from(await out.save());
  }

  // ── Split (→ ZIP of per-page PDFs) ──────────────────────────────────────────

  private async splitPdf(file: UploadedFile, ranges?: string): Promise<Buffer> {
    const src = await loadPdf(file);
    const total = src.getPageCount();
    const indices = parseRanges(ranges, total);
    if (!indices.length) throw new BadRequestException('No valid pages selected');

    const zip = new JSZip();
    const base = stripExt(file.fileName);
    for (const idx of indices) {
      const one = await PDFDocument.create();
      const [pg] = await one.copyPages(src, [idx]);
      one.addPage(pg);
      zip.file(`${base}_page_${idx + 1}.pdf`, await one.save());
    }
    return zip.generateAsync({ type: 'nodebuffer' });
  }

  // ── Images → PDF ────────────────────────────────────────────────────────────

  private async imagesToPdf(files: UploadedFile[]): Promise<Buffer> {
    const pdf = await PDFDocument.create();
    const PAGE_W = 595, PAGE_H = 842, MARGIN = 28;
    for (const f of files) {
      const isPng = f.mimeType === 'image/png' || /\.png$/i.test(f.fileName);
      const isJpg = f.mimeType === 'image/jpeg' || /\.jpe?g$/i.test(f.fileName);
      if (!isPng && !isJpg) throw new BadRequestException(`Unsupported image type: ${f.fileName}`);
      const img = isPng ? await pdf.embedPng(f.buffer) : await pdf.embedJpg(f.buffer);

      const maxW = PAGE_W - MARGIN * 2, maxH = PAGE_H - MARGIN * 2;
      const scale = Math.min(maxW / img.width, maxH / img.height, 1);
      const w = img.width * scale, h = img.height * scale;
      const page = pdf.addPage([PAGE_W, PAGE_H]);
      page.drawImage(img, { x: (PAGE_W - w) / 2, y: (PAGE_H - h) / 2, width: w, height: h });
    }
    if (pdf.getPageCount() === 0) throw new BadRequestException('No images provided');
    return Buffer.from(await pdf.save());
  }

  // ── Rotate ────────────────────────────────────────────────────────────────

  private async rotatePdf(file: UploadedFile, deg: number): Promise<Buffer> {
    if (![90, 180, 270].includes(deg)) throw new BadRequestException('Degrees must be 90, 180 or 270');
    const pdf = await loadPdf(file);
    pdf.getPages().forEach(p => {
      const current = p.getRotation().angle;
      p.setRotation(degrees((current + deg) % 360));
    });
    return Buffer.from(await pdf.save());
  }

  // ── Page numbers ─────────────────────────────────────────────────────────

  private async addPageNumbers(file: UploadedFile): Promise<Buffer> {
    const pdf = await loadPdf(file);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const pages = pdf.getPages();
    pages.forEach((p, i) => {
      const label = `Page ${i + 1} of ${pages.length}`;
      const size = 9;
      const w = font.widthOfTextAtSize(label, size);
      const { width } = p.getSize();
      p.drawText(label, { x: (width - w) / 2, y: 18, size, font, color: rgb(0.4, 0.4, 0.4) });
    });
    return Buffer.from(await pdf.save());
  }

  // ── Watermark ────────────────────────────────────────────────────────────

  private async watermark(file: UploadedFile, text: string): Promise<Buffer> {
    const pdf = await loadPdf(file);
    const font = await pdf.embedFont(StandardFonts.HelveticaBold);
    pdf.getPages().forEach(p => {
      const { width, height } = p.getSize();
      const size = Math.min(width, height) / 8;
      const textWidth = font.widthOfTextAtSize(text, size);
      p.drawText(text, {
        x: width / 2 - textWidth / 2 * Math.cos(Math.PI / 4),
        y: height / 2 - textWidth / 2 * Math.sin(Math.PI / 4),
        size,
        font,
        color: rgb(0.6, 0.6, 0.6),
        rotate: degrees(45),
        opacity: 0.25,
      });
    });
    return Buffer.from(await pdf.save());
  }

  // ── Extract text ────────────────────────────────────────────────────────

  private async extractText(file: UploadedFile): Promise<Buffer> {
    const text = await extractPdfText(file.buffer);
    return Buffer.from(text, 'utf-8');
  }

  // ── Optimize ────────────────────────────────────────────────────────────

  private async optimize(file: UploadedFile): Promise<Buffer> {
    const pdf = await loadPdf(file);
    return Buffer.from(await pdf.save({ useObjectStreams: true }));
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

function stripExt(name: string): string {
  return name.replace(/\.[^./\\]+$/, '');
}

/** Lower-case file extension without the dot, or a fallback. */
function extOf(name: string, fallback: string): string {
  const m = name.match(/\.([^./\\]+)$/);
  return m ? m[1].toLowerCase() : fallback;
}

async function loadPdf(file: UploadedFile): Promise<PDFDocument> {
  if (file.mimeType && file.mimeType !== 'application/pdf' && !/\.pdf$/i.test(file.fileName)) {
    throw new BadRequestException(`Expected a PDF but got "${file.fileName}"`);
  }
  try {
    return await PDFDocument.load(file.buffer);
  } catch {
    throw new BadRequestException(`"${file.fileName}" is not a valid PDF`);
  }
}

/** Parse a page-range string like "1-3,5" into zero-based indices, clamped to [0,total). */
function parseRanges(ranges: string | undefined, total: number): number[] {
  if (!ranges || !ranges.trim()) return Array.from({ length: total }, (_, i) => i);
  const out = new Set<number>();
  for (const part of ranges.split(',')) {
    const seg = part.trim();
    if (!seg) continue;
    const m = seg.match(/^(\d+)\s*-\s*(\d+)$/);
    if (m) {
      let a = parseInt(m[1], 10), b = parseInt(m[2], 10);
      if (a > b) [a, b] = [b, a];
      for (let i = a; i <= b; i++) if (i >= 1 && i <= total) out.add(i - 1);
    } else if (/^\d+$/.test(seg)) {
      const n = parseInt(seg, 10);
      if (n >= 1 && n <= total) out.add(n - 1);
    }
  }
  return [...out].sort((a, b) => a - b);
}

/** Wrap text to a maximum pixel width for a given font/size. */
function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  const sanitize = (s: string) => s.replace(/[^\x20-\x7E]/g, ''); // WinAnsi-safe for standard fonts
  for (const wRaw of words) {
    const w = sanitize(wRaw);
    const candidate = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

interface Block { kind: 'h1' | 'h2' | 'h3' | 'p' | 'li'; text: string }

/** Very small HTML→blocks parser for mammoth output (headings, paragraphs, list items). */
function htmlToBlocks(html: string): Block[] {
  const blocks: Block[] = [];
  const re = /<(h1|h2|h3|h4|h5|h6|p|li)[^>]*>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const tag = m[1].toLowerCase();
    const text = decodeEntities(m[2].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const kind: Block['kind'] =
      tag === 'h1' ? 'h1' :
      tag === 'h2' ? 'h2' :
      tag === 'h3' || tag === 'h4' || tag === 'h5' || tag === 'h6' ? 'h3' :
      tag === 'li' ? 'li' : 'p';
    blocks.push({ kind, text });
  }
  return blocks;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}
