/**
 * Unit tests for effect-utils.
 *
 * No real WebGL or GPU operations — these tests verify the JS-side helpers and
 * constants only. The buddy is mocked with a Set-backed program registry to
 * exercise ensureProgram's idempotency.
 */

import { describe, it, expect, vi } from 'vitest';

import {
  BLUR_MAX_HALFWIDTH,
  BUILTIN_SHADER_SOURCES,
  EMBOSS_MATRIX_INVERTED,
  EMBOSS_MATRIX_STANDARD,
  NORMAL_DIR_INDEX,
  PROGRAMS,
  ensureBuiltinPrograms,
  ensureProgram,
  gaussianWeights,
} from './effect-utils';

import type WebGLPostProcessor from 'webgl-postprocessor';

interface MockBuddy {
  hasProgram: ReturnType<typeof vi.fn>;
  newProgram: ReturnType<typeof vi.fn>;
}

function createMockBuddy(): MockBuddy {
  const programs = new Set<string>();
  return {
    hasProgram: vi.fn((name: string) => programs.has(name)),
    newProgram: vi.fn((name: string, _config: { fragmentSrc: string }) => {
      programs.add(name);
    }),
  };
}

describe('ensureProgram', () => {
  it('registers a new program by calling newProgram with the fragment source', () => {
    const buddy = createMockBuddy();
    ensureProgram(buddy as unknown as WebGLPostProcessor, 'foo', 'shader source');
    expect(buddy.hasProgram).toHaveBeenCalledWith('foo');
    expect(buddy.newProgram).toHaveBeenCalledWith('foo', { fragmentSrc: 'shader source' });
  });

  it('is idempotent — second call does not re-register', () => {
    const buddy = createMockBuddy();
    ensureProgram(buddy as unknown as WebGLPostProcessor, 'foo', 'src');
    ensureProgram(buddy as unknown as WebGLPostProcessor, 'foo', 'src');
    expect(buddy.newProgram).toHaveBeenCalledTimes(1);
  });

  it('registers different programs independently', () => {
    const buddy = createMockBuddy();
    ensureProgram(buddy as unknown as WebGLPostProcessor, 'foo', 'src1');
    ensureProgram(buddy as unknown as WebGLPostProcessor, 'bar', 'src2');
    expect(buddy.newProgram).toHaveBeenCalledTimes(2);
    expect(buddy.newProgram).toHaveBeenNthCalledWith(1, 'foo', { fragmentSrc: 'src1' });
    expect(buddy.newProgram).toHaveBeenNthCalledWith(2, 'bar', { fragmentSrc: 'src2' });
  });
});

describe('ensureBuiltinPrograms', () => {
  it('registers every built-in program exactly once', () => {
    const buddy = createMockBuddy();
    ensureBuiltinPrograms(buddy as unknown as WebGLPostProcessor);
    expect(buddy.newProgram).toHaveBeenCalledTimes(Object.keys(BUILTIN_SHADER_SOURCES).length);
  });

  it('passes the matching shader source for each program name', () => {
    const buddy = createMockBuddy();
    ensureBuiltinPrograms(buddy as unknown as WebGLPostProcessor);
    for (const name of Object.values(PROGRAMS)) {
      expect(buddy.newProgram).toHaveBeenCalledWith(name, {
        fragmentSrc: BUILTIN_SHADER_SOURCES[name],
      });
    }
  });

  it('is idempotent — calling twice still results in one registration per program', () => {
    const buddy = createMockBuddy();
    ensureBuiltinPrograms(buddy as unknown as WebGLPostProcessor);
    ensureBuiltinPrograms(buddy as unknown as WebGLPostProcessor);
    expect(buddy.newProgram).toHaveBeenCalledTimes(Object.keys(BUILTIN_SHADER_SOURCES).length);
  });
});

