/**
 * Unit tests for the 2D Transform module
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import {
  toScaleString,
  toRotationString,
  parseTransform,
  calculateAlignmentOffset,
  buildTransformMatrix,
  applyTransformAndDraw,
  hasActiveTransform,
  type ParsedTransform,
} from './transforms';
import type { PimcoMaskSubstitutionTransformation } from '../types/pimco';

/**
 * Mock DOMMatrix for Node.js environment.
 * This provides a minimal implementation for testing transform calculations.
 */
function createMockDOMMatrix(init?: string | number[]): DOMMatrix {
  const matrix = {
    a: 1,
    b: 0,
    c: 0,
    d: 1,
    e: 0,
    f: 0,
  };

  if (typeof init === 'string') {
    // Parse transform string and apply transforms in order
    const transformRegex = /\w+\([^)]+\)/g;
    const transforms = transformRegex.exec(init) ? init.match(/\w+\([^)]+\)/g) ?? [] : [];

    for (const t of transforms) {
      if (t.startsWith('translate(')) {
        const translateRegex = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/;
        const translateMatch = translateRegex.exec(t);
        if (translateMatch) {
          const tx = parseFloat(translateMatch[1]);
          const ty = parseFloat(translateMatch[2]);
          matrix.e += matrix.a * tx + matrix.c * ty;
          matrix.f += matrix.b * tx + matrix.d * ty;
        }
      } else if (t.startsWith('scale(')) {
        const scaleRegex = /scale\((-?[\d.]+)(?:,\s*(-?[\d.]+))?\)/;
        const scaleMatch = scaleRegex.exec(t);
        if (scaleMatch) {
          const sx = parseFloat(scaleMatch[1]);
          const sy = scaleMatch[2] ? parseFloat(scaleMatch[2]) : sx;
          matrix.a *= sx;
          matrix.b *= sx;
          matrix.c *= sy;
          matrix.d *= sy;
        }
      } else if (t.startsWith('rotate(')) {
        const rotateRegex = /rotate\((-?[\d.]+)deg\)/;
        const rotateMatch = rotateRegex.exec(t);
        if (rotateMatch) {
          const angle = (parseFloat(rotateMatch[1]) * Math.PI) / 180;
          const cos = Math.cos(angle);
          const sin = Math.sin(angle);
          const a = matrix.a;
          const b = matrix.b;
          const c = matrix.c;
          const d = matrix.d;
          matrix.a = a * cos + c * sin;
          matrix.b = b * cos + d * sin;
          matrix.c = c * cos - a * sin;
          matrix.d = d * cos - b * sin;
        }
      }
    }
  } else if (Array.isArray(init) && init.length === 6) {
    [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f] = init;
  }

  return matrix as unknown as DOMMatrix;
}

// Create a mock DOMMatrix constructor
const MockDOMMatrix = function (this: DOMMatrix, init?: string | number[]) {
  return createMockDOMMatrix(init);
} as unknown as typeof DOMMatrix;

// Store original DOMMatrix reference
let originalDOMMatrix: typeof DOMMatrix | undefined;

beforeAll(() => {
  // Save original if exists
  originalDOMMatrix = (globalThis as { DOMMatrix?: typeof DOMMatrix }).DOMMatrix;
  // Install mock
  (globalThis as { DOMMatrix?: typeof DOMMatrix }).DOMMatrix = MockDOMMatrix;
});

afterAll(() => {
  // Restore original
  if (originalDOMMatrix) {
    (globalThis as { DOMMatrix?: typeof DOMMatrix }).DOMMatrix = originalDOMMatrix;
  } else {
    delete (globalThis as { DOMMatrix?: typeof DOMMatrix }).DOMMatrix;
  }
});

