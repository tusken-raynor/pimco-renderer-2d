/**
 * Unit tests for the font-loader pieces of RenderMaster.
 * Covers the pure helpers; full `loadFontFamily()` end-to-end is exercised
 * via integration / dev-app smoke testing because it depends on the
 * AssetManager worker.
 */

import { describe, it, expect } from 'vitest';
import { parseFontFamilyList } from './index';

describe('parseFontFamilyList', () => {
  it('returns [] for undefined / empty input', () => {
    expect(parseFontFamilyList(undefined)).toEqual([]);
    expect(parseFontFamilyList('')).toEqual([]);
    expect(parseFontFamilyList('   ')).toEqual([]);
  });

  it('strips surrounding double quotes and whitespace', () => {
    expect(parseFontFamilyList('"Helvetica", sans-serif')).toEqual([
      'Helvetica',
      'sans-serif',
    ]);
  });

  it('strips surrounding single quotes', () => {
    expect(parseFontFamilyList("'Helvetica', sans-serif")).toEqual([
      'Helvetica',
      'sans-serif',
    ]);
  });

  it('preserves multi-word names and order', () => {
    expect(
      parseFontFamilyList('"AlternateGothicPro-No1", "Arial Narrow", sans-serif')
    ).toEqual(['AlternateGothicPro-No1', 'Arial Narrow', 'sans-serif']);
  });

  it('preserves generic families in place — they are not filtered', () => {
    // CSS fallback semantics: generics participate in the resolution walk.
    // The resolver only picks the first registered family; if a generic is
    // not registered, the resolver keeps walking, but the parser must not
    // strip it out preemptively.
    const result = parseFontFamilyList('serif, "MyFont", monospace');
    expect(result).toEqual(['serif', 'MyFont', 'monospace']);
  });

  it('skips empty tokens from trailing commas', () => {
    expect(parseFontFamilyList('"A", , "B",')).toEqual(['A', 'B']);
  });
});