describe('gaussianWeights', () => {
  const WEIGHTS_LENGTH = BLUR_MAX_HALFWIDTH + 1;

  it('returns identity kernel for sigma = 0', () => {
    const { weights, halfWidth } = gaussianWeights(0);
    expect(halfWidth).toBe(0);
    expect(weights[0]).toBe(1);
    for (let i = 1; i < weights.length; i++) {
      expect(weights[i]).toBe(0);
    }
  });

  it('treats negative sigma as identity', () => {
    const { weights, halfWidth } = gaussianWeights(-5);
    expect(halfWidth).toBe(0);
    expect(weights[0]).toBe(1);
  });

  it('produces a weights array of length BLUR_MAX_HALFWIDTH + 1 always', () => {
    expect(gaussianWeights(0).weights).toHaveLength(WEIGHTS_LENGTH);
    expect(gaussianWeights(1).weights).toHaveLength(WEIGHTS_LENGTH);
    expect(gaussianWeights(5).weights).toHaveLength(WEIGHTS_LENGTH);
    expect(gaussianWeights(50).weights).toHaveLength(WEIGHTS_LENGTH);
  });

  it('halfWidth = ceil(3 * sigma) for typical sigmas', () => {
    expect(gaussianWeights(1).halfWidth).toBe(3);
    expect(gaussianWeights(2).halfWidth).toBe(6);
    expect(gaussianWeights(5).halfWidth).toBe(15);
    expect(gaussianWeights(0.5).halfWidth).toBe(2);
  });

  it('caps halfWidth at BLUR_MAX_HALFWIDTH', () => {
    expect(gaussianWeights(20).halfWidth).toBe(BLUR_MAX_HALFWIDTH);
    expect(gaussianWeights(100).halfWidth).toBe(BLUR_MAX_HALFWIDTH);
  });

  it('weights sum to 1 with symmetric flanks', () => {
    for (const sigma of [0.5, 1, 2, 3.7, 8]) {
      const { weights, halfWidth } = gaussianWeights(sigma);
      let total = weights[0];
      for (let i = 1; i <= halfWidth; i++) {
        total += 2 * weights[i];
      }
      expect(total).toBeCloseTo(1, 6);
    }
  });

  it('weights are strictly descending from center', () => {
    const { weights, halfWidth } = gaussianWeights(2);
    for (let i = 1; i <= halfWidth; i++) {
      expect(weights[i]).toBeLessThan(weights[i - 1]);
    }
  });

  it('pads beyond halfWidth with zeros', () => {
    const { weights, halfWidth } = gaussianWeights(1);
    for (let i = halfWidth + 1; i < weights.length; i++) {
      expect(weights[i]).toBe(0);
    }
  });

  it('center weight is largest', () => {
    for (const sigma of [0.5, 1, 3, 10]) {
      const { weights } = gaussianWeights(sigma);
      const max = Math.max(...weights);
      expect(weights[0]).toBe(max);
    }
  });
});

describe('constants', () => {
  it('EMBOSS_MATRIX_STANDARD has 9 elements', () => {
    expect(EMBOSS_MATRIX_STANDARD).toHaveLength(9);
  });

  it('EMBOSS_MATRIX_INVERTED has 9 elements', () => {
    expect(EMBOSS_MATRIX_INVERTED).toHaveLength(9);
  });

  it('the two emboss matrices are 180-degree rotations of each other', () => {
    // The inverted matrix's element at index i equals the standard matrix's
    // element at index 8-i — i.e. reading the kernel backwards.
    for (let i = 0; i < 9; i++) {
      expect(EMBOSS_MATRIX_INVERTED[i]).toBe(EMBOSS_MATRIX_STANDARD[8 - i]);
    }
  });

  it('PROGRAMS exposes all built-in primitive names', () => {
    expect(Object.keys(PROGRAMS)).toHaveLength(8);
    expect(PROGRAMS.erode).toBeTruthy();
    expect(PROGRAMS.emboss).toBeTruthy();
    expect(PROGRAMS.blur).toBeTruthy();
    expect(PROGRAMS.fuzz).toBeTruthy();
    expect(PROGRAMS.normalMap).toBeTruthy();
    expect(PROGRAMS.colorScale).toBeTruthy();
    expect(PROGRAMS.passthrough).toBeTruthy();
    expect(PROGRAMS.premultiply).toBeTruthy();
  });

  it('BUILTIN_SHADER_SOURCES has a non-empty string source for every PROGRAMS entry', () => {
    for (const name of Object.values(PROGRAMS)) {
      const src = BUILTIN_SHADER_SOURCES[name];
      expect(typeof src).toBe('string');
      expect(src.length).toBeGreaterThan(0);
      expect(src).toMatch(/^#version 300 es/);
    }
  });

  it('NORMAL_DIR_INDEX maps all 8 cardinal/intercardinal directions', () => {
    expect(NORMAL_DIR_INDEX.N).toBe(0);
    expect(NORMAL_DIR_INDEX.NE).toBe(1);
    expect(NORMAL_DIR_INDEX.E).toBe(2);
    expect(NORMAL_DIR_INDEX.SE).toBe(3);
    expect(NORMAL_DIR_INDEX.S).toBe(4);
    expect(NORMAL_DIR_INDEX.SW).toBe(5);
    expect(NORMAL_DIR_INDEX.W).toBe(6);
    expect(NORMAL_DIR_INDEX.NW).toBe(7);
    expect(Object.keys(NORMAL_DIR_INDEX)).toHaveLength(8);
  });
});
