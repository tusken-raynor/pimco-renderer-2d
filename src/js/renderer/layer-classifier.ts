/**
 * Layer classification module for determining how layers should be rendered.
 *
 * Layers are classified based on their `mask` field:
 * - String URL → Standard layer (uses image mask, rendered by Standard Render Slave)
 * - Object (PimcoMaskSubstitutionCompiled) → Text layer (uses effect pipeline, rendered by Text Render Slave)
 */

import type {
  ProductImageComponent,
  PimcoMaskSubstitutionCompiled,
  PimcoMaskSubstitutionEffect,
} from '../types/pimco';
import { isTextLayerMask, isStandardLayerMask } from '../types/pimco';

/**
 * Layer type classification.
 */
export type LayerType = 'standard' | 'text';

/**
 * Result of classifying a single layer.
 */
export interface LayerClassification {
  /** The layer type */
  type: LayerType;
  /** Index of the layer in the original array */
  index: number;
  /** Reference to the original layer */
  layer: ProductImageComponent;
  /** For text layers, the effect type (if any) */
  effect?: PimcoMaskSubstitutionEffect;
  /** For text layers, the compiled mask substitution data */
  maskData?: PimcoMaskSubstitutionCompiled;
  /** For standard layers, the mask URL */
  maskUrl?: string;
}

/**
 * Result of classifying all layers.
 */
export interface ClassificationResult {
  /** All layer classifications in original order */
  all: LayerClassification[];
  /** Standard layers only */
  standard: LayerClassification[];
  /** Text layers only */
  text: LayerClassification[];
  /** Total layer count */
  total: number;
  /** Count of standard layers */
  standardCount: number;
  /** Count of text layers */
  textCount: number;
}

/**
 * Classify a single layer based on its mask field.
 *
 * @param layer - The layer to classify
 * @param index - The index of the layer in the original array
 * @returns Classification result for the layer
 */
export function classifyLayer(layer: ProductImageComponent, index: number): LayerClassification {
  const mask = layer.mask;

  if (isStandardLayerMask(mask)) {
    return {
      type: 'standard',
      index,
      layer,
      maskUrl: mask,
    };
  }

  if (isTextLayerMask(mask)) {
    const classification: LayerClassification = {
      type: 'text',
      index,
      layer,
      maskData: mask,
    };
    // Only set effect if it's defined (exactOptionalPropertyTypes compliance)
    if (mask.effect !== undefined) {
      classification.effect = mask.effect;
    }
    return classification;
  }

  // This should never happen if types are correct, but handle gracefully
  // Treat as standard layer with empty mask URL
  return {
    type: 'standard',
    index,
    layer,
    maskUrl: '',
  };
}

/**
 * Classify all layers in an array.
 *
 * Layers are classified based on their `mask` field type:
 * - String URL → Standard layer
 * - Object (PimcoMaskSubstitutionCompiled) → Text layer
 *
 * @param layers - Array of layers to classify
 * @returns Classification result with layers grouped by type
 *
 * @example
 * ```typescript
 * const layers = [
 *   { id: 'bg', mask: '/images/bg-mask.png', ... },  // Standard
 *   { id: 'text', mask: { content: 'Hello', effect: 'embroidery' }, ... },  // Text
 * ];
 *
 * const result = classifyLayers(layers);
 * console.log(result.standardCount);  // 1
 * console.log(result.textCount);      // 1
 * ```
 */
export function classifyLayers(layers: ProductImageComponent[]): ClassificationResult {
  const all: LayerClassification[] = [];
  const standard: LayerClassification[] = [];
  const text: LayerClassification[] = [];

  for (let i = 0; i < layers.length; i++) {
    const classification = classifyLayer(layers[i], i);
    all.push(classification);

    if (classification.type === 'standard') {
      standard.push(classification);
    } else {
      text.push(classification);
    }
  }

  return {
    all,
    standard,
    text,
    total: layers.length,
    standardCount: standard.length,
    textCount: text.length,
  };
}

/**
 * Check if a layer is a standard layer (has URL mask).
 *
 * @param layer - The layer to check
 * @returns true if the layer is a standard layer
 */
export function isStandardLayer(layer: ProductImageComponent): boolean {
  return isStandardLayerMask(layer.mask);
}

/**
 * Check if a layer is a text layer (has compiled mask substitution).
 *
 * @param layer - The layer to check
 * @returns true if the layer is a text layer
 */
export function isTextLayer(layer: ProductImageComponent): boolean {
  return isTextLayerMask(layer.mask);
}

/**
 * Get the effect type for a text layer.
 *
 * @param layer - The layer to get the effect from
 * @returns The effect type, or undefined if not a text layer or no effect specified
 */
export function getLayerEffect(
  layer: ProductImageComponent
): PimcoMaskSubstitutionEffect | undefined {
  if (!isTextLayerMask(layer.mask)) {
    return undefined;
  }
  return layer.mask.effect;
}

/**
 * Get the mask URL for a standard layer.
 *
 * @param layer - The layer to get the mask URL from
 * @returns The mask URL, or undefined if not a standard layer
 */
export function getMaskUrl(layer: ProductImageComponent): string | undefined {
  if (!isStandardLayerMask(layer.mask)) {
    return undefined;
  }
  return layer.mask;
}

/**
 * Get the mask data for a text layer.
 *
 * @param layer - The layer to get the mask data from
 * @returns The mask data, or undefined if not a text layer
 */
export function getMaskData(
  layer: ProductImageComponent
): PimcoMaskSubstitutionCompiled | undefined {
  if (!isTextLayerMask(layer.mask)) {
    return undefined;
  }
  return layer.mask;
}

/**
 * Filter layers to only standard layers.
 *
 * @param layers - Array of layers to filter
 * @returns Array of standard layers only
 */
export function filterStandardLayers(
  layers: ProductImageComponent[]
): (ProductImageComponent & { mask: string })[] {
  return layers.filter((layer): layer is ProductImageComponent & { mask: string } =>
    isStandardLayerMask(layer.mask)
  );
}

/**
 * Filter layers to only text layers.
 *
 * @param layers - Array of layers to filter
 * @returns Array of text layers only
 */
export function filterTextLayers(
  layers: ProductImageComponent[]
): (ProductImageComponent & { mask: PimcoMaskSubstitutionCompiled })[] {
  return layers.filter(
    (layer): layer is ProductImageComponent & { mask: PimcoMaskSubstitutionCompiled } =>
      isTextLayerMask(layer.mask)
  );
}
