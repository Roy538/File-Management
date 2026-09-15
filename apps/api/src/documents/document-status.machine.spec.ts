import { BadRequestException } from '@nestjs/common';
import { DocumentStatus } from '@prisma/client';
import { assertDocTransition, allowedDocTransitions } from './document-status.machine';

const { DRAFT, CHECKED_IN, CHECKED_OUT, ON_HOLD, FINALIZED, ARCHIVED } = DocumentStatus;

describe('Document Status Machine', () => {
  describe('assertDocTransition — allowed transitions', () => {
    const allowed: [DocumentStatus, DocumentStatus][] = [
      [DRAFT,       CHECKED_IN],
      [CHECKED_IN,  CHECKED_OUT],
      [CHECKED_IN,  ON_HOLD],
      [CHECKED_IN,  FINALIZED],
      [CHECKED_IN,  ARCHIVED],
      [CHECKED_OUT, CHECKED_IN],
      [CHECKED_OUT, ARCHIVED],
      [ON_HOLD,     CHECKED_IN],
      [ON_HOLD,     ARCHIVED],
      [FINALIZED,   ARCHIVED],
    ];

    it.each(allowed)('%s → %s should not throw', (from, to) => {
      expect(() => assertDocTransition(from, to)).not.toThrow();
    });
  });

  describe('assertDocTransition — blocked transitions', () => {
    const blocked: [DocumentStatus, DocumentStatus][] = [
      [DRAFT,       CHECKED_OUT],
      [DRAFT,       ON_HOLD],
      [DRAFT,       FINALIZED],
      [DRAFT,       ARCHIVED],
      [DRAFT,       DRAFT],
      [CHECKED_IN,  DRAFT],
      [CHECKED_IN,  CHECKED_IN],
      [CHECKED_OUT, DRAFT],
      [CHECKED_OUT, FINALIZED],
      [CHECKED_OUT, ON_HOLD],
      [ON_HOLD,     DRAFT],
      [ON_HOLD,     CHECKED_OUT],
      [ON_HOLD,     FINALIZED],
      [FINALIZED,   CHECKED_IN],
      [FINALIZED,   CHECKED_OUT],
      [FINALIZED,   DRAFT],
      [ARCHIVED,    DRAFT],
      [ARCHIVED,    CHECKED_IN],
      [ARCHIVED,    FINALIZED],
    ];

    it.each(blocked)('%s → %s should throw BadRequestException', (from, to) => {
      expect(() => assertDocTransition(from, to)).toThrow(BadRequestException);
    });
  });

  describe('ARCHIVED is a terminal state', () => {
    it('allows no further transitions', () => {
      expect(allowedDocTransitions(ARCHIVED)).toHaveLength(0);
    });
  });

  describe('allowedDocTransitions', () => {
    it('returns CHECKED_IN as only option from DRAFT', () => {
      expect(allowedDocTransitions(DRAFT)).toEqual([CHECKED_IN]);
    });

    it('returns 4 options from CHECKED_IN', () => {
      const opts = allowedDocTransitions(CHECKED_IN);
      expect(opts).toHaveLength(4);
      expect(opts).toContain(CHECKED_OUT);
      expect(opts).toContain(ON_HOLD);
      expect(opts).toContain(FINALIZED);
      expect(opts).toContain(ARCHIVED);
    });
  });
});
