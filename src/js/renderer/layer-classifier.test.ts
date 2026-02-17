/**
 * Unit tests for layer-classifier.ts
 *
 * Tests layer classification logic for determining standard vs text layers.
 */

import { describe, it, expect } from 'vitest';
import {
  classifyLayer,
  classifyLayers,
  isStandardLayer,
  isTextLayer,
  getLayerEffect,
  getMaskUrl,
  getMaskData,
  filterStandardLayers,
  filterTextLayers,
} from './layer-classifier';
import type {
  ProductImageComponent,
  PimcoMaskSubstitutionCompiled,
  PimcoMaskSubstitutionEffect,
} from '../types/pimco';

// Helper to create a minimal standard layer
function createStandardLayer(
  overrides: Partial<ProductImageComponent> = {}
): ProductImageComponent & { mask: string } {
  return {
    id: 'test-standard',
    name: 'Test Standard Layer',
    mode: 'color',
    alpha: 1,
    blend: 'normal',
    mask: '/images/mask.png',
    image: '/images/base.png',
    ...overrides,
  } as ProductImageComponent & { mask: string };
}

// Helper to create a minimal text layer
function createTextLayer(
  maskOverrides: Partial<PimcoMaskSubstitutionCompiled> = {},
  layerOverrides: Partial<ProductImageComponent> = {}
): ProductImageComponent & { mask: PimcoMaskSubstitutionCompiled } {
  return {
    id: 'test-text',
    name: 'Test Text Layer',
    mode: 'color',
    alpha: 1,
    blend: 'normal',
    mask: {
      content: 'Hello World',
      ...maskOverrides,
    },
    image: '/images/base.png',
    ...layerOverrides,
  } as ProductImageComponent & { mask: PimcoMaskSubstitutionCompiled };
}

