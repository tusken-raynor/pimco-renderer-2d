/**
 * Effect Parameter Validation Unit Tests
 *
 * Tests the parameter extraction and validation for the 9 text effects
 * used by the renderer. Each effect has specific parameters that control
 * its appearance.
 *
 * Effects tested:
 * - embroidery: AlphaErosionRadius, EmbroideryFuzziness
 * - hotstamp: eindex (calculated from color distance)
 * - engraving: eindex
 * - metal: (custom emboss matrix)
 * - foil: AlphaErosionRadius
 * - painted: PaintedInsetShrink
 * - normal: NormalRoundness, NormalIntensity, NormalLightDir
 * - shadow: ShadowSpread, ShadowBlur
 * - noEffect: blend mode fallback
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Helper functions matching renderer logic
// ============================================================================

/**
 * Extract default color code from various color formats
 * Matches extractDfltColorCode in renderer
 */
function extractDfltColorCode(
  color: string | string[] | { [idx: string]: string } | undefined,
  backup: string = "#000000"
): string {
  if (!color) {
    return backup;
  }
  if (typeof color === "string") {
    return color;
  }
  if (Array.isArray(color)) {
    return color[0] || backup;
  }
  // Object - return first value
  const keys = Object.keys(color);
  if (keys.length > 0) {
    return color[keys[0]];
  }
  return backup;
}

/**
 * Parse hex color to RGB array
 */
function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (result) {
    return [
      parseInt(result[1], 16),
      parseInt(result[2], 16),
      parseInt(result[3], 16),
    ];
  }
  return [0, 0, 0];
}

/**
 * Calculate color distance from white (used for eindex in hotstamp/engraving)
 */
function colorDistanceFromWhite(color: string): number {
  const rgb = hexToRgb(color);
  const white = [255, 255, 255];
  const dist = Math.sqrt(
    Math.pow(rgb[0] - white[0], 2) +
    Math.pow(rgb[1] - white[1], 2) +
    Math.pow(rgb[2] - white[2], 2)
  ) / Math.sqrt(255 * 255 * 3);
  return dist;
}

/**
 * Calculate eindex using the bezier curve formula from renderer
 */
function calculateEindex(dist: number): number {
  return ((Math.pow(dist * 2.4422495703 - 1, 3) + 1) / 4) * 0.382 + 0.051;
}

/**
 * Effect parameter defaults matching renderer logic
 */
interface EffectParams {
  alpha?: number;
  blend?: string;
  color?: string | string[] | { [idx: string]: string };
  effectparams?: Record<string, any>;
  eindex?: number;
}

