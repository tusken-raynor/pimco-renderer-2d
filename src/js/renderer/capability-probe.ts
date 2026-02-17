/**
 * Browser capability detection for OffscreenCanvas and WebGL2.
 *
 * Detects browser capabilities and determines the appropriate fallback scenario (A-F)
 * based on whether the code is running in main thread or worker, and available APIs.
 */

import type { CapabilityResult, FallbackScenario } from '../types/messages';

/**
 * Context in which the capability probe is running.
 */
export type ExecutionContext = 'main-thread' | 'worker';

/**
 * Detect browser capabilities for OffscreenCanvas and WebGL2.
 *
 * @returns Object with offscreenCanvas and webgl2 boolean flags
 */
export function detectCapabilities(): { offscreenCanvas: boolean; webgl2: boolean } {
  const offscreenCanvas = detectOffscreenCanvas();
  const webgl2 = detectWebGL2(offscreenCanvas);

  return {
    offscreenCanvas,
    webgl2,
  };
}

/**
 * Detect if OffscreenCanvas is available and functional.
 *
 * We need to actually try creating one because some browsers may
 * have the constructor but fail when actually using it.
 *
 * @returns true if OffscreenCanvas is available and functional
 */
export function detectOffscreenCanvas(): boolean {
  // Check if the constructor exists
  if (typeof OffscreenCanvas === 'undefined') {
    return false;
  }

  try {
    // Try to create a minimal OffscreenCanvas
    const canvas = new OffscreenCanvas(1, 1);
    // Try to get a 2D context to ensure it's fully functional
    const ctx = canvas.getContext('2d');
    return ctx !== null;
  } catch {
    // Safari or other browsers might throw
    return false;
  }
}

/**
 * Detect if WebGL2 is available.
 *
 * WebGL2 is required for text effect rendering with shaders.
 * We test using OffscreenCanvas if available, otherwise fall back to
 * creating a temporary HTMLCanvasElement.
 *
 * @param offscreenCanvasAvailable - Whether OffscreenCanvas is available
 * @returns true if WebGL2 is available
 */
export function detectWebGL2(offscreenCanvasAvailable: boolean): boolean {
  try {
    if (offscreenCanvasAvailable) {
      // Use OffscreenCanvas for WebGL2 detection
      const canvas = new OffscreenCanvas(1, 1);
      const gl = canvas.getContext('webgl2');
      return gl !== null;
    }

    // Fallback: check if we're in main thread and can use HTMLCanvasElement
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2');
      return gl !== null;
    }

    // In a worker without OffscreenCanvas, we can't detect WebGL2
    // Conservatively return false
    return false;
  } catch {
    return false;
  }
}

/**
 * Determine the execution context (main thread vs worker).
 *
 * @returns 'worker' if running in a Web Worker, 'main-thread' otherwise
 */
export function detectExecutionContext(): ExecutionContext {
  // In a worker, 'window' is undefined but 'self' is a WorkerGlobalScope
  // In main thread, both 'window' and 'self' exist and are the same
  if (typeof window === 'undefined' && typeof self !== 'undefined') {
    return 'worker';
  }
  return 'main-thread';
}

/**
 * Determine the fallback scenario based on capabilities and execution context.
 *
 * Scenarios:
 * - A: Main thread master, workers for both slave types (OffscreenCanvas + WebGL2)
 * - B: Main thread master, workers for standard, virtual for text (OffscreenCanvas, no WebGL2)
 * - C: Main thread master, virtual for both (no OffscreenCanvas)
 * - D: Worker master, workers for both (OffscreenCanvas + WebGL2)
 * - E: Worker master, workers for standard, virtual for text (OffscreenCanvas, no WebGL2)
 * - F: Worker master, virtual for both, software compositor (no OffscreenCanvas)
 *
 * @param context - Execution context ('main-thread' or 'worker')
 * @param offscreenCanvas - Whether OffscreenCanvas is available
 * @param webgl2 - Whether WebGL2 is available
 * @returns The appropriate fallback scenario
 */
export function determineScenario(
  context: ExecutionContext,
  offscreenCanvas: boolean,
  webgl2: boolean
): FallbackScenario {
  if (context === 'main-thread') {
    if (offscreenCanvas && webgl2) {
      return 'A';
    }
    if (offscreenCanvas && !webgl2) {
      return 'B';
    }
    // No OffscreenCanvas means virtual for both
    return 'C';
  }

  // Worker context
  if (offscreenCanvas && webgl2) {
    return 'D';
  }
  if (offscreenCanvas && !webgl2) {
    return 'E';
  }
  // No OffscreenCanvas in worker means software compositor
  return 'F';
}

/**
 * Run full capability probe and determine fallback scenario.
 *
 * This is the main entry point for capability detection.
 *
 * @returns CapabilityResult with all detected capabilities and scenario
 */
export function probeCapabilities(): CapabilityResult {
  const { offscreenCanvas, webgl2 } = detectCapabilities();
  const context = detectExecutionContext();
  const scenario = determineScenario(context, offscreenCanvas, webgl2);

  return {
    offscreenCanvas,
    webgl2,
    scenario,
  };
}

/**
 * Probe capabilities with a specific context override.
 *
 * Useful when the Master needs to determine slave scenarios
 * (slaves run in workers, so context would be 'worker').
 *
 * @param contextOverride - Override the execution context
 * @returns CapabilityResult with the overridden context
 */
export function probeCapabilitiesForContext(contextOverride: ExecutionContext): CapabilityResult {
  const { offscreenCanvas, webgl2 } = detectCapabilities();
  const scenario = determineScenario(contextOverride, offscreenCanvas, webgl2);

  return {
    offscreenCanvas,
    webgl2,
    scenario,
  };
}