describe('layer-classifier', () => {
  describe('classifyLayer', () => {
    it('should classify layer with string mask as standard', () => {
      const layer = createStandardLayer();
      const result = classifyLayer(layer, 0);

      expect(result.type).toBe('standard');
      expect(result.index).toBe(0);
      expect(result.layer).toBe(layer);
      expect(result.maskUrl).toBe('/images/mask.png');
      expect(result.effect).toBeUndefined();
      expect(result.maskData).toBeUndefined();
    });

    it('should classify layer with object mask as text', () => {
      const layer = createTextLayer({ effect: 'embroidery' });
      const result = classifyLayer(layer, 5);

      expect(result.type).toBe('text');
      expect(result.index).toBe(5);
      expect(result.layer).toBe(layer);
      expect(result.effect).toBe('embroidery');
      expect(result.maskData).toEqual({ content: 'Hello World', effect: 'embroidery' });
      expect(result.maskUrl).toBeUndefined();
    });

    it('should preserve layer reference in classification result', () => {
      const layer = createStandardLayer({ id: 'unique-id' });
      const result = classifyLayer(layer, 0);

      expect(result.layer.id).toBe('unique-id');
      expect(result.layer === layer).toBe(true);
    });

    it('should handle text layer without effect', () => {
      const layer = createTextLayer();
      const result = classifyLayer(layer, 0);

      expect(result.type).toBe('text');
      expect(result.effect).toBeUndefined();
      expect(result.maskData).toBeDefined();
    });

    it('should handle text layer with all effects', () => {
      const effects: PimcoMaskSubstitutionEffect[] = [
        'embroidery',
        'engraving',
        'metal',
        'painted',
        'hotstamp',
        'foil',
        'normal',
        'shadow',
      ];

      effects.forEach((effect, index) => {
        const layer = createTextLayer({ effect });
        const result = classifyLayer(layer, index);

        expect(result.type).toBe('text');
        expect(result.effect).toBe(effect);
      });
    });

    it('should handle empty string mask as standard layer', () => {
      const layer = createStandardLayer({ mask: '' });
      const result = classifyLayer(layer, 0);

      expect(result.type).toBe('standard');
      expect(result.maskUrl).toBe('');
    });
  });

  describe('classifyLayers', () => {
    it('should return empty arrays for empty input', () => {
      const result = classifyLayers([]);

      expect(result.all).toEqual([]);
      expect(result.standard).toEqual([]);
      expect(result.text).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.standardCount).toBe(0);
      expect(result.textCount).toBe(0);
    });

    it('should classify all standard layers correctly', () => {
      const layers = [
        createStandardLayer({ id: 'layer-1' }),
        createStandardLayer({ id: 'layer-2' }),
        createStandardLayer({ id: 'layer-3' }),
      ];

      const result = classifyLayers(layers);

      expect(result.total).toBe(3);
      expect(result.standardCount).toBe(3);
      expect(result.textCount).toBe(0);
      expect(result.all.length).toBe(3);
      expect(result.standard.length).toBe(3);
      expect(result.text.length).toBe(0);
    });

    it('should classify all text layers correctly', () => {
      const layers = [
        createTextLayer({ content: 'Text 1' }),
        createTextLayer({ content: 'Text 2', effect: 'engraving' }),
      ];

      const result = classifyLayers(layers);

      expect(result.total).toBe(2);
      expect(result.standardCount).toBe(0);
      expect(result.textCount).toBe(2);
      expect(result.all.length).toBe(2);
      expect(result.standard.length).toBe(0);
      expect(result.text.length).toBe(2);
    });

    it('should classify mixed layers correctly', () => {
      const layers = [
        createStandardLayer({ id: 'bg' }),
        createTextLayer({ content: 'Logo', effect: 'embroidery' }),
        createStandardLayer({ id: 'overlay' }),
        createTextLayer({ content: 'Name', effect: 'engraving' }),
        createStandardLayer({ id: 'highlight' }),
      ];

      const result = classifyLayers(layers);

      expect(result.total).toBe(5);
      expect(result.standardCount).toBe(3);
      expect(result.textCount).toBe(2);
      expect(result.all.length).toBe(5);
      expect(result.standard.length).toBe(3);
      expect(result.text.length).toBe(2);
    });

    it('should preserve original indices in classification', () => {
      const layers = [
        createStandardLayer({ id: 'layer-0' }),
        createTextLayer({ content: 'layer-1' }),
        createStandardLayer({ id: 'layer-2' }),
        createTextLayer({ content: 'layer-3' }),
      ];

      const result = classifyLayers(layers);

      // Check all array preserves order
      expect(result.all[0].index).toBe(0);
      expect(result.all[0].type).toBe('standard');
      expect(result.all[1].index).toBe(1);
      expect(result.all[1].type).toBe('text');
      expect(result.all[2].index).toBe(2);
      expect(result.all[2].type).toBe('standard');
      expect(result.all[3].index).toBe(3);
      expect(result.all[3].type).toBe('text');

      // Check standard array has correct indices
      expect(result.standard[0].index).toBe(0);
      expect(result.standard[1].index).toBe(2);

      // Check text array has correct indices
      expect(result.text[0].index).toBe(1);
      expect(result.text[1].index).toBe(3);
    });

    it('should include effect in text layer classifications', () => {
      const layers = [
        createTextLayer({ content: 'Text', effect: 'foil' }),
      ];

      const result = classifyLayers(layers);

      expect(result.text[0].effect).toBe('foil');
      expect(result.all[0].effect).toBe('foil');
    });

    it('should include maskUrl in standard layer classifications', () => {
      const layers = [
        createStandardLayer({ mask: '/custom/mask.png' }),
      ];

      const result = classifyLayers(layers);

      expect(result.standard[0].maskUrl).toBe('/custom/mask.png');
      expect(result.all[0].maskUrl).toBe('/custom/mask.png');
    });
  });

  describe('isStandardLayer', () => {
    it('should return true for layer with string mask', () => {
      const layer = createStandardLayer();
      expect(isStandardLayer(layer)).toBe(true);
    });

    it('should return false for layer with object mask', () => {
      const layer = createTextLayer();
      expect(isStandardLayer(layer)).toBe(false);
    });
  });

  describe('isTextLayer', () => {
    it('should return true for layer with object mask', () => {
      const layer = createTextLayer();
      expect(isTextLayer(layer)).toBe(true);
    });

    it('should return false for layer with string mask', () => {
      const layer = createStandardLayer();
      expect(isTextLayer(layer)).toBe(false);
    });
  });

  describe('getLayerEffect', () => {
    it('should return effect for text layer with effect', () => {
      const layer = createTextLayer({ effect: 'metal' });
      expect(getLayerEffect(layer)).toBe('metal');
    });

    it('should return undefined for text layer without effect', () => {
      const layer = createTextLayer();
      expect(getLayerEffect(layer)).toBeUndefined();
    });

    it('should return undefined for standard layer', () => {
      const layer = createStandardLayer();
      expect(getLayerEffect(layer)).toBeUndefined();
    });
  });

  describe('getMaskUrl', () => {
    it('should return mask URL for standard layer', () => {
      const layer = createStandardLayer({ mask: '/path/to/mask.png' });
      expect(getMaskUrl(layer)).toBe('/path/to/mask.png');
    });

    it('should return undefined for text layer', () => {
      const layer = createTextLayer();
      expect(getMaskUrl(layer)).toBeUndefined();
    });

    it('should return empty string for standard layer with empty mask', () => {
      const layer = createStandardLayer({ mask: '' });
      expect(getMaskUrl(layer)).toBe('');
    });
  });

  describe('getMaskData', () => {
    it('should return mask data for text layer', () => {
      const maskData: PimcoMaskSubstitutionCompiled = {
        content: 'Test Content',
        effect: 'embroidery',
        transform: { rotation: 45 },
      };
      const layer = createTextLayer(maskData);

      const result = getMaskData(layer);

      expect(result).toEqual(maskData);
    });

    it('should return undefined for standard layer', () => {
      const layer = createStandardLayer();
      expect(getMaskData(layer)).toBeUndefined();
    });
  });

  describe('filterStandardLayers', () => {
    it('should return only standard layers', () => {
      const layers = [
        createStandardLayer({ id: 'std-1' }),
        createTextLayer({ content: 'text-1' }),
        createStandardLayer({ id: 'std-2' }),
        createTextLayer({ content: 'text-2' }),
        createStandardLayer({ id: 'std-3' }),
      ];

      const result = filterStandardLayers(layers);

      expect(result.length).toBe(3);
      expect(result[0].id).toBe('std-1');
      expect(result[1].id).toBe('std-2');
      expect(result[2].id).toBe('std-3');
      expect(typeof result[0].mask).toBe('string');
      expect(typeof result[1].mask).toBe('string');
      expect(typeof result[2].mask).toBe('string');
    });

    it('should return empty array when no standard layers', () => {
      const layers = [
        createTextLayer({ content: 'text-1' }),
        createTextLayer({ content: 'text-2' }),
      ];

      const result = filterStandardLayers(layers);

      expect(result).toEqual([]);
    });

    it('should return all layers when all are standard', () => {
      const layers = [
        createStandardLayer({ id: 'std-1' }),
        createStandardLayer({ id: 'std-2' }),
      ];

      const result = filterStandardLayers(layers);

      expect(result.length).toBe(2);
    });
  });

  describe('filterTextLayers', () => {
    it('should return only text layers', () => {
      const layers = [
        createStandardLayer({ id: 'std-1' }),
        createTextLayer({ content: 'text-1', effect: 'engraving' }),
        createStandardLayer({ id: 'std-2' }),
        createTextLayer({ content: 'text-2', effect: 'metal' }),
      ];

      const result = filterTextLayers(layers);

      expect(result.length).toBe(2);
      expect((result[0].mask as PimcoMaskSubstitutionCompiled).content).toBe('text-1');
      expect((result[1].mask as PimcoMaskSubstitutionCompiled).content).toBe('text-2');
    });

    it('should return empty array when no text layers', () => {
      const layers = [
        createStandardLayer({ id: 'std-1' }),
        createStandardLayer({ id: 'std-2' }),
      ];

      const result = filterTextLayers(layers);

      expect(result).toEqual([]);
    });

    it('should return all layers when all are text', () => {
      const layers = [
        createTextLayer({ content: 'text-1' }),
        createTextLayer({ content: 'text-2' }),
      ];

      const result = filterTextLayers(layers);

      expect(result.length).toBe(2);
    });
  });

  describe('edge cases', () => {
    it('should handle layer with complex mask data', () => {
      const complexMask: PimcoMaskSubstitutionCompiled = {
        content: 'Complex Text',
        effect: 'foil',
        effectparams: {
          AlphaErosionRadius: 0.5,
          CustomParam: 'value',
        },
        transform: {
          translation: [10, 20],
          rotation: 45,
          scale: [1.5, 1.5],
        },
        type: {
          fontfamily: 'Arial',
          fontweight: 700,
          alignment: 'center',
        },
        postmask: '/path/to/postmask.png',
      };

      const layer = createTextLayer(complexMask);
      const result = classifyLayer(layer, 0);

      expect(result.type).toBe('text');
      expect(result.maskData).toEqual(complexMask);
      expect(result.effect).toBe('foil');
    });

    it('should handle large number of layers', () => {
      const layers: ProductImageComponent[] = [];
      for (let i = 0; i < 100; i++) {
        if (i % 2 === 0) {
          layers.push(createStandardLayer({ id: `std-${String(i)}` }));
        } else {
          layers.push(createTextLayer({ content: `text-${String(i)}` }));
        }
      }

      const result = classifyLayers(layers);

      expect(result.total).toBe(100);
      expect(result.standardCount).toBe(50);
      expect(result.textCount).toBe(50);
    });

    it('should handle layer with additional optional properties', () => {
      const layer: ProductImageComponent = {
        id: 'full-layer',
        name: 'Fully Featured Layer',
        mode: 'color',
        color: '#ff0000',
        texture: '/textures/fabric.png',
        alpha: 0.8,
        blend: 'multiply',
        mask: '/masks/layer.png',
        image: '/images/base.png',
        order: 5,
        hlimage1: '/highlights/hl1.png',
        hlalpha1: 0.5,
        hlblend1: 'screen',
        hlimage2: '/highlights/hl2.png',
        hlalpha2: 0.3,
        hlblend2: 'overlay',
        compositemode: 'source-over',
        compositealpha: 0.9,
        placement: {
          top: 10,
          left: 20,
          width: 100,
          height: 100,
          fit: 'contain',
        },
      };

      const result = classifyLayer(layer, 0);

      expect(result.type).toBe('standard');
      expect(result.layer).toBe(layer);
      expect(result.layer.hlimage1).toBe('/highlights/hl1.png');
      expect(result.layer.compositealpha).toBe(0.9);
    });
  });
});
