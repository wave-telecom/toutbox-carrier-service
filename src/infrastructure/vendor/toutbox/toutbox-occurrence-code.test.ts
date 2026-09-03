import { describe, expect, it } from 'vitest';
import { mapOccurrenceCode } from './toutbox-occurrence-code.js';

describe('mapOccurrenceCode', () => {
  it.each([
    ['6', 'DELIVERED'],
    ['91', 'CREATED'],
    ['155', 'CANCELLED'],
  ])('maps code %s to %s', (code, expected) => {
    expect(mapOccurrenceCode(code)).toBe(expected);
  });

  it('returns undefined for an unmapped code', () => {
    expect(mapOccurrenceCode('999')).toBeUndefined();
  });
});
