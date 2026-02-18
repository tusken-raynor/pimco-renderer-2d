/**
 * Unit tests for capability-probe.ts
 *
 * Tests all 6 fallback scenarios and capability detection logic
 * using mocked browser APIs.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  detectOffscreenCanvas,
  detectWebGL2,
  detectExecutionContext,
  determineScenario,
  probeCapabilities,
  probeCapabilitiesForContext,
  detectCapabilities,
} from './capability-probe';

describe('capability-probe', () => {
  describe('determineScenario', () => {
    describe('main-thread context', () => {
      it('should return scenario A when OffscreenCanvas and WebGL2 are available', () => {
        expect(determineScenario('main-thread', true, true)).toBe('A');
      });

      it('should return scenario B when OffscreenCanvas is available but WebGL2 is not', () => {
        expect(determineScenario('main-thread', true, false)).toBe('B');
      });

      it('should return scenario C when OffscreenCanvas is not available (WebGL2 true)', () => {
        expect(determineScenario('main-thread', false, true)).toBe('C');
      });

      it('should return scenario C when neither OffscreenCanvas nor WebGL2 is available', () => {
        expect(determineScenario('main-thread', false, false)).toBe('C');
      });
    });

    describe('worker context', () => {
      it('should return scenario D when OffscreenCanvas and WebGL2 are available', () => {
        expect(determineScenario('worker', true, true)).toBe('D');
      });

      it('should return scenario E when OffscreenCanvas is available but WebGL2 is not', () => {
        expect(determineScenario('worker', true, false)).toBe('E');
      });

      it('should return scenario F when OffscreenCanvas is not available (WebGL2 true)', () => {
        expect(determineScenario('worker', false, true)).toBe('F');
      });

      it('should return scenario F when neither OffscreenCanvas nor WebGL2 is available', () => {
        expect(determineScenario('worker', false, false)).toBe('F');
      });
    });
  });

  describe('detectOffscreenCanvas', () => {
    let originalOffscreenCanvas: typeof OffscreenCanvas | undefined;

    afterEach(() => {
      // Restore original (may be undefined in some environments)
      if (originalOffscreenCanvas !== undefined) {
        globalThis.OffscreenCanvas = originalOffscreenCanvas;
      } else {
        // @ts-expect-error - Deleting global for test cleanup
        delete globalThis.OffscreenCanvas;
      }
    });

    it('should return false when OffscreenCanvas is undefined', () => {
      originalOffscreenCanvas = globalThis.OffscreenCanvas;
      // @ts-expect-error - Deleting global for test
      delete globalThis.OffscreenCanvas;
      expect(detectOffscreenCanvas()).toBe(false);
    });

    it('should return true when OffscreenCanvas works correctly', () => {
      originalOffscreenCanvas = globalThis.OffscreenCanvas;
      // Mock OffscreenCanvas that returns a valid context
      const mockContext = {};
      const MockOffscreenCanvas = vi.fn().mockImplementation(() => ({
        getContext: vi.fn().mockReturnValue(mockContext),
      }));

      globalThis.OffscreenCanvas = MockOffscreenCanvas as unknown as typeof OffscreenCanvas;

      expect(detectOffscreenCanvas()).toBe(true);
      expect(MockOffscreenCanvas).toHaveBeenCalledWith(1, 1);
    });

    it('should return false when OffscreenCanvas constructor throws', () => {
      originalOffscreenCanvas = globalThis.OffscreenCanvas;
      const MockOffscreenCanvas = vi.fn().mockImplementation(() => {
        throw new Error('Not supported');
      });

      globalThis.OffscreenCanvas = MockOffscreenCanvas as unknown as typeof OffscreenCanvas;

      expect(detectOffscreenCanvas()).toBe(false);
    });

    it('should return false when getContext returns null', () => {
      originalOffscreenCanvas = globalThis.OffscreenCanvas;
      const MockOffscreenCanvas = vi.fn().mockImplementation(() => ({
        getContext: vi.fn().mockReturnValue(null),
      }));

      globalThis.OffscreenCanvas = MockOffscreenCanvas as unknown as typeof OffscreenCanvas;

      expect(detectOffscreenCanvas()).toBe(false);
    });
  });

  describe('detectWebGL2', () => {
    let originalOffscreenCanvas: typeof OffscreenCanvas | undefined;
    let originalDocument: typeof document | undefined;

    afterEach(() => {
      // Restore originals
      if (originalOffscreenCanvas !== undefined) {
        globalThis.OffscreenCanvas = originalOffscreenCanvas;
      } else {
        // @ts-expect-error - Deleting global for test cleanup
        delete globalThis.OffscreenCanvas;
      }
      if (originalDocument !== undefined) {
        globalThis.document = originalDocument;
      }
    });

    it('should return true when WebGL2 is available via OffscreenCanvas', () => {
      originalOffscreenCanvas = globalThis.OffscreenCanvas;
      const mockGl = {};
      const MockOffscreenCanvas = vi.fn().mockImplementation(() => ({
        getContext: vi.fn().mockReturnValue(mockGl),
      }));

      globalThis.OffscreenCanvas = MockOffscreenCanvas as unknown as typeof OffscreenCanvas;

      expect(detectWebGL2(true)).toBe(true);
    });

    it('should return false when WebGL2 is not available via OffscreenCanvas', () => {
      originalOffscreenCanvas = globalThis.OffscreenCanvas;
      const MockOffscreenCanvas = vi.fn().mockImplementation(() => ({
        getContext: vi.fn().mockReturnValue(null),
      }));

      globalThis.OffscreenCanvas = MockOffscreenCanvas as unknown as typeof OffscreenCanvas;

      expect(detectWebGL2(true)).toBe(false);
    });

    it('should use HTMLCanvasElement when OffscreenCanvas is not available', () => {
      originalDocument = globalThis.document;
      const mockGl = {};
      const mockCanvas = {
        getContext: vi.fn().mockReturnValue(mockGl),
      };
      const mockDocument = {
        createElement: vi.fn().mockReturnValue(mockCanvas),
      };

      globalThis.document = mockDocument as unknown as Document;

      expect(detectWebGL2(false)).toBe(true);
      expect(mockDocument.createElement).toHaveBeenCalledWith('canvas');
      expect(mockCanvas.getContext).toHaveBeenCalledWith('webgl2');
    });

    it('should return false when neither OffscreenCanvas nor document is available', () => {
      originalDocument = globalThis.document;
      // @ts-expect-error - Deleting global for test
      delete globalThis.document;

      expect(detectWebGL2(false)).toBe(false);
    });

    it('should return false when WebGL2 context creation throws', () => {
      originalOffscreenCanvas = globalThis.OffscreenCanvas;
      const MockOffscreenCanvas = vi.fn().mockImplementation(() => ({
        getContext: vi.fn().mockImplementation(() => {
          throw new Error('WebGL2 not supported');
        }),
      }));

      globalThis.OffscreenCanvas = MockOffscreenCanvas as unknown as typeof OffscreenCanvas;

      expect(detectWebGL2(true)).toBe(false);
    });
  });

  describe('detectExecutionContext', () => {
    let originalWindow: typeof window | undefined;
    let originalSelf: typeof self | undefined;

    afterEach(() => {
      // Restore originals
      if (originalWindow !== undefined) {
        globalThis.window = originalWindow;
      }
      if (originalSelf !== undefined) {
        globalThis.self = originalSelf;
      }
    });

    it('should return "main-thread" when window is defined', () => {
      // Default environment in Vitest is like a browser
      expect(detectExecutionContext()).toBe('main-thread');
    });

    it('should return "worker" when window is undefined but self is defined', () => {
      originalWindow = globalThis.window;
      originalSelf = globalThis.self;
      // @ts-expect-error - Deleting global for test
      delete globalThis.window;
      // self should still exist (simulating worker environment)
      globalThis.self = {} as typeof self;

      expect(detectExecutionContext()).toBe('worker');
    });
  });

  describe('detectCapabilities', () => {
    let originalOffscreenCanvas: typeof OffscreenCanvas | undefined;

    afterEach(() => {
      if (originalOffscreenCanvas !== undefined) {
        globalThis.OffscreenCanvas = originalOffscreenCanvas;
      } else {
        // @ts-expect-error - Deleting global for test cleanup
        delete globalThis.OffscreenCanvas;
      }
    });

    it('should return both capabilities detected', () => {
      originalOffscreenCanvas = globalThis.OffscreenCanvas;
      const MockOffscreenCanvas = vi.fn().mockImplementation(() => ({
        getContext: vi.fn().mockReturnValue({}),
      }));

      globalThis.OffscreenCanvas = MockOffscreenCanvas as unknown as typeof OffscreenCanvas;

      const result = detectCapabilities();

      expect(result).toEqual({
        offscreenCanvas: true,
        webgl2: true,
      });
    });

    it('should detect when capabilities are not available', () => {
      originalOffscreenCanvas = globalThis.OffscreenCanvas;
      // @ts-expect-error - Deleting global for test
      delete globalThis.OffscreenCanvas;

      const result = detectCapabilities();

      expect(result.offscreenCanvas).toBe(false);
    });
  });

  describe('probeCapabilities', () => {
    let originalOffscreenCanvas: typeof OffscreenCanvas | undefined;

    afterEach(() => {
      if (originalOffscreenCanvas !== undefined) {
        globalThis.OffscreenCanvas = originalOffscreenCanvas;
      } else {
        // @ts-expect-error - Deleting global for test cleanup
        delete globalThis.OffscreenCanvas;
      }
    });

    it('should return full capability result with scenario', () => {
      originalOffscreenCanvas = globalThis.OffscreenCanvas;
      const MockOffscreenCanvas = vi.fn().mockImplementation(() => ({
        getContext: vi.fn().mockReturnValue({}),
      }));

      globalThis.OffscreenCanvas = MockOffscreenCanvas as unknown as typeof OffscreenCanvas;

      const result = probeCapabilities();

      expect(result.offscreenCanvas).toBe(true);
      expect(result.webgl2).toBe(true);
      // In test environment (main thread), should be scenario A
      expect(result.scenario).toBe('A');
    });
  });

  describe('probeCapabilitiesForContext', () => {
    let originalOffscreenCanvas: typeof OffscreenCanvas | undefined;

    afterEach(() => {
      if (originalOffscreenCanvas !== undefined) {
        globalThis.OffscreenCanvas = originalOffscreenCanvas;
      } else {
        // @ts-expect-error - Deleting global for test cleanup
        delete globalThis.OffscreenCanvas;
      }
    });

    it('should use overridden context for scenario determination', () => {
      originalOffscreenCanvas = globalThis.OffscreenCanvas;
      const MockOffscreenCanvas = vi.fn().mockImplementation(() => ({
        getContext: vi.fn().mockReturnValue({}),
      }));

      globalThis.OffscreenCanvas = MockOffscreenCanvas as unknown as typeof OffscreenCanvas;

      // Even though we're in main thread, override to worker context
      const result = probeCapabilitiesForContext('worker');

      expect(result.offscreenCanvas).toBe(true);
      expect(result.webgl2).toBe(true);
      // Should return worker scenario D instead of main thread scenario A
      expect(result.scenario).toBe('D');
    });

    it('should return scenario E for worker with OffscreenCanvas but no WebGL2', () => {
      originalOffscreenCanvas = globalThis.OffscreenCanvas;
      const MockOffscreenCanvas = vi.fn().mockImplementation(() => ({
        getContext: vi.fn().mockImplementation((type: string) => {
          // Return context for 2d, null for webgl2
          if (type === '2d') {
            return {};
          }
          return null;
        }),
      }));

      globalThis.OffscreenCanvas = MockOffscreenCanvas as unknown as typeof OffscreenCanvas;

      const result = probeCapabilitiesForContext('worker');

      expect(result.offscreenCanvas).toBe(true);
      expect(result.webgl2).toBe(false);
      expect(result.scenario).toBe('E');
    });
  });

  describe('all 6 scenarios coverage', () => {
    it('scenario A: main-thread + OffscreenCanvas + WebGL2', () => {
      const result = determineScenario('main-thread', true, true);
      expect(result).toBe('A');
    });

    it('scenario B: main-thread + OffscreenCanvas - WebGL2', () => {
      const result = determineScenario('main-thread', true, false);
      expect(result).toBe('B');
    });

    it('scenario C: main-thread - OffscreenCanvas', () => {
      const result = determineScenario('main-thread', false, false);
      expect(result).toBe('C');
    });

    it('scenario D: worker + OffscreenCanvas + WebGL2', () => {
      const result = determineScenario('worker', true, true);
      expect(result).toBe('D');
    });

    it('scenario E: worker + OffscreenCanvas - WebGL2', () => {
      const result = determineScenario('worker', true, false);
      expect(result).toBe('E');
    });

    it('scenario F: worker - OffscreenCanvas', () => {
      const result = determineScenario('worker', false, false);
      expect(result).toBe('F');
    });
  });
});