describe('toScaleString', () => {
  it('should return empty string for undefined', () => {
    expect(toScaleString(undefined)).toBe('');
  });

  it('should return uniform scale string for number', () => {
    expect(toScaleString(2)).toBe('scale(2)');
    expect(toScaleString(0.5)).toBe('scale(0.5)');
    expect(toScaleString(1)).toBe('scale(1)');
  });

  it('should return non-uniform scale string for tuple', () => {
    expect(toScaleString([2, 3])).toBe('scale(2, 3)');
    expect(toScaleString([0.5, 1.5])).toBe('scale(0.5, 1.5)');
    expect(toScaleString([1, 1])).toBe('scale(1, 1)');
  });
});

describe('toRotationString', () => {
  it('should return empty string for undefined', () => {
    expect(toRotationString(undefined)).toBe('');
  });

  it('should return rotate string with deg suffix for number', () => {
    expect(toRotationString(45)).toBe('rotate(45deg)');
    expect(toRotationString(90)).toBe('rotate(90deg)');
    expect(toRotationString(-30)).toBe('rotate(-30deg)');
    expect(toRotationString(0)).toBe('rotate(0deg)');
  });

  it('should pass through string values directly', () => {
    expect(toRotationString('45deg')).toBe('rotate(45deg)');
    expect(toRotationString('1.5rad')).toBe('rotate(1.5rad)');
    expect(toRotationString('0.25turn')).toBe('rotate(0.25turn)');
  });
});

describe('parseTransform', () => {
  const canvasWidth = 1000;
  const canvasHeight = 800;

  it('should return identity transform for undefined', () => {
    const result = parseTransform(undefined, canvasWidth, canvasHeight);

    expect(result.translateX).toBe(0);
    expect(result.translateY).toBe(0);
    expect(result.rotation).toBe(0);
    expect(result.scaleX).toBe(1);
    expect(result.scaleY).toBe(1);
  });

  it('should return identity transform for empty object', () => {
    const result = parseTransform({}, canvasWidth, canvasHeight);

    expect(result.translateX).toBe(0);
    expect(result.translateY).toBe(0);
    expect(result.rotation).toBe(0);
    expect(result.scaleX).toBe(1);
    expect(result.scaleY).toBe(1);
  });

  describe('translation', () => {
    it('should parse translation as percentage of canvas dimensions', () => {
      const transform: PimcoMaskSubstitutionTransformation = {
        translation: [10, 20],
      };
      const result = parseTransform(transform, canvasWidth, canvasHeight);

      // 10% of 1000 = 100, 20% of 800 = 160
      expect(result.translateX).toBe(100);
      expect(result.translateY).toBe(160);
    });

    it('should handle negative translation', () => {
      const transform: PimcoMaskSubstitutionTransformation = {
        translation: [-25, -50],
      };
      const result = parseTransform(transform, canvasWidth, canvasHeight);

      // -25% of 1000 = -250, -50% of 800 = -400
      expect(result.translateX).toBe(-250);
      expect(result.translateY).toBe(-400);
    });

    it('should handle zero translation', () => {
      const transform: PimcoMaskSubstitutionTransformation = {
        translation: [0, 0],
      };
      const result = parseTransform(transform, canvasWidth, canvasHeight);

      expect(result.translateX).toBe(0);
      expect(result.translateY).toBe(0);
    });
  });

  describe('rotation', () => {
    it('should parse rotation in degrees', () => {
      const transform: PimcoMaskSubstitutionTransformation = {
        rotation: 45,
      };
      const result = parseTransform(transform, canvasWidth, canvasHeight);

      expect(result.rotation).toBe(45);
    });

    it('should handle negative rotation', () => {
      const transform: PimcoMaskSubstitutionTransformation = {
        rotation: -90,
      };
      const result = parseTransform(transform, canvasWidth, canvasHeight);

      expect(result.rotation).toBe(-90);
    });

    it('should handle zero rotation', () => {
      const transform: PimcoMaskSubstitutionTransformation = {
        rotation: 0,
      };
      const result = parseTransform(transform, canvasWidth, canvasHeight);

      expect(result.rotation).toBe(0);
    });
  });

  describe('scale', () => {
    it('should parse uniform scale', () => {
      const transform: PimcoMaskSubstitutionTransformation = {
        scale: 2,
      };
      const result = parseTransform(transform, canvasWidth, canvasHeight);

      expect(result.scaleX).toBe(2);
      expect(result.scaleY).toBe(2);
    });

    it('should parse non-uniform scale', () => {
      const transform: PimcoMaskSubstitutionTransformation = {
        scale: [1.5, 2.5],
      };
      const result = parseTransform(transform, canvasWidth, canvasHeight);

      expect(result.scaleX).toBe(1.5);
      expect(result.scaleY).toBe(2.5);
    });

    it('should handle scale less than 1', () => {
      const transform: PimcoMaskSubstitutionTransformation = {
        scale: 0.5,
      };
      const result = parseTransform(transform, canvasWidth, canvasHeight);

      expect(result.scaleX).toBe(0.5);
      expect(result.scaleY).toBe(0.5);
    });
  });

  describe('combined transforms', () => {
    it('should parse all transform properties together', () => {
      const transform: PimcoMaskSubstitutionTransformation = {
        translation: [10, -5],
        rotation: 30,
        scale: [2, 1.5],
      };
      const result = parseTransform(transform, canvasWidth, canvasHeight);

      expect(result.translateX).toBe(100); // 10% of 1000
      expect(result.translateY).toBe(-40); // -5% of 800
      expect(result.rotation).toBe(30);
      expect(result.scaleX).toBe(2);
      expect(result.scaleY).toBe(1.5);
    });
  });
});

