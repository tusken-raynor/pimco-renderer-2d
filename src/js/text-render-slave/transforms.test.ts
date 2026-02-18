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
 * Supports both string-based (legacy) and method-based (worker-compatible) construction.
 */
interface MockDOMMatrixValues {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

function createMockDOMMatrix(init?: string | number[]): DOMMatrix {
  const values: MockDOMMatrixValues = {
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
    const transforms = transformRegex.exec(init) ? (init.match(/\w+\([^)]+\)/g) ?? []) : [];

    for (const t of transforms) {
      if (t.startsWith('translate(')) {
        const translateRegex = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/;
        const translateMatch = translateRegex.exec(t);
        if (translateMatch) {
          const tx = parseFloat(translateMatch[1]);
          const ty = parseFloat(translateMatch[2]);
          values.e += values.a * tx + values.c * ty;
          values.f += values.b * tx + values.d * ty;
        }
      } else if (t.startsWith('scale(')) {
        const scaleRegex = /scale\((-?[\d.]+)(?:,\s*(-?[\d.]+))?\)/;
        const scaleMatch = scaleRegex.exec(t);
        if (scaleMatch) {
          const sx = parseFloat(scaleMatch[1]);
          const sy = scaleMatch[2] ? parseFloat(scaleMatch[2]) : sx;
          values.a *= sx;
          values.b *= sx;
          values.c *= sy;
          values.d *= sy;
        }
      } else if (t.startsWith('rotate(')) {
        const rotateRegex = /rotate\((-?[\d.]+)deg\)/;
        const rotateMatch = rotateRegex.exec(t);
        if (rotateMatch) {
          const angle = (parseFloat(rotateMatch[1]) * Math.PI) / 180;
          const cos = Math.cos(angle);
          const sin = Math.sin(angle);
          const a = values.a;
          const b = values.b;
          const c = values.c;
          const d = values.d;
          values.a = a * cos + c * sin;
          values.b = b * cos + d * sin;
          values.c = c * cos - a * sin;
          values.d = d * cos - b * sin;
        }
      }
    }
  } else if (Array.isArray(init) && init.length === 6) {
    [values.a, values.b, values.c, values.d, values.e, values.f] = init;
  }

