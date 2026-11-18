import { describe, expect, it } from 'vitest';
import { validateMetadata, compactMetadata } from './MetadataFields';
import { orderFolders } from './queries';
import type { FolderNode, MetadataFieldView } from '@/lib/api/types';

const field = (key: string, dataType: MetadataFieldView['dataType'], required = false, allowedValues: string[] = []): MetadataFieldView =>
  ({ id: key, key, label: key, dataType, required, allowedValues });

describe('validateMetadata', () => {
  const fields = [field('no', 'TEXT', true), field('amount', 'NUMBER'), field('start', 'DATE'), field('grade', 'ENUM', false, ['G1', 'G2']), field('ok', 'BOOLEAN')];

  it('reports every problem at once, like the server', () => {
    expect(validateMetadata(fields, { amount: 'abc', start: '01/02/2026', grade: 'G9', ok: 'maybe' })).toEqual({
      no: 'no is required', amount: 'Enter a number', start: 'Enter a date', grade: 'Choose one of the listed values', ok: 'Choose yes or no',
    });
  });

  it('accepts valid values and ignores empty optional ones', () => {
    expect(validateMetadata(fields, { no: 'E-1', amount: '12.5', start: '2026-02-01', grade: 'G2', ok: 'true' })).toEqual({});
    expect(validateMetadata(fields, { no: 'E-1', amount: '  ' })).toEqual({});
  });

  it('sends only non-empty, trimmed values', () => {
    expect(compactMetadata({ a: ' x ', b: '', c: '  ' })).toEqual({ a: 'x' });
  });
});

describe('orderFolders', () => {
  const f = (id: string, parentId: string | null): FolderNode => ({ id, parentId, name: id, depth: 1, subDividers: [], rights: [] });
  it('puts every parent before its children', () => {
    expect(orderFolders([f('c', 'b'), f('a', null), f('b', 'a'), f('d', null)]).map((x) => x.id)).toEqual(['a', 'b', 'c', 'd']);
  });
});