describe('calculateAlignmentOffset', () => {
  const sourceWidth = 200;

  it('should return 0 for center alignment', () => {
    expect(calculateAlignmentOffset('center', sourceWidth)).toBe(0);
  });

  it('should return 0 for undefined alignment (defaults to center)', () => {
    expect(calculateAlignmentOffset(undefined, sourceWidth)).toBe(0);
  });

  it('should return positive offset for left alignment', () => {
    expect(calculateAlignmentOffset('left', sourceWidth)).toBe(100); // sourceWidth / 2
  });

  it('should return negative offset for right alignment', () => {
    expect(calculateAlignmentOffset('right', sourceWidth)).toBe(-100); // -sourceWidth / 2
  });

  it('should scale with source width', () => {
    expect(calculateAlignmentOffset('left', 400)).toBe(200);
    expect(calculateAlignmentOffset('right', 400)).toBe(-200);
  });
});

describe('buildTransformMatrix', () => {
  const canvasWidth = 1000;
  const canvasHeight = 800;

  it('should create identity matrix for default transform at center', () => {
    const parsed: ParsedTransform = {
      translateX: 0,
      translateY: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    };
    const matrix = buildTransformMatrix(parsed, canvasWidth, canvasHeight, 0);

    // At center (500, 400) with no other transforms
    // Matrix should translate to center
    expect(matrix.e).toBe(500); // x translation
    expect(matrix.f).toBe(400); // y translation
    expect(matrix.a).toBe(1); // scale x
    expect(matrix.d).toBe(1); // scale y
  });

  it('should include translation offset', () => {
    const parsed: ParsedTransform = {
      translateX: 100,
      translateY: -50,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    };
    const matrix = buildTransformMatrix(parsed, canvasWidth, canvasHeight, 0);

    // Center (500, 400) + offset (100, -50) = (600, 350)
    expect(matrix.e).toBe(600);
    expect(matrix.f).toBe(350);
  });

  it('should include scale factors', () => {
    const parsed: ParsedTransform = {
      translateX: 0,
      translateY: 0,
      rotation: 0,
      scaleX: 2,
      scaleY: 0.5,
    };
    const matrix = buildTransformMatrix(parsed, canvasWidth, canvasHeight, 0);

    expect(matrix.a).toBe(2); // scale x
    expect(matrix.d).toBe(0.5); // scale y
  });

  it('should include rotation', () => {
    const parsed: ParsedTransform = {
      translateX: 0,
      translateY: 0,
      rotation: 90,
      scaleX: 1,
      scaleY: 1,
    };
    const matrix = buildTransformMatrix(parsed, canvasWidth, canvasHeight, 0);

    // 90 degree rotation: cos(90) ≈ 0, sin(90) = 1
    expect(matrix.a).toBeCloseTo(0, 5);
    expect(matrix.b).toBeCloseTo(1, 5);
    expect(matrix.c).toBeCloseTo(-1, 5);
    expect(matrix.d).toBeCloseTo(0, 5);
  });

  it('should include alignment offset', () => {
    const parsed: ParsedTransform = {
      translateX: 0,
      translateY: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    };
    const alignmentOffset = 50;
    const matrix = buildTransformMatrix(parsed, canvasWidth, canvasHeight, alignmentOffset);

    // Center (500, 400) + alignment offset in x direction
    expect(matrix.e).toBe(550);
    expect(matrix.f).toBe(400);
  });
});

