import { BadRequestException } from '@nestjs/common';
import { FileStatus } from '@prisma/client';
import { assertTransition, allowedTransitions } from './file-status.machine';

describe('File Status Machine', () => {
  describe('assertTransition — allowed transitions', () => {
    const allowed: [FileStatus, FileStatus][] = [
      [FileStatus.AVAILABLE,  FileStatus.DISPATCHED],
      [FileStatus.AVAILABLE,  FileStatus.ARCHIVED],
      [FileStatus.AVAILABLE,  FileStatus.MISSING],
      [FileStatus.DISPATCHED, FileStatus.RETURNED],
      [FileStatus.DISPATCHED, FileStatus.MISSING],
      [FileStatus.RETURNED,   FileStatus.AVAILABLE],
      [FileStatus.RETURNED,   FileStatus.ARCHIVED],
      [FileStatus.ARCHIVED,   FileStatus.AVAILABLE],
      [FileStatus.MISSING,    FileStatus.AVAILABLE],
      [FileStatus.MISSING,    FileStatus.ARCHIVED],
    ];

    it.each(allowed)('%s → %s should not throw', (from, to) => {
      expect(() => assertTransition(from, to)).not.toThrow();
    });
  });

  describe('assertTransition — blocked transitions', () => {
    const blocked: [FileStatus, FileStatus][] = [
      [FileStatus.AVAILABLE,  FileStatus.RETURNED],
      [FileStatus.AVAILABLE,  FileStatus.AVAILABLE],
      [FileStatus.DISPATCHED, FileStatus.AVAILABLE],
      [FileStatus.DISPATCHED, FileStatus.ARCHIVED],
      [FileStatus.DISPATCHED, FileStatus.DISPATCHED],
      [FileStatus.RETURNED,   FileStatus.DISPATCHED],
      [FileStatus.RETURNED,   FileStatus.RETURNED],
      [FileStatus.ARCHIVED,   FileStatus.DISPATCHED],
      [FileStatus.ARCHIVED,   FileStatus.ARCHIVED],
      [FileStatus.MISSING,    FileStatus.DISPATCHED],
      [FileStatus.MISSING,    FileStatus.RETURNED],
    ];

    it.each(blocked)('%s → %s should throw BadRequestException', (from, to) => {
      expect(() => assertTransition(from, to)).toThrow(BadRequestException);
    });
  });

  describe('allowedTransitions', () => {
    it('returns correct set for AVAILABLE', () => {
      expect(allowedTransitions(FileStatus.AVAILABLE)).toEqual(
        expect.arrayContaining([FileStatus.DISPATCHED, FileStatus.ARCHIVED, FileStatus.MISSING]),
      );
      expect(allowedTransitions(FileStatus.AVAILABLE)).not.toContain(FileStatus.RETURNED);
    });

    it('returns empty array for ARCHIVED', () => {
      expect(allowedTransitions(FileStatus.ARCHIVED).length).toBeGreaterThanOrEqual(1);
    });
  });
});