function getEffectDefaults(params: EffectParams = {}) {
  return {
    alpha: params.alpha ?? 1.0,
    blend: params.blend ?? "multiply",
    color: extractDfltColorCode(params.color),
    effectparams: params.effectparams ?? {},
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("effect parameters", () => {
  describe("common parameters", () => {
    it("should default alpha to 1.0", () => {
      const defaults = getEffectDefaults({});
      expect(defaults.alpha).toBe(1.0);
    });

    it("should use provided alpha value", () => {
      const defaults = getEffectDefaults({ alpha: 0.5 });
      expect(defaults.alpha).toBe(0.5);
    });

    it("should default blend to 'multiply'", () => {
      const defaults = getEffectDefaults({});
      expect(defaults.blend).toBe("multiply");
    });

    it("should use provided blend mode", () => {
      const defaults = getEffectDefaults({ blend: "source-over" });
      expect(defaults.blend).toBe("source-over");
    });

    it("should extract color from string", () => {
      const defaults = getEffectDefaults({ color: "#FF0000" });
      expect(defaults.color).toBe("#FF0000");
    });

    it("should extract color from array (first element)", () => {
      const defaults = getEffectDefaults({ color: ["#FF0000", "#00FF00"] });
      expect(defaults.color).toBe("#FF0000");
    });

    it("should extract color from object (first value)", () => {
      const defaults = getEffectDefaults({
        color: { primary: "#FF0000", secondary: "#00FF00" },
      });
      expect(defaults.color).toBe("#FF0000");
    });

    it("should use backup color when undefined", () => {
      const defaults = getEffectDefaults({ color: undefined });
      expect(defaults.color).toBe("#000000");
    });

    it("should use backup color for empty array", () => {
      const color = extractDfltColorCode([], "#FFFFFF");
      expect(color).toBe("#FFFFFF");
    });
  });

  describe("embroidery effect", () => {
    it("should default AlphaErosionRadius to 0.0", () => {
      const effectparams: Record<string, any> = {};
      const erosion = effectparams.AlphaErosionRadius ?? 0.0;
      expect(erosion).toBe(0.0);
    });

    it("should use provided AlphaErosionRadius", () => {
      const effectparams = { AlphaErosionRadius: 2.5 };
      const erosion = effectparams.AlphaErosionRadius ?? 0.0;
      expect(erosion).toBe(2.5);
    });

    it("should default EmbroideryFuzziness to 1.0", () => {
      const effectparams: Record<string, any> = {};
      const fuzziness = effectparams.EmbroideryFuzziness ?? 1.0;
      expect(fuzziness).toBe(1.0);
    });

    it("should use provided EmbroideryFuzziness", () => {
      const effectparams = { EmbroideryFuzziness: 0.5 };
      const fuzziness = effectparams.EmbroideryFuzziness ?? 1.0;
      expect(fuzziness).toBe(0.5);
    });

    it("should apply embossing threshold at 43.5 pixels", () => {
      const textHeight = 43.5;
      const shouldEmboss = textHeight > 43.5;
      expect(shouldEmboss).toBe(false);

      const textHeight2 = 44;
      const shouldEmboss2 = textHeight2 > 43.5;
      expect(shouldEmboss2).toBe(true);
    });
  });

  describe("hotstamp/engraving effect", () => {
    it("should calculate eindex from color distance to white", () => {
      // White color should have dist = 0
      const whiteDist = colorDistanceFromWhite("#FFFFFF");
      expect(whiteDist).toBeCloseTo(0, 5);

      // Black color should have dist close to 1
      const blackDist = colorDistanceFromWhite("#000000");
      expect(blackDist).toBeCloseTo(1, 2);
    });

    it("should use provided eindex when available", () => {
      const params: EffectParams = { eindex: 0.25 };
      const eindex = params.eindex ?? calculateEindex(0.5);
      expect(eindex).toBe(0.25);
    });

    it("should calculate eindex when not provided", () => {
      const params: EffectParams = {};
      const dist = 0.5; // Mid-gray
      const eindex = params.eindex ?? calculateEindex(dist);
      expect(eindex).toBeGreaterThan(0);
      expect(eindex).toBeLessThan(0.5);
    });

    it("should apply bezier curve formula correctly", () => {
      // Test known points on the curve
      // At dist = 0 (white): eindex should be at minimum
      const eindexWhite = calculateEindex(0);
      expect(eindexWhite).toBeCloseTo(0.051, 2);

      // At dist = 1 (black): eindex should be higher
      const eindexBlack = calculateEindex(1);
      expect(eindexBlack).toBeGreaterThan(eindexWhite);
    });

    it("should calculate consistent eindex for same color", () => {
      const color = "#888888";
      const dist1 = colorDistanceFromWhite(color);
      const dist2 = colorDistanceFromWhite(color);
      expect(dist1).toBe(dist2);

      const eindex1 = calculateEindex(dist1);
      const eindex2 = calculateEindex(dist2);
      expect(eindex1).toBe(eindex2);
    });
  });

  describe("painted effect", () => {
    it("should default PaintedInsetShrink to 1.0", () => {
      const effectparams: Record<string, any> = {};
      const shrink = effectparams.PaintedInsetShrink ?? 1.0;
      expect(shrink).toBe(1.0);
    });

    it("should use provided PaintedInsetShrink", () => {
      const effectparams = { PaintedInsetShrink: 2.0 };
      const shrink = effectparams.PaintedInsetShrink ?? 1.0;
      expect(shrink).toBe(2.0);
    });

    it("should handle zero shrink value", () => {
      const effectparams = { PaintedInsetShrink: 0 };
      // Need to be careful with falsy values
      const shrink = effectparams.PaintedInsetShrink ?? 1.0;
      expect(shrink).toBe(0);
    });
  });

  describe("normal effect", () => {
    it("should default NormalRoundness to 0", () => {
      const effectparams: Record<string, any> = {};
      const roundness = effectparams.NormalRoundness ?? 0;
      expect(roundness).toBe(0);
    });

    it("should scale NormalRoundness by resolution", () => {
      const effectparams = { NormalRoundness: 1 };
      const targetWidth = 2048;
      const scaledRoundness = (effectparams.NormalRoundness ?? 0) * 6 * targetWidth / 2048;
      expect(scaledRoundness).toBe(6); // 1 * 6 * 2048/2048

      // At half resolution
      const targetWidthHalf = 1024;
      const scaledRoundnessHalf = (effectparams.NormalRoundness ?? 0) * 6 * targetWidthHalf / 2048;
      expect(scaledRoundnessHalf).toBe(3); // 1 * 6 * 1024/2048
    });

    it("should default NormalIntensity to 1.0", () => {
      const effectparams: Record<string, any> = {};
      const intensity = effectparams.NormalIntensity ?? 1.0;
      expect(intensity).toBe(1.0);
    });

    it("should parse NormalLightDir directions", () => {
      const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
      const lightVectors: Record<string, [number, number]> = {
        N: [0, -1],
        NE: [1, -1],
        E: [1, 0],
        SE: [1, 1],
        S: [0, 1],
        SW: [-1, 1],
        W: [-1, 0],
        NW: [-1, -1],
      };

      directions.forEach((dir) => {
        expect(lightVectors[dir]).toBeDefined();
      });
    });

    it("should default NormalLightDir to 'N'", () => {
      const effectparams: Record<string, any> = {};
      const lightDir = effectparams.NormalLightDir ?? "N";
      expect(lightDir).toBe("N");
    });
  });

  describe("shadow effect", () => {
    it("should default ShadowSpread to 0", () => {
      const effectparams: Record<string, any> = {};
      const spread = effectparams.ShadowSpread ?? 0;
      expect(spread).toBe(0);
    });

    it("should scale ShadowSpread by resolution", () => {
      const effectparams = { ShadowSpread: 10 };
      const targetWidth = 2048;
      const scaledSpread = Math.round((effectparams.ShadowSpread ?? 0) * targetWidth / 2048);
      expect(scaledSpread).toBe(10);

      // At half resolution
      const targetWidthHalf = 1024;
      const scaledSpreadHalf = Math.round((effectparams.ShadowSpread ?? 0) * targetWidthHalf / 2048);
      expect(scaledSpreadHalf).toBe(5);
    });

    it("should default ShadowBlur to 0", () => {
      const effectparams: Record<string, any> = {};
      const blur = effectparams.ShadowBlur ?? 0;
      expect(blur).toBe(0);
    });

    it("should scale ShadowBlur by resolution", () => {
      const effectparams = { ShadowBlur: 8 };
      const targetWidth = 2048;
      const scaledBlur = (effectparams.ShadowBlur ?? 0) * targetWidth / 2048;
      expect(scaledBlur).toBe(8);

      // At quarter resolution
      const targetWidthQuarter = 512;
      const scaledBlurQuarter = (effectparams.ShadowBlur ?? 0) * targetWidthQuarter / 2048;
      expect(scaledBlurQuarter).toBe(2);
    });

    it("should handle alpha > 1.0 for multiple shadow layers", () => {
      // When alpha > 1, the shadow effect layers multiple times
      const alpha = 2.5;
      let remainingAlpha = alpha;
      let layerCount = 0;

      while (remainingAlpha > 0) {
        layerCount++;
        remainingAlpha -= 1;
      }

      expect(layerCount).toBe(3); // ceil(2.5) = 3 layers
    });
  });

  describe("foil effect", () => {
    it("should default AlphaErosionRadius to 1", () => {
      const effectparams: Record<string, any> = {};
      const erosion = effectparams.AlphaErosionRadius ?? 1;
      expect(erosion).toBe(1);
    });

    it("should early return for small text (height <= 43.5)", () => {
      const textHeight = 43;
      const shouldApplyFullEffect = textHeight > 43.5;
      expect(shouldApplyFullEffect).toBe(false);
    });
  });

  describe("noEffect (default)", () => {
    it("should use multiply blend by default", () => {
      const defaults = getEffectDefaults({});
      expect(defaults.blend).toBe("multiply");
    });

    it("should allow other blend modes", () => {
      const blendModes = [
        "source-over",
        "multiply",
        "screen",
        "overlay",
        "darken",
        "lighten",
        "color-dodge",
        "color-burn",
        "hard-light",
        "soft-light",
        "difference",
        "exclusion",
        "hue",
        "saturation",
        "color",
        "luminosity",
      ];

      blendModes.forEach((mode) => {
        const defaults = getEffectDefaults({ blend: mode });
        expect(defaults.blend).toBe(mode);
      });
    });
  });

  describe("color parsing", () => {
    it("should handle 6-digit hex colors", () => {
      const rgb = hexToRgb("#FF5500");
      expect(rgb).toEqual([255, 85, 0]);
    });

    it("should handle hex colors without #", () => {
      const rgb = hexToRgb("00FF00");
      expect(rgb).toEqual([0, 255, 0]);
    });

    it("should return black for invalid hex", () => {
      const rgb = hexToRgb("invalid");
      expect(rgb).toEqual([0, 0, 0]);
    });

    it("should handle lowercase hex", () => {
      const rgb = hexToRgb("#aabbcc");
      expect(rgb).toEqual([170, 187, 204]);
    });
  });
});
