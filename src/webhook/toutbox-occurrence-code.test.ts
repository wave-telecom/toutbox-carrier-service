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

  // RSK-DLV-002 - the map above is built on the Manual de 01/07. Contract v1
  // (12/07) supersedes it: section 7.2 closes the webhook to three *final* states
  // (delivered, cancelled - always type CE - and returned to sender) and says every
  // intermediate event "is not sent by webhook".
  //
  // '91' Pedido Integrado is intermediate, so by the contract it never arrives here
  // again. Mapping it keeps a dead branch alive that silently moves an order back to
  // CREATED if it ever fires.
  //
  // `it.fails` because '91' is still mapped today. Removing it from the map errors
  // this test out; it then becomes a plain `it`.
  it.fails('does not map 91 (Pedido Integrado): section 7.2 never sends intermediate events', () => {
    expect(mapOccurrenceCode('91')).toBeUndefined();
  });

  // Same section: codOcorrencia is a symbolic string in contract v1
  // ("AWAITING_CONFIRMATION" in its own example), not the numeric code of the old
  // manual. The exact symbols for the three finalisers are still missing - they come
  // in the de<>para annex the contract promises and has not delivered (P-25), so the
  // symbolic cases cannot be asserted here yet. What can be asserted is that a
  // symbolic code does not resolve through the numeric map by accident.
  it('does not resolve a symbolic codOcorrencia through the numeric map', () => {
    expect(mapOccurrenceCode('AWAITING_CONFIRMATION')).toBeUndefined();
    expect(mapOccurrenceCode('DELIVERED')).toBeUndefined();
  });
});
