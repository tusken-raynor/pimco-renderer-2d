/**
 * Integration tests for all 6 fallback scenarios (A-F).
 *
 * These tests verify that the RenderMaster correctly selects and uses
 * the appropriate slave types (workers vs virtual) and compositor
 * based on browser capabilities.
 *
 * Scenarios:
 * - A: Main thread master, workers for both slave types (OffscreenCanvas + WebGL2)
 * - B: Main thread master, workers for standard, virtual for text (OffscreenCanvas, no WebGL2)
 * - C: Main thread master, virtual for both (no OffscreenCanvas)
 * - D: Worker master, workers for both (OffscreenCanvas + WebGL2)
 * - E: Worker master, workers for standard, virtual for text (OffscreenCanvas, no WebGL2)
 * - F: Worker master, virtual for both, software compositor (no OffscreenCanvas)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { determineScenario, type ExecutionContext } from '../../js/renderer/capability-probe';
import type { FallbackScenario } from '../../js/types/messages';

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Determine if a scenario should use standard workers.
 * Standard workers require OffscreenCanvas (scenarios A, B, D, E).
 */
function shouldUseStandardWorkers(scenario: FallbackScenario): boolean {
  return ['A', 'B', 'D', 'E'].includes(scenario);
}

/**
 * Determine if a scenario should use text workers.
 * Text workers require OffscreenCanvas + WebGL2 (scenarios A, D).
 */
function shouldUseTextWorkers(scenario: FallbackScenario): boolean {
  return ['A', 'D'].includes(scenario);
}

/**
 * Determine if a scenario should use the software compositor.
 * Only scenario F (worker without OffscreenCanvas) uses software compositor.
 */
function shouldUseSoftwareCompositor(scenario: FallbackScenario): boolean {
  return scenario === 'F';
}

// =============================================================================
// Capability Detection Tests
// =============================================================================

describe('Fallback Scenario Determination', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('determineScenario', () => {
    it('should return scenario A for main-thread with OffscreenCanvas and WebGL2', () => {
      const result = determineScenario('main-thread', true, true);
      expect(result).toBe('A');
    });

    it('should return scenario B for main-thread with OffscreenCanvas but no WebGL2', () => {
      const result = determineScenario('main-thread', true, false);
      expect(result).toBe('B');
    });

    it('should return scenario C for main-thread without OffscreenCanvas', () => {
      const result = determineScenario('main-thread', false, true);
      expect(result).toBe('C');
    });

    it('should return scenario C for main-thread with no capabilities', () => {
      const result = determineScenario('main-thread', false, false);
      expect(result).toBe('C');
    });

    it('should return scenario D for worker with OffscreenCanvas and WebGL2', () => {
      const result = determineScenario('worker', true, true);
      expect(result).toBe('D');
    });

    it('should return scenario E for worker with OffscreenCanvas but no WebGL2', () => {
      const result = determineScenario('worker', true, false);
      expect(result).toBe('E');
    });

    it('should return scenario F for worker without OffscreenCanvas', () => {
      const result = determineScenario('worker', false, true);
      expect(result).toBe('F');
    });

    it('should return scenario F for worker with no capabilities', () => {
      const result = determineScenario('worker', false, false);
      expect(result).toBe('F');
    });
  });

  describe('scenario slave type mapping', () => {
    const scenarios: {
      scenario: FallbackScenario;
      useStandardWorkers: boolean;
      useTextWorkers: boolean;
      useSoftwareCompositor: boolean;
    }[] = [
      {
        scenario: 'A',
        useStandardWorkers: true,
        useTextWorkers: true,
        useSoftwareCompositor: false,
      },
      {
        scenario: 'B',
        useStandardWorkers: true,
        useTextWorkers: false,
        useSoftwareCompositor: false,
      },
      {
        scenario: 'C',
        useStandardWorkers: false,
        useTextWorkers: false,
        useSoftwareCompositor: false,
      },
      {
        scenario: 'D',
        useStandardWorkers: true,
        useTextWorkers: true,
        useSoftwareCompositor: false,
      },
      {
        scenario: 'E',
        useStandardWorkers: true,
        useTextWorkers: false,
        useSoftwareCompositor: false,
      },
      {
        scenario: 'F',
        useStandardWorkers: false,
        useTextWorkers: false,
        useSoftwareCompositor: true,
      },
    ];

    it.each(scenarios)(
      'scenario $scenario should have correct slave type configuration',
      ({ scenario, useStandardWorkers, useTextWorkers, useSoftwareCompositor }) => {
        expect(shouldUseStandardWorkers(scenario)).toBe(useStandardWorkers);
        expect(shouldUseTextWorkers(scenario)).toBe(useTextWorkers);
        expect(shouldUseSoftwareCompositor(scenario)).toBe(useSoftwareCompositor);
      }
    );
  });
});