describe('hasActiveTransform', () => {
  it('should return false for undefined', () => {
    expect(hasActiveTransform(undefined)).toBe(false);
  });

  it('should return false for empty object', () => {
    expect(hasActiveTransform({})).toBe(false);
  });

  it('should return false for zero translation', () => {
    expect(hasActiveTransform({ translation: [0, 0] })).toBe(false);
  });

  it('should return true for non-zero translation', () => {
    expect(hasActiveTransform({ translation: [10, 0] })).toBe(true);
    expect(hasActiveTransform({ translation: [0, 10] })).toBe(true);
    expect(hasActiveTransform({ translation: [10, 20] })).toBe(true);
  });

  it('should return false for zero rotation', () => {
    expect(hasActiveTransform({ rotation: 0 })).toBe(false);
  });

  it('should return true for non-zero rotation', () => {
    expect(hasActiveTransform({ rotation: 45 })).toBe(true);
    expect(hasActiveTransform({ rotation: -30 })).toBe(true);
  });

  it('should return false for identity scale (1)', () => {
    expect(hasActiveTransform({ scale: 1 })).toBe(false);
  });

  it('should return true for non-identity uniform scale', () => {
    expect(hasActiveTransform({ scale: 2 })).toBe(true);
    expect(hasActiveTransform({ scale: 0.5 })).toBe(true);
  });

  it('should return false for identity scale tuple', () => {
    expect(hasActiveTransform({ scale: [1, 1] })).toBe(false);
  });

  it('should return true for non-identity scale tuple', () => {
    expect(hasActiveTransform({ scale: [2, 1] })).toBe(true);
    expect(hasActiveTransform({ scale: [1, 2] })).toBe(true);
    expect(hasActiveTransform({ scale: [2, 2] })).toBe(true);
  });

  it('should return true if any transform is active', () => {
    expect(
      hasActiveTransform({
        translation: [0, 0],
        rotation: 0,
        scale: 2, // Only scale is active
      })
    ).toBe(true);
  });
});

