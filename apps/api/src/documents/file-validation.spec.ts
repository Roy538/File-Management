import { BadRequestException } from '@nestjs/common';
import { sanitizeFileName, validateUpload } from './file-validation';

const PDF = Buffer.from('%PDF-1.7\n...');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
const EXE = Buffer.from('MZ\x90\x00');

describe('sanitizeFileName', () => {
  it('strips directory components (path traversal)', () => {
    expect(sanitizeFileName('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFileName('..\\..\\boot.ini')).toBe('boot.ini');
  });
  it('removes control characters and unsafe symbols', () => {
    expect(sanitizeFileName('a\u0000b<script>.pdf')).toBe('ab_script_.pdf');
  });
  it('drops leading dots so hidden files cannot be created', () => {
    expect(sanitizeFileName('.htaccess')).toBe('htaccess');
  });
  it('lower-cases the extension and falls back to "document"', () => {
    expect(sanitizeFileName('Report.PDF')).toBe('Report.pdf');
    expect(sanitizeFileName(undefined)).toBe('document');
    expect(sanitizeFileName('////')).toBe('document');
  });
  it('caps very long names', () => {
    expect(sanitizeFileName('x'.repeat(500) + '.pdf').length).toBeLessThanOrEqual(154);
  });
});

describe('validateUpload', () => {
  it('derives the MIME type from a matching signature', () => {
    expect(validateUpload(PDF, 'a.pdf')).toBe('application/pdf');
    expect(validateUpload(PNG, 'a.png')).toBe('image/png');
  });
  it('rejects disallowed extensions', () => {
    expect(() => validateUpload(EXE, 'a.exe')).toThrow(BadRequestException);
  });
  it('rejects content that does not match the extension (spoofed type)', () => {
    expect(() => validateUpload(EXE, 'invoice.pdf')).toThrow('does not match');
  });
  it('rejects empty files', () => {
    expect(() => validateUpload(Buffer.alloc(0), 'a.pdf')).toThrow('empty');
  });
  it('rejects binary content disguised as text', () => {
    expect(() => validateUpload(Buffer.from([0x41, 0x00, 0x42]), 'a.txt')).toThrow(BadRequestException);
  });
});