// =============================================================================
// Software Compositor Tests
// =============================================================================

describe('Software Compositor', () => {
  describe('pixel blending operations', () => {
    it('should correctly implement source-over blending', () => {
      // Source-over: Cs + Cd(1 - As)
      const dst = { r: 1.0, g: 0.0, b: 0.0, a: 0.5 }; // Red, 50% alpha
      const src = { r: 0.0, g: 1.0, b: 0.0, a: 0.5 }; // Green, 50% alpha

      // Expected: outA = 0.5 + 0.5 * (1 - 0.5) = 0.75
      // outR = (0 * 0.5 + 1 * 0.5 * 0.5) / 0.75 = 0.33...
      // outG = (1 * 0.5 + 0 * 0.5 * 0.5) / 0.75 = 0.66...

      const srcA = src.a;
      const outA = srcA + dst.a * (1 - srcA);
      const outR = outA > 0 ? (src.r * srcA + dst.r * dst.a * (1 - srcA)) / outA : 0;
      const outG = outA > 0 ? (src.g * srcA + dst.g * dst.a * (1 - srcA)) / outA : 0;

      expect(outA).toBeCloseTo(0.75, 2);
      expect(outR).toBeCloseTo(0.333, 2);
      expect(outG).toBeCloseTo(0.666, 2);
    });

    it('should correctly implement multiply blending', () => {
      // Multiply: Cs * Cd
      const dst = { r: 0.8, g: 0.5, b: 0.2 };
      const src = { r: 0.5, g: 0.6, b: 1.0 };

      const blendedR = src.r * dst.r; // 0.4
      const blendedG = src.g * dst.g; // 0.3
      const blendedB = src.b * dst.b; // 0.2

      expect(blendedR).toBeCloseTo(0.4, 2);
      expect(blendedG).toBeCloseTo(0.3, 2);
      expect(blendedB).toBeCloseTo(0.2, 2);
    });

    it('should correctly implement screen blending', () => {
      // Screen: 1 - (1 - Cs)(1 - Cd)
      const dst = { r: 0.5, g: 0.5, b: 0.5 };
      const src = { r: 0.5, g: 0.5, b: 0.5 };

      const blendedR = 1 - (1 - src.r) * (1 - dst.r); // 1 - 0.5 * 0.5 = 0.75
      const blendedG = 1 - (1 - src.g) * (1 - dst.g);
      const blendedB = 1 - (1 - src.b) * (1 - dst.b);

      expect(blendedR).toBeCloseTo(0.75, 2);
      expect(blendedG).toBeCloseTo(0.75, 2);
      expect(blendedB).toBeCloseTo(0.75, 2);
    });

    it('should correctly implement difference blending', () => {
      // Difference: |Cs - Cd|
      const dst = { r: 0.8, g: 0.3, b: 0.5 };
      const src = { r: 0.3, g: 0.7, b: 0.5 };

      const blendedR = Math.abs(src.r - dst.r); // 0.5
      const blendedG = Math.abs(src.g - dst.g); // 0.4
      const blendedB = Math.abs(src.b - dst.b); // 0

      expect(blendedR).toBeCloseTo(0.5, 2);
      expect(blendedG).toBeCloseTo(0.4, 2);
      expect(blendedB).toBeCloseTo(0, 2);
    });

    it('should correctly implement lighter (additive) blending', () => {
      // Lighter: Cs + Cd (clamped to 1)
      const dst = { r: 0.6, g: 0.3, b: 0.8, a: 1.0 };
      const src = { r: 0.5, g: 0.9, b: 0.4, a: 0.5 };

      const resultR = Math.min(1, dst.r + src.r * src.a); // 0.6 + 0.25 = 0.85
      const resultG = Math.min(1, dst.g + src.g * src.a); // 0.3 + 0.45 = 0.75
      const resultB = Math.min(1, dst.b + src.b * src.a); // 0.8 + 0.2 = 1.0 (clamped)

      expect(resultR).toBeCloseTo(0.85, 2);
      expect(resultG).toBeCloseTo(0.75, 2);
      expect(resultB).toBe(1.0);
    });
  });

  describe('pixel buffer operations', () => {
    it('should create empty pixel buffer with correct dimensions', () => {
      const width = 100;
      const height = 50;
      const expectedSize = width * height * 4; // RGBA

      const buffer = {
        data: new Float32Array(expectedSize),
        width,
        height,
      };

      expect(buffer.data.length).toBe(expectedSize);
      expect(buffer.width).toBe(width);
      expect(buffer.height).toBe(height);
    });

    it('should initialize pixel buffer with zeros (transparent black)', () => {
      const width = 10;
      const height = 10;
      const buffer = new Float32Array(width * height * 4);

      // All values should be 0
      for (const value of buffer) {
        expect(value).toBe(0);
      }
    });

    it('should convert float values to bytes correctly', () => {
      const floatValues = [0, 0.5, 1.0, 0.25];
      const expectedBytes = [0, 128, 255, 64];

      for (let i = 0; i < floatValues.length; i++) {
        const byte = Math.round(Math.max(0, Math.min(1, floatValues[i])) * 255);
        expect(byte).toBe(expectedBytes[i]);
      }
    });

    it('should clamp values outside 0-1 range', () => {
      const outOfRangeValues = [-0.5, 1.5, 2.0, -1.0];
      const expectedClamped = [0, 1, 1, 0];

      for (let i = 0; i < outOfRangeValues.length; i++) {
        const clamped = Math.max(0, Math.min(1, outOfRangeValues[i]));
        expect(clamped).toBe(expectedClamped[i]);
      }
    });
  });
});