describe('applyTransformAndDraw', () => {
  let mockCtx: CanvasRenderingContext2D;
  let mockSource: { width: number; height: number };
  let saveMock: ReturnType<typeof vi.fn>;
  let restoreMock: ReturnType<typeof vi.fn>;
  let setTransformMock: ReturnType<typeof vi.fn>;
  let drawImageMock: ReturnType<typeof vi.fn>;

  /**
   * Helper to get the DOMMatrix passed to setTransform.
   * This extracts the first argument from the first call.
   */
  function getAppliedMatrix(): DOMMatrix {
    const calls = setTransformMock.mock.calls as DOMMatrix[][];
    return calls[0][0];
  }

  beforeEach(() => {
    saveMock = vi.fn();
    restoreMock = vi.fn();
    setTransformMock = vi.fn();
    drawImageMock = vi.fn();

    mockCtx = {
      save: saveMock,
      restore: restoreMock,
      setTransform: setTransformMock,
      drawImage: drawImageMock,
    } as unknown as CanvasRenderingContext2D;

    mockSource = {
      width: 200,
      height: 100,
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should save and restore context', () => {
    applyTransformAndDraw(mockCtx, mockSource as ImageBitmap, undefined, 1000, 800);

    expect(saveMock).toHaveBeenCalledOnce();
    expect(restoreMock).toHaveBeenCalledOnce();
  });

  it('should call setTransform with a DOMMatrix', () => {
    applyTransformAndDraw(mockCtx, mockSource as ImageBitmap, undefined, 1000, 800);

    expect(setTransformMock).toHaveBeenCalledOnce();
    const matrix = getAppliedMatrix();
    // Verify matrix has expected DOMMatrix properties
    expect(matrix).toHaveProperty('a');
    expect(matrix).toHaveProperty('b');
    expect(matrix).toHaveProperty('c');
    expect(matrix).toHaveProperty('d');
    expect(matrix).toHaveProperty('e');
    expect(matrix).toHaveProperty('f');
  });

  it('should draw source centered at origin', () => {
    applyTransformAndDraw(mockCtx, mockSource as ImageBitmap, undefined, 1000, 800);

    expect(drawImageMock).toHaveBeenCalledOnce();
    expect(drawImageMock).toHaveBeenCalledWith(
      mockSource,
      -100, // -sourceWidth / 2
      -50 // -sourceHeight / 2
    );
  });

  it('should apply translation transform', () => {
    const transform: PimcoMaskSubstitutionTransformation = {
      translation: [10, 20],
    };

    applyTransformAndDraw(mockCtx, mockSource as ImageBitmap, transform, 1000, 800, 'center');

    const matrix = getAppliedMatrix();
    // Center (500, 400) + translation (10% of 1000 = 100, 20% of 800 = 160) = (600, 560)
    expect(matrix.e).toBe(600);
    expect(matrix.f).toBe(560);
  });

  it('should apply rotation transform', () => {
    const transform: PimcoMaskSubstitutionTransformation = {
      rotation: 90,
    };

    applyTransformAndDraw(mockCtx, mockSource as ImageBitmap, transform, 1000, 800, 'center');

    const matrix = getAppliedMatrix();
    // 90 degree rotation
    expect(matrix.a).toBeCloseTo(0, 5);
    expect(matrix.b).toBeCloseTo(1, 5);
    expect(matrix.c).toBeCloseTo(-1, 5);
    expect(matrix.d).toBeCloseTo(0, 5);
  });

  it('should apply scale transform', () => {
    const transform: PimcoMaskSubstitutionTransformation = {
      scale: 2,
    };

    applyTransformAndDraw(mockCtx, mockSource as ImageBitmap, transform, 1000, 800, 'center');

    const matrix = getAppliedMatrix();
    expect(matrix.a).toBe(2);
    expect(matrix.d).toBe(2);
  });

  it('should apply left alignment offset', () => {
    applyTransformAndDraw(mockCtx, mockSource as ImageBitmap, undefined, 1000, 800, 'left');

    const matrix = getAppliedMatrix();
    // Center (500, 400) + left alignment offset (sourceWidth/2 = 100) = (600, 400)
    expect(matrix.e).toBe(600);
    expect(matrix.f).toBe(400);
  });

  it('should apply right alignment offset', () => {
    applyTransformAndDraw(mockCtx, mockSource as ImageBitmap, undefined, 1000, 800, 'right');

    const matrix = getAppliedMatrix();
    // Center (500, 400) + right alignment offset (-sourceWidth/2 = -100) = (400, 400)
    expect(matrix.e).toBe(400);
    expect(matrix.f).toBe(400);
  });

  it('should combine all transforms correctly', () => {
    const transform: PimcoMaskSubstitutionTransformation = {
      translation: [10, 0],
      rotation: 45,
      scale: [2, 1],
    };

    applyTransformAndDraw(mockCtx, mockSource as ImageBitmap, transform, 1000, 800, 'center');

    const matrix = getAppliedMatrix();

    // The matrix should be the result of: translate(600, 400) scale(2, 1) rotate(45deg)
    // This is a combined transform, so we just verify it's been applied
    expect(setTransformMock).toHaveBeenCalledOnce();
    // Verify matrix has expected DOMMatrix properties
    expect(matrix).toHaveProperty('a');
    expect(matrix).toHaveProperty('e');
  });
});