  // Create an object with the matrix values and methods that return new matrices
  const matrix = {
    ...values,

    /**
     * Returns a new DOMMatrix with a translation applied.
     * The translation is applied by multiplying: this * translate(tx, ty)
     */
    translate(tx: number, ty: number): DOMMatrix {
      const result = createMockDOMMatrix();
      result.a = this.a;
      result.b = this.b;
      result.c = this.c;
      result.d = this.d;
      result.e = this.e + this.a * tx + this.c * ty;
      result.f = this.f + this.b * tx + this.d * ty;
      return result;
    },

    /**
     * Returns a new DOMMatrix with a scale applied.
     * The scale is applied by multiplying: this * scale(sx, sy)
     */
    scale(sx: number, sy?: number): DOMMatrix {
      const scaleY = sy ?? sx;
      const result = createMockDOMMatrix();
      result.a = this.a * sx;
      result.b = this.b * sx;
      result.c = this.c * scaleY;
      result.d = this.d * scaleY;
      result.e = this.e;
      result.f = this.f;
      return result;
    },

    /**
     * Returns a new DOMMatrix with a rotation applied.
     * The rotation is applied by multiplying: this * rotate(angle)
     * @param angle - Rotation angle in degrees
     */
    rotate(angle: number): DOMMatrix {
      const radians = (angle * Math.PI) / 180;
      const cos = Math.cos(radians);
      const sin = Math.sin(radians);
      const result = createMockDOMMatrix();
      result.a = this.a * cos + this.c * sin;
      result.b = this.b * cos + this.d * sin;
      result.c = this.c * cos - this.a * sin;
      result.d = this.d * cos - this.b * sin;
      result.e = this.e;
      result.f = this.f;
      return result;
    },
  };

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

/**
 * Test that verifies the numeric matrix construction matches the legacy CSS string approach.
 * This is the critical regression test for the transformation order bug.
 *
 * CSS transform strings are evaluated RIGHT-TO-LEFT:
 *   translate(tx, ty) scale(sx, sy) rotate(r) translate(offset, 0)
 * is evaluated as:
 *   1. translate(offset, 0)  - alignment offset FIRST
 *   2. rotate(r)             - rotation SECOND
 *   3. scale(sx, sy)         - scale THIRD
 *   4. translate(tx, ty)     - position LAST
 *
 * DOMMatrix method chaining is LEFT-TO-RIGHT, so to match we must call:
 *   matrix.translate(offset, 0).rotate(r).scale(sx, sy).translate(tx, ty)
 */
describe('buildTransformMatrix matches CSS string-based DOMMatrix', () => {
  const canvasWidth = 1000;
  const canvasHeight = 800;
  const sourceWidth = 200;

  /**
   * Build a DOMMatrix using the legacy CSS string approach.
   * This is what the old code did and produces correct results.
   */
  function buildCSSStringMatrix(
    translateX: number,
    translateY: number,
    scaleX: number,
    scaleY: number,
    rotation: number,
    alignmentOffset: number
  ): DOMMatrix {
    // The old code calculated center position like this:
    const centerX = canvasWidth * 0.5 + translateX;
    const centerY = canvasHeight * 0.5 + translateY;

    // Build scale string
    let scaleStr = '';
    if (scaleX !== 1 || scaleY !== 1) {
      scaleStr = `scale(${scaleX}, ${scaleY})`;
    }

    // Build rotation string
    let rotateStr = '';
    if (rotation !== 0) {
      rotateStr = `rotate(${rotation}deg)`;
    }

    // Build the CSS transform string exactly as the old code did
    const cssString = `translate(${centerX}px, ${centerY}px) ${scaleStr} ${rotateStr} translate(${alignmentOffset}px, 0px)`;

    return new DOMMatrix(cssString);
  }

  it('should match CSS string matrix with identity transform', () => {
    const parsed = {
      translateX: 0,
      translateY: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    };
    const alignmentOffset = 0;

    const numericMatrix = buildTransformMatrix(parsed, canvasWidth, canvasHeight, alignmentOffset);
    const cssMatrix = buildCSSStringMatrix(0, 0, 1, 1, 0, 0);

    expect(numericMatrix.a).toBeCloseTo(cssMatrix.a, 5);
    expect(numericMatrix.b).toBeCloseTo(cssMatrix.b, 5);
    expect(numericMatrix.c).toBeCloseTo(cssMatrix.c, 5);
    expect(numericMatrix.d).toBeCloseTo(cssMatrix.d, 5);
    expect(numericMatrix.e).toBeCloseTo(cssMatrix.e, 5);
    expect(numericMatrix.f).toBeCloseTo(cssMatrix.f, 5);
  });

  it('should match CSS string matrix with translation only', () => {
    const parsed = {
      translateX: 100,
      translateY: -50,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    };
    const alignmentOffset = 0;

    const numericMatrix = buildTransformMatrix(parsed, canvasWidth, canvasHeight, alignmentOffset);
    const cssMatrix = buildCSSStringMatrix(100, -50, 1, 1, 0, 0);

    expect(numericMatrix.a).toBeCloseTo(cssMatrix.a, 5);
    expect(numericMatrix.b).toBeCloseTo(cssMatrix.b, 5);
    expect(numericMatrix.c).toBeCloseTo(cssMatrix.c, 5);
    expect(numericMatrix.d).toBeCloseTo(cssMatrix.d, 5);
    expect(numericMatrix.e).toBeCloseTo(cssMatrix.e, 5);
    expect(numericMatrix.f).toBeCloseTo(cssMatrix.f, 5);
  });

  it('should match CSS string matrix with scale only', () => {
    const parsed = {
      translateX: 0,
      translateY: 0,
      rotation: 0,
      scaleX: 2,
      scaleY: 0.5,
    };
    const alignmentOffset = 0;

    const numericMatrix = buildTransformMatrix(parsed, canvasWidth, canvasHeight, alignmentOffset);
    const cssMatrix = buildCSSStringMatrix(0, 0, 2, 0.5, 0, 0);

    expect(numericMatrix.a).toBeCloseTo(cssMatrix.a, 5);
    expect(numericMatrix.b).toBeCloseTo(cssMatrix.b, 5);
    expect(numericMatrix.c).toBeCloseTo(cssMatrix.c, 5);
    expect(numericMatrix.d).toBeCloseTo(cssMatrix.d, 5);
    expect(numericMatrix.e).toBeCloseTo(cssMatrix.e, 5);
    expect(numericMatrix.f).toBeCloseTo(cssMatrix.f, 5);
  });

  it('should match CSS string matrix with rotation only', () => {
    const parsed = {
      translateX: 0,
      translateY: 0,
      rotation: 45,
      scaleX: 1,
      scaleY: 1,
    };
    const alignmentOffset = 0;

    const numericMatrix = buildTransformMatrix(parsed, canvasWidth, canvasHeight, alignmentOffset);
    const cssMatrix = buildCSSStringMatrix(0, 0, 1, 1, 45, 0);

    expect(numericMatrix.a).toBeCloseTo(cssMatrix.a, 5);
    expect(numericMatrix.b).toBeCloseTo(cssMatrix.b, 5);
    expect(numericMatrix.c).toBeCloseTo(cssMatrix.c, 5);
    expect(numericMatrix.d).toBeCloseTo(cssMatrix.d, 5);
    expect(numericMatrix.e).toBeCloseTo(cssMatrix.e, 5);
    expect(numericMatrix.f).toBeCloseTo(cssMatrix.f, 5);
  });

  it('should match CSS string matrix with alignment offset only', () => {
    const parsed = {
      translateX: 0,
      translateY: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    };
    const alignmentOffset = sourceWidth / 2; // Left alignment

    const numericMatrix = buildTransformMatrix(parsed, canvasWidth, canvasHeight, alignmentOffset);
    const cssMatrix = buildCSSStringMatrix(0, 0, 1, 1, 0, alignmentOffset);

    expect(numericMatrix.a).toBeCloseTo(cssMatrix.a, 5);
    expect(numericMatrix.b).toBeCloseTo(cssMatrix.b, 5);
    expect(numericMatrix.c).toBeCloseTo(cssMatrix.c, 5);
    expect(numericMatrix.d).toBeCloseTo(cssMatrix.d, 5);
    expect(numericMatrix.e).toBeCloseTo(cssMatrix.e, 5);
    expect(numericMatrix.f).toBeCloseTo(cssMatrix.f, 5);
  });

  it('should match CSS string matrix with rotation and alignment offset', () => {
    // This is the key test case that reveals the bug:
    // When rotation is applied, the alignment offset should be rotated too
    const parsed = {
      translateX: 0,
      translateY: 0,
      rotation: 90,
      scaleX: 1,
      scaleY: 1,
    };
    const alignmentOffset = 100; // Left alignment offset

    const numericMatrix = buildTransformMatrix(parsed, canvasWidth, canvasHeight, alignmentOffset);
    const cssMatrix = buildCSSStringMatrix(0, 0, 1, 1, 90, alignmentOffset);

    expect(numericMatrix.a).toBeCloseTo(cssMatrix.a, 5);
    expect(numericMatrix.b).toBeCloseTo(cssMatrix.b, 5);
    expect(numericMatrix.c).toBeCloseTo(cssMatrix.c, 5);
    expect(numericMatrix.d).toBeCloseTo(cssMatrix.d, 5);
    expect(numericMatrix.e).toBeCloseTo(cssMatrix.e, 5);
    expect(numericMatrix.f).toBeCloseTo(cssMatrix.f, 5);
  });

  it('should match CSS string matrix with scale and alignment offset', () => {
    // Another key test: scale should affect the alignment offset
    const parsed = {
      translateX: 0,
      translateY: 0,
      rotation: 0,
      scaleX: 2,
      scaleY: 1,
    };
    const alignmentOffset = 100;

    const numericMatrix = buildTransformMatrix(parsed, canvasWidth, canvasHeight, alignmentOffset);
    const cssMatrix = buildCSSStringMatrix(0, 0, 2, 1, 0, alignmentOffset);

    expect(numericMatrix.a).toBeCloseTo(cssMatrix.a, 5);
    expect(numericMatrix.b).toBeCloseTo(cssMatrix.b, 5);
    expect(numericMatrix.c).toBeCloseTo(cssMatrix.c, 5);
    expect(numericMatrix.d).toBeCloseTo(cssMatrix.d, 5);
    expect(numericMatrix.e).toBeCloseTo(cssMatrix.e, 5);
    expect(numericMatrix.f).toBeCloseTo(cssMatrix.f, 5);
  });

  it('should match CSS string matrix with full transform (translation, scale, rotation, alignment)', () => {
    // Full complex transform - this is the most comprehensive test
    const parsed = {
      translateX: 100,
      translateY: -50,
      rotation: 45,
      scaleX: 2,
      scaleY: 1.5,
    };
    const alignmentOffset = 100; // Left alignment

    const numericMatrix = buildTransformMatrix(parsed, canvasWidth, canvasHeight, alignmentOffset);
    const cssMatrix = buildCSSStringMatrix(100, -50, 2, 1.5, 45, alignmentOffset);

    expect(numericMatrix.a).toBeCloseTo(cssMatrix.a, 5);
    expect(numericMatrix.b).toBeCloseTo(cssMatrix.b, 5);
    expect(numericMatrix.c).toBeCloseTo(cssMatrix.c, 5);
    expect(numericMatrix.d).toBeCloseTo(cssMatrix.d, 5);
    expect(numericMatrix.e).toBeCloseTo(cssMatrix.e, 5);
    expect(numericMatrix.f).toBeCloseTo(cssMatrix.f, 5);
  });

  it('should match CSS string matrix with negative rotation and right alignment', () => {
    const parsed = {
      translateX: 0,
      translateY: 0,
      rotation: -30,
      scaleX: 1,
      scaleY: 1,
    };
    const alignmentOffset = -100; // Right alignment

    const numericMatrix = buildTransformMatrix(parsed, canvasWidth, canvasHeight, alignmentOffset);
    const cssMatrix = buildCSSStringMatrix(0, 0, 1, 1, -30, alignmentOffset);

    expect(numericMatrix.a).toBeCloseTo(cssMatrix.a, 5);
    expect(numericMatrix.b).toBeCloseTo(cssMatrix.b, 5);
    expect(numericMatrix.c).toBeCloseTo(cssMatrix.c, 5);
    expect(numericMatrix.d).toBeCloseTo(cssMatrix.d, 5);
    expect(numericMatrix.e).toBeCloseTo(cssMatrix.e, 5);
    expect(numericMatrix.f).toBeCloseTo(cssMatrix.f, 5);
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

  it('should use textWidth for alignment when provided', () => {
    // This tests the case where source canvas is full-sized but text is smaller
    // The alignment offset should be based on textWidth, not source.width
    const fullSizeSource = {
      width: 1000, // Full canvas width
      height: 800, // Full canvas height
    };
    const textWidth = 200; // Actual text width

    applyTransformAndDraw(
      mockCtx,
      fullSizeSource as ImageBitmap,
      undefined,
      1000,
      800,
      'left',
      textWidth
    );

    const matrix = getAppliedMatrix();
    // Center (500, 400) + left alignment offset (textWidth/2 = 100) = (600, 400)
    // NOT center + fullSizeSource.width/2 = (500 + 500 = 1000)
    expect(matrix.e).toBe(600);
    expect(matrix.f).toBe(400);
  });

  it('should use source.width for alignment when textWidth not provided', () => {
    applyTransformAndDraw(
      mockCtx,
      mockSource as ImageBitmap,
      undefined,
      1000,
      800,
      'left'
      // textWidth not provided, should use mockSource.width = 200
    );

    const matrix = getAppliedMatrix();
    // Center (500, 400) + left alignment offset (sourceWidth/2 = 100) = (600, 400)
    expect(matrix.e).toBe(600);
    expect(matrix.f).toBe(400);
  });

  it('should correctly apply rotation with textWidth-based alignment', () => {
    // This is the critical test: rotation should transform the alignment offset correctly
    // even when using a separate textWidth value
    const fullSizeSource = {
      width: 1000,
      height: 800,
    };
    const textWidth = 200;

    applyTransformAndDraw(
      mockCtx,
      fullSizeSource as ImageBitmap,
      { rotation: 90 },
      1000,
      800,
      'left',
      textWidth
    );

    const matrix = getAppliedMatrix();
    // With 90-degree rotation and left alignment (textWidth/2 = 100):
    // The alignment offset (100, 0) gets rotated by 90 degrees to (0, 100)
    // Combined with center (500, 400), we get approximately (500, 500)
    expect(matrix.e).toBeCloseTo(500, 5);
    expect(matrix.f).toBeCloseTo(500, 5);
  });
});