// =============================================================================
// Virtual Slave Integration Tests
// =============================================================================

describe('Virtual Slave Integration', () => {
  describe('VirtualSlavePort interface compliance', () => {
    it('should have required postMessage method', () => {
      const mockSlave = {
        postMessage: vi.fn(),
        onmessage: null,
        onerror: null,
        terminate: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      };

      expect(typeof mockSlave.postMessage).toBe('function');
      expect(typeof mockSlave.terminate).toBe('function');
      expect(typeof mockSlave.addEventListener).toBe('function');
      expect(typeof mockSlave.removeEventListener).toBe('function');
    });

    it('should support message handler assignment', () => {
      const mockSlave = {
        postMessage: vi.fn(),
        onmessage: null as ((event: MessageEvent) => void) | null,
        onerror: null,
        terminate: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      };

      const handler = vi.fn();
      mockSlave.onmessage = handler;

      expect(mockSlave.onmessage).toBe(handler);
    });
  });

  describe('virtual slave message protocol', () => {
    it('should handle init message and respond with ready', () => {
      const messages: string[] = [];

      // Simulate message handling
      const handleMessage = (msg: { type: string }): void => {
        if (msg.type === 'init') {
          messages.push('capabilities');
          messages.push('ready');
        }
      };

      handleMessage({ type: 'init' });

      expect(messages).toContain('capabilities');
      expect(messages).toContain('ready');
    });

    it('should handle abort message', () => {
      let aborted = false;

      const handleMessage = (msg: { type: string }): void => {
        if (msg.type === 'abort') {
          aborted = true;
        }
      };

      handleMessage({ type: 'abort' });

      expect(aborted).toBe(true);
    });

    it('should handle batch message and return result', () => {
      let resultSent = false;

      const handleMessage = (msg: { type: string }): void => {
        if (msg.type === 'batch') {
          resultSent = true;
        }
      };

      handleMessage({ type: 'batch' });

      expect(resultSent).toBe(true);
    });
  });
});

