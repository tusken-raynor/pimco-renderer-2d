import { describe, it, expect, beforeEach } from 'vitest';
import { destroyProjection, initProjection, _meshResourceCacheSize } from './projection';
import { destroyWebGLBuddy } from '../effects';

/**
 * These tests cover the surface that doesn't require a real WebGL2 context —
 * primarily the no-buddy / no-init guard paths. The full rendering behavior
 * is exercised end-to-end in the dev app against real example data.
 */

describe('projection module', () => {
  beforeEach(() => {
    destroyProjection();
    destroyWebGLBuddy();
  });

  describe('initProjection', () => {
    it('returns false when initWebGLBuddy has not been called', () => {
      expect(initProjection()).toBe(false);
    });

    it('starts with an empty mesh resource cache', () => {
      expect(_meshResourceCacheSize()).toBe(0);
    });
  });

  describe('destroyProjection', () => {
    it('clears the mesh resource cache', () => {
      destroyProjection();
      expect(_meshResourceCacheSize()).toBe(0);
    });

    it('is idempotent', () => {
      destroyProjection();
      destroyProjection();
      expect(_meshResourceCacheSize()).toBe(0);
    });
  });
});
