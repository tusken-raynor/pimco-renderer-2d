/**
 * Unit tests for intra-layer-pipeline.ts
 *
 * Tests the 5-step intra-layer rendering pipeline for standard layers.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  derivePlacement,
  placementTransformUnits,
  applyTransformSequence,
  step1DrawBaseImage,
  step2ApplyColorOrTexture,
  step3ApplyHighlight1,
  step4ApplyHighlight2,
  step5ApplyMask,
  resetTransform,
  executeIntraLayerPipeline,
  createPipelineContext,
  type LayerAssets,
  type LayerConfig,
  type PipelineContext,
  type ResolvedPlacement,
} from './intra-layer-pipeline';
import type { ImagePlacementTransform } from '../types/pimco';

// =============================================================================
// Mocks for Canvas API
// =============================================================================

/**
 * Create a mock ImageBitmap with given dimensions.
 */
function createMockImageBitmap(width: number, height: number): ImageBitmap {
  return {
    width,
    height,
    close: vi.fn(),
  } as unknown as ImageBitmap;
}

/**
 * Mock context type definition.
 */
interface MockContext {
  canvas: { width: number; height: number };
  globalCompositeOperation: string;
  globalAlpha: number;
  fillStyle: string | CanvasGradient | CanvasPattern;
  calls: { method: string; args: unknown[] }[];
  clearRect: ReturnType<typeof vi.fn>;
  drawImage: ReturnType<typeof vi.fn>;
  fillRect: ReturnType<typeof vi.fn>;
  setTransform: ReturnType<typeof vi.fn>;
  resetTransform: ReturnType<typeof vi.fn>;
  rotate: ReturnType<typeof vi.fn>;
  scale: ReturnType<typeof vi.fn>;
  translate: ReturnType<typeof vi.fn>;
  transform: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
  restore: ReturnType<typeof vi.fn>;
  getTransform: ReturnType<typeof vi.fn>;
}

/**
 * Create a mock 2D context with tracked method calls.
 */
function createMockContext(): MockContext {
  const calls: { method: string; args: unknown[] }[] = [];

  const ctx: MockContext = {
    canvas: { width: 100, height: 100 },
    globalCompositeOperation: 'source-over',
    globalAlpha: 1,
    fillStyle: '#000000',
    calls,

    clearRect: vi.fn((...args: unknown[]) => calls.push({ method: 'clearRect', args })),
    drawImage: vi.fn((...args: unknown[]) => calls.push({ method: 'drawImage', args })),
    fillRect: vi.fn((...args: unknown[]) => calls.push({ method: 'fillRect', args })),
    setTransform: vi.fn((...args: unknown[]) => calls.push({ method: 'setTransform', args })),
    resetTransform: vi.fn(() => calls.push({ method: 'resetTransform', args: [] })),
    rotate: vi.fn((...args: unknown[]) => calls.push({ method: 'rotate', args })),
    scale: vi.fn((...args: unknown[]) => calls.push({ method: 'scale', args })),
    translate: vi.fn((...args: unknown[]) => calls.push({ method: 'translate', args })),
    transform: vi.fn((...args: unknown[]) => calls.push({ method: 'transform', args })),
    save: vi.fn(() => calls.push({ method: 'save', args: [] })),
    restore: vi.fn(() => calls.push({ method: 'restore', args: [] })),
    getTransform: vi.fn(() => new DOMMatrix()),
  };

  return ctx;
}

/**
 * Create a mock pipeline context.
 */
function createMockPipelineContext(width = 100, height = 100): PipelineContext {
  const workCanvas = { width, height } as unknown as OffscreenCanvas;
  const colorCanvas = { width, height } as unknown as OffscreenCanvas;

  const workCtx = createMockContext();
  workCtx.canvas = workCanvas as unknown as HTMLCanvasElement;

  const colorCtx = createMockContext();
  colorCtx.canvas = colorCanvas as unknown as HTMLCanvasElement;

  return {
    work: {
      canvas: workCanvas,
      ctx: workCtx as unknown as CanvasRenderingContext2D,
    },
    color: {
      canvas: colorCanvas,
      ctx: colorCtx as unknown as CanvasRenderingContext2D,
    },
    width,
    height,
  };
}

/**
 * Create mock layer assets.
 */