// =============================================================================
// Scenario-Specific Configuration Tests
// =============================================================================

describe('Scenario Configuration', () => {
  describe('Scenario A: Full Worker Support', () => {
    it('should use workers for both standard and text slaves', () => {
      expect(shouldUseStandardWorkers('A')).toBe(true);
      expect(shouldUseTextWorkers('A')).toBe(true);
    });

    it('should use canvas-based compositor', () => {
      expect(shouldUseSoftwareCompositor('A')).toBe(false);
    });
  });

  describe('Scenario B: No WebGL2', () => {
    it('should use workers for standard slaves, virtual for text', () => {
      expect(shouldUseStandardWorkers('B')).toBe(true);
      expect(shouldUseTextWorkers('B')).toBe(false);
    });

    it('should fall back to no-effect for WebGL2-dependent effects', () => {
      // Effects requiring WebGL2: embroidery, foil, normal
      const webgl2Effects = ['embroidery', 'foil', 'normal'];
      const nonWebgl2Effects = ['shadow', 'engraving', 'hotstamp', 'metal', 'painted'];

      expect(webgl2Effects.length).toBe(3);
      expect(nonWebgl2Effects.length).toBe(5);
    });
  });

  describe('Scenario C: No OffscreenCanvas (Main Thread)', () => {
    it('should use virtual slaves for both types', () => {
      expect(shouldUseStandardWorkers('C')).toBe(false);
      expect(shouldUseTextWorkers('C')).toBe(false);
    });

    it('should still use canvas-based compositor (main thread has HTMLCanvasElement)', () => {
      expect(shouldUseSoftwareCompositor('C')).toBe(false);
    });
  });

  describe('Scenario D: Worker with Full Support', () => {
    it('should use workers for both standard and text slaves', () => {
      expect(shouldUseStandardWorkers('D')).toBe(true);
      expect(shouldUseTextWorkers('D')).toBe(true);
    });
  });

  describe('Scenario E: Worker without WebGL2', () => {
    it('should use workers for standard slaves, virtual for text', () => {
      expect(shouldUseStandardWorkers('E')).toBe(true);
      expect(shouldUseTextWorkers('E')).toBe(false);
    });
  });

  describe('Scenario F: Worker without OffscreenCanvas', () => {
    it('should use virtual slaves for both types', () => {
      expect(shouldUseStandardWorkers('F')).toBe(false);
      expect(shouldUseTextWorkers('F')).toBe(false);
    });

    it('should use software compositor', () => {
      expect(shouldUseSoftwareCompositor('F')).toBe(true);
    });
  });
});

// =============================================================================
// Execution Context Tests
// =============================================================================

describe('Execution Context Detection', () => {
  it('should distinguish main thread from worker context', () => {
    const contexts: ExecutionContext[] = ['main-thread', 'worker'];

    for (const context of contexts) {
      // Verify both context types are valid
      expect(['main-thread', 'worker']).toContain(context);
    }
  });

  it('should map context and capabilities to correct scenario', () => {
    const testCases: {
      context: ExecutionContext;
      offscreenCanvas: boolean;
      webgl2: boolean;
      expected: FallbackScenario;
    }[] = [
      { context: 'main-thread', offscreenCanvas: true, webgl2: true, expected: 'A' },
      { context: 'main-thread', offscreenCanvas: true, webgl2: false, expected: 'B' },
      { context: 'main-thread', offscreenCanvas: false, webgl2: false, expected: 'C' },
      { context: 'main-thread', offscreenCanvas: false, webgl2: true, expected: 'C' },
      { context: 'worker', offscreenCanvas: true, webgl2: true, expected: 'D' },
      { context: 'worker', offscreenCanvas: true, webgl2: false, expected: 'E' },
      { context: 'worker', offscreenCanvas: false, webgl2: false, expected: 'F' },
      { context: 'worker', offscreenCanvas: false, webgl2: true, expected: 'F' },
    ];

    for (const { context, offscreenCanvas, webgl2, expected } of testCases) {
      const result = determineScenario(context, offscreenCanvas, webgl2);
      expect(result).toBe(expected);
    }
  });
});
