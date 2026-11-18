import { BadRequestException } from '@nestjs/common';
import { extname } from 'path';

/**
 * Server-side upload validation. Client-supplied filename and Content-Type are
 * never trusted: the stored MIME type is derived from the extension AND the
 * file's leading bytes must match that type's signature.
 */

type Signature = (b: Buffer) => boolean;

const starts = (...bytes: number[]): Signature => b =>
  b.length >= bytes.length && bytes.every((x, i) => b[i] === x);

const ZIP = starts(0x50, 0x4b, 0x03, 0x04);                         // docx/xlsx/pptx
const OLE = starts(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1); // doc/xls/ppt
const TEXT: Signature = b => !b.subarray(0, 8192).includes(0);       // no NUL bytes

const ALLOWED: Record<string, { mime: string; sig: Signature }> = {
  '.pdf':  { mime: 'application/pdf', sig: starts(0x25, 0x50, 0x44, 0x46) },
  '.png':  { mime: 'image/png', sig: starts(0x89, 0x50, 0x4e, 0x47) },
  '.jpg':  { mime: 'image/jpeg', sig: starts(0xff, 0xd8, 0xff) },
  '.jpeg': { mime: 'image/jpeg', sig: starts(0xff, 0xd8, 0xff) },
  '.gif':  { mime: 'image/gif', sig: starts(0x47, 0x49, 0x46, 0x38) },
  '.tif':  { mime: 'image/tiff', sig: b => starts(0x49, 0x49, 0x2a, 0x00)(b) || starts(0x4d, 0x4d, 0x00, 0x2a)(b) },
  '.tiff': { mime: 'image/tiff', sig: b => starts(0x49, 0x49, 0x2a, 0x00)(b) || starts(0x4d, 0x4d, 0x00, 0x2a)(b) },
  '.docx': { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', sig: ZIP },
  '.xlsx': { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', sig: ZIP },
  '.pptx': { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', sig: ZIP },
  '.doc':  { mime: 'application/msword', sig: OLE },
  '.xls':  { mime: 'application/vnd.ms-excel', sig: OLE },
  '.ppt':  { mime: 'application/vnd.ms-powerpoint', sig: OLE },
  '.txt':  { mime: 'text/plain', sig: TEXT },
  '.csv':  { mime: 'text/csv', sig: TEXT },
};

/** Strip paths, control chars and anything outside a conservative set; cap length. */
export function sanitizeFileName(raw: string | undefined): string {
  const base = (raw ?? '').split(/[\\/]/).pop() ?? '';
  const cleaned = base
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[^\p{L}\p{N} ._()-]/gu, '_')
    .replace(/^\.+/, '')
    .trim();
  if (!cleaned) return 'document';
  const ext = extname(cleaned);
  const stem = cleaned.slice(0, cleaned.length - ext.length).slice(0, 150);
  return `${stem || 'document'}${ext.toLowerCase()}`;
}

/** Returns the trusted MIME type, or throws 400 if type is disallowed or content mismatches. */
export function validateUpload(buffer: Buffer, safeName: string): string {
  if (!buffer.length) throw new BadRequestException('File is empty');
  const entry = ALLOWED[extname(safeName).toLowerCase()];
  if (!entry) {
    throw new BadRequestException(
      `File type not allowed. Allowed: ${Object.keys(ALLOWED).join(', ')}`,
    );
  }
  if (!entry.sig(buffer)) {
    throw new BadRequestException('File content does not match its extension');
  }
  return entry.mime;
}