function createMockAssets(overrides: Partial<LayerAssets> = {}): LayerAssets {
  return {
    image: createMockImageBitmap(100, 100),
    mask: createMockImageBitmap(100, 100),
    ...overrides,
  };
}

/**
 * Create a layer config for testing.
 */
function createLayerConfig(overrides: Partial<LayerConfig> = {}): LayerConfig {
  return {
    id: 'test-layer',
    mode: 'color',
    color: '#ff0000',
    alpha: 1,
    blend: 'normal',
    ...overrides,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('intra-layer-pipeline', () => {
  describe('derivePlacement', () => {
    it('should return default placement when no placement specified', () => {
      const config = createLayerConfig();
      const result = derivePlacement(config, 1000, 800, 500, 400);

      expect(result.left).toBe(0);
      expect(result.top).toBe(0);
      expect(result.width).toBe(1000);
      expect(result.height).toBe(800);
      expect(result.transform).toBeNull();
    });

    it('should calculate position from percentages', () => {
      const config = createLayerConfig({
        placement: {
          left: 0.1, // 10%
          top: 0.2, // 20%
        },
      });
      const result = derivePlacement(config, 1000, 800, 500, 400);

      expect(result.left).toBe(100); // 10% of 1000
      expect(result.top).toBe(160); // 20% of 800
    });

    it('should calculate size from percentages', () => {
      const config = createLayerConfig({
        placement: {
          width: 0.5, // 50%
          height: 0.25, // 25%
        },
      });
      const result = derivePlacement(config, 1000, 800, 500, 400);

      expect(result.width).toBe(500); // 50% of 1000
      expect(result.height).toBe(200); // 25% of 800
    });

    it('should handle contain fit mode - width constrained', () => {
      const config = createLayerConfig({
        placement: {
          width: 0.5, // 500px
          height: 0.5, // 400px
          fit: 'contain',
        },
      });
      // Source is 1000x500 (aspect 2:1), target is 500x400 (aspect 1.25:1)
      // Source is wider, so fit to width
      const result = derivePlacement(config, 1000, 800, 1000, 500);

      expect(result.width).toBe(500);
      // Height should be 500/2 = 250 (maintaining 2:1 aspect)
      expect(result.height).toBe(250);
    });

    it('should handle contain fit mode - height constrained', () => {
      const config = createLayerConfig({
        placement: {
          width: 0.5, // 500px
          height: 0.5, // 400px
          fit: 'contain',
        },
      });
      // Source is 500x1000 (aspect 0.5:1), target is 500x400 (aspect 1.25:1)
      // Source is taller, so fit to height
      const result = derivePlacement(config, 1000, 800, 500, 1000);

      // Width should be 400*0.5 = 200 (maintaining 0.5:1 aspect)
      expect(result.width).toBe(200);
      expect(result.height).toBe(400);
    });

    it('should handle cover fit mode - width constrained', () => {
      const config = createLayerConfig({
        placement: {
          width: 0.5, // 500px
          height: 0.5, // 400px
          fit: 'cover',
        },
      });
      // Source is 500x1000 (aspect 0.5:1), target is 500x400 (aspect 1.25:1)
      // Source is taller than target, fit to width
      const result = derivePlacement(config, 1000, 800, 500, 1000);

      expect(result.width).toBe(500);
      // Height should be 500/0.5 = 1000
      expect(result.height).toBe(1000);
    });

    it('should respect position for centering in contain mode', () => {
      const config = createLayerConfig({
        placement: {
          width: 0.5,
          height: 0.5,
          fit: 'contain',
          position: [0, 0], // Top-left
        },
      });
      const result = derivePlacement(config, 1000, 800, 1000, 500);

      // With position [0, 0], top should stay at 0
      expect(result.top).toBe(0);
    });

    it('should handle matrix transform array', () => {
      const config = createLayerConfig({
        placement: {
          transform: [1, 0, 0, 1, 10, 20] as unknown as [
            number,
            number,
            number,
            number,
            number,
            number,
          ],
        },
      });
      const result = derivePlacement(config, 1000, 800, 500, 400);

      expect(result.transform).toEqual([1, 0, 0, 1, 10, 20]);
    });

    it('should handle transform sequence', () => {
      const config = createLayerConfig({
        placement: {
          transform: [
            { type: 'rotate', angle: 0.5 },
            { type: 'scale', x: 2, y: 2 },
          ],
        },
      });
      const result = derivePlacement(config, 1000, 800, 500, 400);

      // Should have added center transforms
      expect(result.transform).not.toBeNull();
      expect(Array.isArray(result.transform)).toBe(true);

      const transforms = result.transform as ImagePlacementTransform<number>[];
      // First and last should be translate to/from center
      expect(transforms[0].type).toBe('translate');
      expect(transforms[transforms.length - 1].type).toBe('translate');
    });
  });

  describe('placementTransformUnits', () => {
    it('should pass through numeric values', () => {
      const transforms: ImagePlacementTransform[] = [
        { type: 'rotate', angle: 0.5 },
        { type: 'scale', x: 2, y: 1.5 },
        { type: 'translate', x: 100, y: 50 },
      ];

      const result = placementTransformUnits(transforms, 200, 200, 1000, 800);

      expect(result[0]).toEqual({ type: 'rotate', angle: 0.5 });
      expect(result[1]).toEqual({ type: 'scale', x: 2, y: 1.5 });
      expect(result[2]).toEqual({ type: 'translate', x: 100, y: 50 });
    });

    it('should convert percentage strings', () => {
      const transforms: ImagePlacementTransform[] = [{ type: 'translate', x: '10%', y: '20%' }];

      const result = placementTransformUnits(transforms, 200, 200, 1000, 800);

      // 10% of targetWidth (1000) = 100
      // 20% of targetHeight (800) = 160
      expect(result[0]).toEqual({ type: 'translate', x: 100, y: 160 });
    });

    it('should handle skew transform', () => {
      const transforms: ImagePlacementTransform[] = [{ type: 'skew', x: 0.1, y: 0.2 }];

      const result = placementTransformUnits(transforms, 200, 200, 1000, 800);

      expect(result[0]).toEqual({ type: 'skew', x: 0.1, y: 0.2 });
    });
  });

  describe('applyTransformSequence', () => {
    it('should apply matrix array directly', () => {
      const ctx = createMockContext();
      const matrix: [number, number, number, number, number, number] = [1, 0, 0, 1, 10, 20];

      applyTransformSequence(ctx as unknown as CanvasRenderingContext2D, matrix);

      expect(ctx.setTransform).toHaveBeenCalledWith(1, 0, 0, 1, 10, 20);
    });

    it('should apply rotation transform', () => {
      const ctx = createMockContext();
      const transforms: ImagePlacementTransform<number>[] = [{ type: 'rotate', angle: Math.PI / 2 }];

      applyTransformSequence(ctx as unknown as CanvasRenderingContext2D, transforms);

      expect(ctx.rotate).toHaveBeenCalledWith(Math.PI / 2);
    });

    it('should apply scale transform', () => {
      const ctx = createMockContext();
      const transforms: ImagePlacementTransform<number>[] = [{ type: 'scale', x: 2, y: 1.5 }];

      applyTransformSequence(ctx as unknown as CanvasRenderingContext2D, transforms);

      expect(ctx.scale).toHaveBeenCalledWith(2, 1.5);
    });

    it('should apply translate transform', () => {
      const ctx = createMockContext();
      const transforms: ImagePlacementTransform<number>[] = [{ type: 'translate', x: 100, y: 50 }];

      applyTransformSequence(ctx as unknown as CanvasRenderingContext2D, transforms);

      expect(ctx.translate).toHaveBeenCalledWith(100, 50);
    });

    it('should apply skew transform using transform matrix', () => {
      const ctx = createMockContext();
      const transforms: ImagePlacementTransform<number>[] = [{ type: 'skew', x: 0.1, y: 0.2 }];

      applyTransformSequence(ctx as unknown as CanvasRenderingContext2D, transforms);

      // Skew uses ctx.transform
      expect(ctx.transform).toHaveBeenCalled();
    });

    it('should apply multiple transforms in sequence', () => {
      const ctx = createMockContext();
      const transforms: ImagePlacementTransform<number>[] = [
        { type: 'translate', x: 50, y: 50 },
        { type: 'rotate', angle: 0.5 },
        { type: 'translate', x: -50, y: -50 },
      ];

      applyTransformSequence(ctx as unknown as CanvasRenderingContext2D, transforms);

      expect(ctx.calls[0].method).toBe('translate');
      expect(ctx.calls[1].method).toBe('rotate');
      expect(ctx.calls[2].method).toBe('translate');
    });
  });

  describe('step1DrawBaseImage', () => {
    it('should clear canvas and set initial state', () => {
      const ctx = createMockPipelineContext();
      const assets = createMockAssets();
      const placement: ResolvedPlacement = {
        left: 0,
        top: 0,
        width: 100,
        height: 100,
        transform: null,
      };

      step1DrawBaseImage(ctx, assets, placement);

      const workCtx = ctx.work.ctx as unknown as MockContext;
      expect(workCtx.globalCompositeOperation).toBe('source-over');
      expect(workCtx.globalAlpha).toBe(1.0);
    });

    it('should draw image at placement position', () => {
      const ctx = createMockPipelineContext();
      const assets = createMockAssets();
      const placement: ResolvedPlacement = {
        left: 10,
        top: 20,
        width: 80,
        height: 60,
        transform: null,
      };

      step1DrawBaseImage(ctx, assets, placement);

      const workCtx = ctx.work.ctx as unknown as MockContext;
      const drawImageCalls = workCtx.calls.filter((c) => c.method === 'drawImage');
      expect(drawImageCalls.length).toBe(1);
      expect(drawImageCalls[0].args).toEqual([assets.image, 10, 20, 80, 60]);
    });

    it('should apply transform when specified', () => {
      const ctx = createMockPipelineContext();
      const assets = createMockAssets();
      const placement: ResolvedPlacement = {
        left: 0,
        top: 0,
        width: 100,
        height: 100,
        transform: [{ type: 'rotate', angle: 0.5 }],
      };

      step1DrawBaseImage(ctx, assets, placement);

      const workCtx = ctx.work.ctx as unknown as MockContext;
      expect(workCtx.rotate).toHaveBeenCalled();
    });
  });

  describe('step2ApplyColorOrTexture', () => {
    it('should apply solid color in color mode', () => {
      const ctx = createMockPipelineContext();
      const assets = createMockAssets();
      const config = createLayerConfig({ mode: 'color', color: '#ff0000', alpha: 0.8 });
      const placement: ResolvedPlacement = {
        left: 0,
        top: 0,
        width: 100,
        height: 100,
        transform: null,
      };

      step2ApplyColorOrTexture(ctx, assets, config, placement);

      const workCtx = ctx.work.ctx as unknown as MockContext;
      const colorCtx = ctx.color.ctx as unknown as MockContext;

      expect(workCtx.globalCompositeOperation).toBe('normal');
      expect(workCtx.globalAlpha).toBe(0.8);
      expect(colorCtx.fillStyle).toBe('#ff0000');
    });

    it('should draw texture in image mode', () => {
      const texture = createMockImageBitmap(100, 100);
      const ctx = createMockPipelineContext();
      const assets = createMockAssets({ texture });
      const config = createLayerConfig({ mode: 'image', alpha: 0.5, blend: 'multiply' });
      const placement: ResolvedPlacement = {
        left: 0,
        top: 0,
        width: 100,
        height: 100,
        transform: null,
      };

      step2ApplyColorOrTexture(ctx, assets, config, placement);

      const workCtx = ctx.work.ctx as unknown as MockContext;
      expect(workCtx.globalCompositeOperation).toBe('multiply');
      expect(workCtx.globalAlpha).toBe(0.5);

      const drawImageCalls = workCtx.calls.filter((c) => c.method === 'drawImage');
      expect(drawImageCalls.length).toBe(1);
      expect(drawImageCalls[0].args[0]).toBe(texture);
    });

    it('should skip texture if not provided in image mode', () => {
      const ctx = createMockPipelineContext();
      const assets = createMockAssets(); // No texture
      const config = createLayerConfig({ mode: 'image' });
      const placement: ResolvedPlacement = {
        left: 0,
        top: 0,
        width: 100,
        height: 100,
        transform: null,
      };

      step2ApplyColorOrTexture(ctx, assets, config, placement);

      const workCtx = ctx.work.ctx as unknown as MockContext;
      const drawImageCalls = workCtx.calls.filter((c) => c.method === 'drawImage');
      expect(drawImageCalls.length).toBe(0);
    });
  });

  describe('step3ApplyHighlight1', () => {
    it('should apply highlight 1 with blend and alpha', () => {
      const hlimage1 = createMockImageBitmap(100, 100);
      const ctx = createMockPipelineContext();
      const assets = createMockAssets({ hlimage1 });
      const config = createLayerConfig({
        hlalpha1: 0.7,
        hlblend1: 'screen',
      });
      const placement: ResolvedPlacement = {
        left: 10,
        top: 20,
        width: 80,
        height: 60,
        transform: null,
      };

      step3ApplyHighlight1(ctx, assets, config, placement);

      const workCtx = ctx.work.ctx as unknown as MockContext;
      expect(workCtx.globalCompositeOperation).toBe('screen');
      expect(workCtx.globalAlpha).toBe(0.7);

      const drawImageCalls = workCtx.calls.filter((c) => c.method === 'drawImage');
      expect(drawImageCalls.length).toBe(1);
      expect(drawImageCalls[0].args).toEqual([hlimage1, 10, 20, 80, 60]);
    });

    it('should skip if highlight 1 not defined', () => {
      const ctx = createMockPipelineContext();
      const assets = createMockAssets();
      const config = createLayerConfig();
      const placement: ResolvedPlacement = {
        left: 0,
        top: 0,
        width: 100,
        height: 100,
        transform: null,
      };

      step3ApplyHighlight1(ctx, assets, config, placement);

      const workCtx = ctx.work.ctx as unknown as MockContext;
      const drawImageCalls = workCtx.calls.filter((c) => c.method === 'drawImage');
      expect(drawImageCalls.length).toBe(0);
    });

    it('should skip if alpha not defined', () => {
      const hlimage1 = createMockImageBitmap(100, 100);
      const ctx = createMockPipelineContext();
      const assets = createMockAssets({ hlimage1 });
      const config = createLayerConfig({ hlblend1: 'screen' }); // No alpha
      const placement: ResolvedPlacement = {
        left: 0,
        top: 0,
        width: 100,
        height: 100,
        transform: null,
      };

      step3ApplyHighlight1(ctx, assets, config, placement);

      const workCtx = ctx.work.ctx as unknown as MockContext;
      const drawImageCalls = workCtx.calls.filter((c) => c.method === 'drawImage');
      expect(drawImageCalls.length).toBe(0);
    });
  });

  describe('step4ApplyHighlight2', () => {
    it('should apply highlight 2 with its own image and blend', () => {
      const hlimage1 = createMockImageBitmap(100, 100);
      const hlimage2 = createMockImageBitmap(100, 100);
      const ctx = createMockPipelineContext();
      const assets = createMockAssets({ hlimage1, hlimage2 });
      const config = createLayerConfig({
        hlalpha1: 0.5,
        hlblend1: 'screen',
        hlalpha2: 0.3,
        hlblend2: 'overlay',
      });
      const placement: ResolvedPlacement = {
        left: 0,
        top: 0,
        width: 100,
        height: 100,
        transform: null,
      };

      step4ApplyHighlight2(ctx, assets, config, placement);

      const workCtx = ctx.work.ctx as unknown as MockContext;
      expect(workCtx.globalCompositeOperation).toBe('overlay');
      expect(workCtx.globalAlpha).toBe(0.3);

      const drawImageCalls = workCtx.calls.filter((c) => c.method === 'drawImage');
      expect(drawImageCalls.length).toBe(1);
      expect(drawImageCalls[0].args[0]).toBe(hlimage2);
    });

    it('should fall back to highlight 1 image if highlight 2 image not specified', () => {
      const hlimage1 = createMockImageBitmap(100, 100);
      const ctx = createMockPipelineContext();
      const assets = createMockAssets({ hlimage1 }); // No hlimage2
      const config = createLayerConfig({
        hlalpha1: 0.5,
        hlblend1: 'screen',
        hlalpha2: 0.3,
      });
      const placement: ResolvedPlacement = {
        left: 0,
        top: 0,
        width: 100,
        height: 100,
        transform: null,
      };

      step4ApplyHighlight2(ctx, assets, config, placement);

      const workCtx = ctx.work.ctx as unknown as MockContext;
      const drawImageCalls = workCtx.calls.filter((c) => c.method === 'drawImage');
      expect(drawImageCalls.length).toBe(1);
      expect(drawImageCalls[0].args[0]).toBe(hlimage1);
    });

    it('should fall back to highlight 1 blend if highlight 2 blend not specified', () => {
      const hlimage1 = createMockImageBitmap(100, 100);
      const ctx = createMockPipelineContext();
      const assets = createMockAssets({ hlimage1 });
      const config = createLayerConfig({
        hlalpha1: 0.5,
        hlblend1: 'screen',
        hlalpha2: 0.3,
        // No hlblend2
      });
      const placement: ResolvedPlacement = {
        left: 0,
        top: 0,
        width: 100,
        height: 100,
        transform: null,
      };

      step4ApplyHighlight2(ctx, assets, config, placement);

      const workCtx = ctx.work.ctx as unknown as MockContext;
      expect(workCtx.globalCompositeOperation).toBe('screen');
    });

    it('should skip if alpha2 not defined', () => {
      const hlimage1 = createMockImageBitmap(100, 100);
      const ctx = createMockPipelineContext();
      const assets = createMockAssets({ hlimage1 });
      const config = createLayerConfig({ hlalpha1: 0.5, hlblend1: 'screen' }); // No alpha2
      const placement: ResolvedPlacement = {
        left: 0,
        top: 0,
        width: 100,
        height: 100,
        transform: null,
      };

      step4ApplyHighlight2(ctx, assets, config, placement);

      const workCtx = ctx.work.ctx as unknown as MockContext;
      const drawImageCalls = workCtx.calls.filter((c) => c.method === 'drawImage');
      expect(drawImageCalls.length).toBe(0);
    });
  });

  describe('step5ApplyMask', () => {
    it('should apply mask with destination-in composite', () => {
      const ctx = createMockPipelineContext();
      const assets = createMockAssets();
      const placement: ResolvedPlacement = {
        left: 10,
        top: 20,
        width: 80,
        height: 60,
        transform: null,
      };

      step5ApplyMask(ctx, assets, placement);

      const workCtx = ctx.work.ctx as unknown as MockContext;
      expect(workCtx.globalCompositeOperation).toBe('destination-in');
      expect(workCtx.globalAlpha).toBe(1.0);

      const drawImageCalls = workCtx.calls.filter((c) => c.method === 'drawImage');
      expect(drawImageCalls.length).toBe(1);
      expect(drawImageCalls[0].args).toEqual([assets.mask, 10, 20, 80, 60]);
    });
  });

  describe('resetTransform', () => {
    it('should reset transform when transform was applied', () => {
      const ctx = createMockPipelineContext();
      const placement: ResolvedPlacement = {
        left: 0,
        top: 0,
        width: 100,
        height: 100,
        transform: [{ type: 'rotate', angle: 0.5 }],
      };

      resetTransform(ctx, placement);

      const workCtx = ctx.work.ctx as unknown as MockContext;
      expect(workCtx.resetTransform).toHaveBeenCalled();
    });

    it('should not reset transform when no transform applied', () => {
      const ctx = createMockPipelineContext();
      const placement: ResolvedPlacement = {
        left: 0,
        top: 0,
        width: 100,
        height: 100,
        transform: null,
      };

      resetTransform(ctx, placement);

      const workCtx = ctx.work.ctx as unknown as MockContext;
      expect(workCtx.resetTransform).not.toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('should handle zero dimensions', () => {
      const config = createLayerConfig({
        placement: {
          width: 0,
          height: 0,
        },
      });
      const result = derivePlacement(config, 1000, 800, 500, 400);

      expect(result.width).toBe(0);
      expect(result.height).toBe(0);
    });

    it('should handle default color when not specified', () => {
      const ctx = createMockPipelineContext();
      const assets = createMockAssets();
      const config = createLayerConfig({ mode: 'color' }); // No color specified
      delete config.color;
      const placement: ResolvedPlacement = {
        left: 0,
        top: 0,
        width: 100,
        height: 100,
        transform: null,
      };

      step2ApplyColorOrTexture(ctx, assets, config, placement);

      const colorCtx = ctx.color.ctx as unknown as MockContext;
      expect(colorCtx.fillStyle).toBe('#000000');
    });

    it('should handle empty transform array', () => {
      const config = createLayerConfig({
        placement: {
          transform: [],
        },
      });
      const result = derivePlacement(config, 1000, 800, 500, 400);

      // Empty array should not create a transform
      expect(result.transform).toBeNull();
    });
  });
});

describe('RenderSlave integration', () => {
  it('should export createPipelineContext', () => {
    expect(typeof createPipelineContext).toBe('function');
  });

  it('should export executeIntraLayerPipeline', () => {
    expect(typeof executeIntraLayerPipeline).toBe('function');
  });
});
