/**
 * Transform Calculation Unit Tests
 *
 * Tests the placement and transform calculation logic used by the renderer.
 * These are pure math functions that compute image positions and transformations.
 *
 * Note: Since derivePlacement and placementTransformUnits are not exported from
 * the renderer module, we test equivalent implementations here. If these tests
 * fail in the future, consider exporting the actual functions for testing.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ImagePlacementTransform, ProductImageComponent } from "@/types";

// ============================================================================
// Re-implementation of renderer transform functions for testing
// These match the implementations in src/renderer/index.ts
// ============================================================================

interface Placement {
  left: number;
  top: number;
  width: number;
  height: number;
  transform: ImagePlacementTransform<number>[] | [number, number, number, number, number, number] | null;
}

function derivePlacement(
  pimco: Partial<ProductImageComponent>,
  targetWidth: number,
  targetHeight: number,
  srcWidth: number,
  srcHeight: number
): Placement {
  const placement: Placement = {
    left: 0,
    top: 0,
    width: targetWidth,
    height: targetHeight,
    transform: null,
  };

  if (pimco.placement) {
    placement.left = Math.round((pimco.placement.left || 0) * targetWidth);
    placement.top = Math.round((pimco.placement.top || 0) * targetHeight);
    placement.width = Math.round((pimco.placement.width ?? 1) * targetWidth);
    placement.height = Math.round((pimco.placement.height ?? 1) * targetHeight);

    if (pimco.placement.fit === "contain") {
      const targetAspect = placement.width / placement.height;
      const srcAspect = srcWidth / srcHeight;

      if (srcAspect > targetAspect) {
        // Source is wider than target, so fit to width
        const height = Math.round(placement.width / srcAspect);
        const posY = pimco.placement.position ? pimco.placement.position[1] : 0.5;

        placement.top = Math.round(placement.top + (placement.height - height) * posY);
        placement.height = height;
      } else {
        // Source is taller than target, so fit to height
        const width = Math.round(placement.height * srcAspect);
        const posX = pimco.placement.position ? pimco.placement.position[0] : 0.5;

        placement.left = Math.round(placement.left + (placement.width - width) * posX);
        placement.width = width;
      }
    }

    if (pimco.placement.transform) {
      const isTransforms = typeof pimco.placement.transform[0] === "object";
      placement.transform = isTransforms
        ? placementTransformUnits(
            pimco.placement.transform as ImagePlacementTransform[],
            placement.width,
            placement.height,
            targetWidth,
            targetHeight
          )
        : (pimco.placement.transform as [number, number, number, number, number, number]);

      if (isTransforms) {
        // Add translation to/from origin for centered transforms
        (placement.transform as ImagePlacementTransform<number>[]).unshift({
          type: "translate",
          x: placement.width / 2 + placement.left,
          y: placement.height / 2 + placement.top,
        });
        (placement.transform as ImagePlacementTransform<number>[]).push({
          type: "translate",
          x: -placement.width / 2 - placement.left,
          y: -placement.height / 2 - placement.top,
        });
      }
    }
  }

  return placement;
}

function placementTransformUnits(
  transforms: ImagePlacementTransform[],
  percentWidth: number,
  percentHeight: number,
  viewWidth: number,
  viewHeight: number
): ImagePlacementTransform<number>[] {
  const bases: Record<string, number> = {
    px: percentWidth,
    py: percentHeight,
    vw: viewWidth,
    vh: viewHeight,
  };

  return transforms.map((t) => {
    const newTransform: any = { ...t };
    for (const key in t) {
      if (key !== "type" && typeof (t as any)[key] === "string") {
        const unitValue = (t as any)[key] as string;
        if (unitValue.endsWith("%")) {
          newTransform[key] = (parseFloat(unitValue) / 100) * bases["p" + key];
        } else if (unitValue.endsWith("vw")) {
          newTransform[key] = (parseFloat(unitValue) / 100) * bases.vw;
        } else if (unitValue.endsWith("vh")) {
          newTransform[key] = (parseFloat(unitValue) / 100) * bases.vh;
        } else if (unitValue.endsWith("px")) {
          newTransform[key] = parseFloat(unitValue);
        } else if (unitValue.endsWith("deg")) {
          newTransform[key] = (parseFloat(unitValue) / 180) * Math.PI;
        } else {
          // Take the number value as is
          newTransform[key] = parseFloat(unitValue);
        }
      }
    }
    return newTransform;
  });
}

// Mock context for applyTransformSequence tests
function createMockContext() {
  return {
    rotate: vi.fn(),
    scale: vi.fn(),
    translate: vi.fn(),
    skew: vi.fn(),
    setTransform: vi.fn(),
  };
}

function applyTransformSequence(
  ctx: ReturnType<typeof createMockContext>,
  transform: ImagePlacementTransform<number>[] | [number, number, number, number, number, number]
) {
  if (transform.every((t) => typeof t === "number")) {
    ctx.setTransform(...(transform as [number, number, number, number, number, number]));
    return;
  }

  const transforms = transform as ImagePlacementTransform<number>[];

  const defaults: Record<string, number> = {
    scale: 1,
    translate: 0,
    skew: 0,
  };

  for (const t of transforms) {
    if (t.type === "rotate") {
      ctx.rotate((t as { type: "rotate"; angle: number }).angle || 0);
    } else {
      const typed = t as { type: "scale" | "translate" | "skew"; x: number; y: number };
      (ctx as any)[t.type](typed.x || defaults[t.type], typed.y || defaults[t.type]);
    }
  }
}

// ============================================================================
// Tests
// ============================================================================

describe("derivePlacement", () => {
  it("should return default placement when no pimco.placement", () => {
    const pimco: Partial<ProductImageComponent> = {};
    const placement = derivePlacement(pimco, 1000, 800, 500, 400);

    expect(placement.left).toBe(0);
    expect(placement.top).toBe(0);
    expect(placement.width).toBe(1000);
    expect(placement.height).toBe(800);
    expect(placement.transform).toBeNull();
  });

  it("should calculate left/top from percentages", () => {
    const pimco: Partial<ProductImageComponent> = {
      placement: {
        left: 0.1, // 10%
        top: 0.2, // 20%
      },
    };
    const placement = derivePlacement(pimco, 1000, 800, 500, 400);

    expect(placement.left).toBe(100); // 10% of 1000
    expect(placement.top).toBe(160); // 20% of 800
  });

  it("should calculate width/height from percentages", () => {
    const pimco: Partial<ProductImageComponent> = {
      placement: {
        width: 0.5, // 50%
        height: 0.25, // 25%
      },
    };
    const placement = derivePlacement(pimco, 1000, 800, 500, 400);

    expect(placement.width).toBe(500); // 50% of 1000
    expect(placement.height).toBe(200); // 25% of 800
  });

  it("should default width/height to 100% when not specified", () => {
    const pimco: Partial<ProductImageComponent> = {
      placement: {
        left: 0,
        top: 0,
      },
    };
    const placement = derivePlacement(pimco, 1000, 800, 500, 400);

    expect(placement.width).toBe(1000);
    expect(placement.height).toBe(800);
  });

  describe("contain fit mode", () => {
    it("should handle contain fit when source is wider than target", () => {
      const pimco: Partial<ProductImageComponent> = {
        placement: {
          left: 0,
          top: 0,
          width: 1,
          height: 1,
          fit: "contain",
        },
      };
      // Source is 800x400 (2:1 aspect), target is 1000x1000 (1:1 aspect)
      // Source is wider, so fit to width
      const placement = derivePlacement(pimco, 1000, 1000, 800, 400);

      // Width stays at 1000, height becomes 500 (maintaining 2:1 ratio)
      expect(placement.width).toBe(1000);
      expect(placement.height).toBe(500);
      // Centered vertically: (1000 - 500) * 0.5 = 250
      expect(placement.top).toBe(250);
    });

    it("should handle contain fit when source is taller than target", () => {
      const pimco: Partial<ProductImageComponent> = {
        placement: {
          left: 0,
          top: 0,
          width: 1,
          height: 1,
          fit: "contain",
        },
      };
      // Source is 400x800 (1:2 aspect), target is 1000x1000 (1:1 aspect)
      // Source is taller, so fit to height
      const placement = derivePlacement(pimco, 1000, 1000, 400, 800);

      // Height stays at 1000, width becomes 500 (maintaining 1:2 ratio)
      expect(placement.height).toBe(1000);
      expect(placement.width).toBe(500);
      // Centered horizontally: (1000 - 500) * 0.5 = 250
      expect(placement.left).toBe(250);
    });

    it("should apply position offset in contain mode", () => {
      const pimco: Partial<ProductImageComponent> = {
        placement: {
          left: 0,
          top: 0,
          width: 1,
          height: 1,
          fit: "contain",
          position: [0, 0], // top-left alignment
        },
      };
      // Source is 800x400 (2:1 aspect), target is 1000x1000
      const placement = derivePlacement(pimco, 1000, 1000, 800, 400);

      // With position [0, 0], should be at top instead of centered
      expect(placement.top).toBe(0);
    });

    it("should apply position offset at bottom-right in contain mode", () => {
      const pimco: Partial<ProductImageComponent> = {
        placement: {
          left: 0,
          top: 0,
          width: 1,
          height: 1,
          fit: "contain",
          position: [1, 1], // bottom-right alignment
        },
      };
      // Source is 800x400 (2:1 aspect), target is 1000x1000
      const placement = derivePlacement(pimco, 1000, 1000, 800, 400);

      // With position [1, 1], should be at bottom: (1000 - 500) * 1 = 500
      expect(placement.top).toBe(500);
    });
  });

  describe("transforms", () => {
    it("should pass through matrix array transforms", () => {
      const pimco: Partial<ProductImageComponent> = {
        placement: {
          left: 0,
          top: 0,
          transform: [1, 0, 0, 1, 50, 100] as any,
        },
      };
      const placement = derivePlacement(pimco, 1000, 800, 500, 400);

      expect(placement.transform).toEqual([1, 0, 0, 1, 50, 100]);
    });

    it("should add center translation for transform sequences", () => {
      const pimco: Partial<ProductImageComponent> = {
        placement: {
          left: 0,
          top: 0,
          width: 0.5,
          height: 0.5,
          transform: [{ type: "rotate", angle: "45deg" }] as any,
        },
      };
      const placement = derivePlacement(pimco, 1000, 800, 500, 400);

      // Should have translate at start and end for centering
      const transforms = placement.transform as ImagePlacementTransform<number>[];
      expect(transforms.length).toBe(3); // translate, rotate, translate

      // First translate should be to center
      expect(transforms[0].type).toBe("translate");
      expect((transforms[0] as any).x).toBe(250); // 500/2 + 0
      expect((transforms[0] as any).y).toBe(200); // 400/2 + 0

      // Last translate should be back from center
      expect(transforms[2].type).toBe("translate");
      expect((transforms[2] as any).x).toBe(-250);
      expect((transforms[2] as any).y).toBe(-200);
    });
  });
});

describe("placementTransformUnits", () => {
  it("should convert percentage values for x and y", () => {
    const transforms: ImagePlacementTransform[] = [
      { type: "translate", x: "50%", y: "25%" },
    ];
    const result = placementTransformUnits(transforms, 200, 100, 1000, 800);

    expect((result[0] as any).x).toBe(100); // 50% of 200 (percentWidth/px)
    expect((result[0] as any).y).toBe(25); // 25% of 100 (percentHeight/py)
  });

  it("should convert viewport width units (vw)", () => {
    const transforms: ImagePlacementTransform[] = [
      { type: "translate", x: "10vw", y: "0" },
    ];
    const result = placementTransformUnits(transforms, 200, 100, 1000, 800);

    expect((result[0] as any).x).toBe(100); // 10% of 1000 (viewWidth)
  });

  it("should convert viewport height units (vh)", () => {
    const transforms: ImagePlacementTransform[] = [
      { type: "translate", x: "0", y: "10vh" },
    ];
    const result = placementTransformUnits(transforms, 200, 100, 1000, 800);

    expect((result[0] as any).y).toBe(80); // 10% of 800 (viewHeight)
  });

  it("should convert pixel values (px)", () => {
    const transforms: ImagePlacementTransform[] = [
      { type: "translate", x: "150px", y: "75px" },
    ];
    const result = placementTransformUnits(transforms, 200, 100, 1000, 800);

    expect((result[0] as any).x).toBe(150);
    expect((result[0] as any).y).toBe(75);
  });

  it("should convert degrees to radians", () => {
    const transforms: ImagePlacementTransform[] = [
      { type: "rotate", angle: "90deg" },
    ];
    const result = placementTransformUnits(transforms, 200, 100, 1000, 800);

    expect((result[0] as any).angle).toBeCloseTo(Math.PI / 2, 5);
  });

  it("should convert 180 degrees correctly", () => {
    const transforms: ImagePlacementTransform[] = [
      { type: "rotate", angle: "180deg" },
    ];
    const result = placementTransformUnits(transforms, 200, 100, 1000, 800);

    expect((result[0] as any).angle).toBeCloseTo(Math.PI, 5);
  });

  it("should pass through plain numbers", () => {
    const transforms: ImagePlacementTransform[] = [
      { type: "scale", x: "2", y: "1.5" },
    ];
    const result = placementTransformUnits(transforms, 200, 100, 1000, 800);

    expect((result[0] as any).x).toBe(2);
    expect((result[0] as any).y).toBe(1.5);
  });

  it("should handle mixed unit types", () => {
    const transforms: ImagePlacementTransform[] = [
      { type: "translate", x: "50%", y: "100px" },
    ];
    const result = placementTransformUnits(transforms, 200, 100, 1000, 800);

    expect((result[0] as any).x).toBe(100); // 50% of 200
    expect((result[0] as any).y).toBe(100); // 100px
  });

  it("should preserve type property", () => {
    const transforms: ImagePlacementTransform[] = [
      { type: "rotate", angle: "45deg" },
      { type: "scale", x: "2", y: "2" },
      { type: "translate", x: "10%", y: "20%" },
      { type: "skew", x: "15deg", y: "0" },
    ];
    const result = placementTransformUnits(transforms, 100, 100, 500, 500);

    expect(result[0].type).toBe("rotate");
    expect(result[1].type).toBe("scale");
    expect(result[2].type).toBe("translate");
    expect(result[3].type).toBe("skew");
  });
});

describe("applyTransformSequence", () => {
  let ctx: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    ctx = createMockContext();
  });

  it("should apply matrix array directly with setTransform", () => {
    const matrix: [number, number, number, number, number, number] = [1, 0, 0, 1, 50, 100];
    applyTransformSequence(ctx, matrix);

    expect(ctx.setTransform).toHaveBeenCalledWith(1, 0, 0, 1, 50, 100);
  });

  it("should apply translate transform", () => {
    const transforms: ImagePlacementTransform<number>[] = [
      { type: "translate", x: 100, y: 200 },
    ];
    applyTransformSequence(ctx, transforms);

    expect(ctx.translate).toHaveBeenCalledWith(100, 200);
  });

  it("should apply rotate transform", () => {
    const angle = Math.PI / 4; // 45 degrees
    const transforms: ImagePlacementTransform<number>[] = [
      { type: "rotate", angle },
    ];
    applyTransformSequence(ctx, transforms);

    expect(ctx.rotate).toHaveBeenCalledWith(angle);
  });

  it("should apply scale transform", () => {
    const transforms: ImagePlacementTransform<number>[] = [
      { type: "scale", x: 2, y: 1.5 },
    ];
    applyTransformSequence(ctx, transforms);

    expect(ctx.scale).toHaveBeenCalledWith(2, 1.5);
  });

  it("should apply skew transform", () => {
    const transforms: ImagePlacementTransform<number>[] = [
      { type: "skew", x: 0.5, y: 0.25 },
    ];
    applyTransformSequence(ctx, transforms);

    expect(ctx.skew).toHaveBeenCalledWith(0.5, 0.25);
  });

  it("should apply transforms in sequence order", () => {
    const transforms: ImagePlacementTransform<number>[] = [
      { type: "translate", x: 100, y: 100 },
      { type: "rotate", angle: Math.PI / 2 },
      { type: "scale", x: 2, y: 2 },
    ];
    applyTransformSequence(ctx, transforms);

    // Verify order of calls
    const translateCall = ctx.translate.mock.invocationCallOrder[0];
    const rotateCall = ctx.rotate.mock.invocationCallOrder[0];
    const scaleCall = ctx.scale.mock.invocationCallOrder[0];

    expect(translateCall).toBeLessThan(rotateCall);
    expect(rotateCall).toBeLessThan(scaleCall);
  });

  it("should use default values when x/y not provided", () => {
    const transforms: ImagePlacementTransform<number>[] = [
      { type: "scale" } as any, // Missing x, y
    ];
    applyTransformSequence(ctx, transforms);

    // Should use default of 1 for scale
    expect(ctx.scale).toHaveBeenCalledWith(1, 1);
  });

  it("should handle empty transform array", () => {
    const transforms: ImagePlacementTransform<number>[] = [];
    applyTransformSequence(ctx, transforms);

    // Empty array passes every() check for numbers, so setTransform is called with no args
    // This matches the actual renderer behavior
    expect(ctx.setTransform).toHaveBeenCalled();
    expect(ctx.translate).not.toHaveBeenCalled();
    expect(ctx.rotate).not.toHaveBeenCalled();
    expect(ctx.scale).not.toHaveBeenCalled();
  });
});
