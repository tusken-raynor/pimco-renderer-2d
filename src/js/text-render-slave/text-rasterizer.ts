/**
 * Text Rasterization Module
 *
 * Handles text measurement and rendering for text layers.
 * This module is responsible for:
 * - Setting up typography properties (font family, weight, size, letter spacing)
 * - Measuring text dimensions with proper scaling
 * - Rendering text to canvas with correct positioning
 * - Supporting text transformations (uppercase, lowercase, capitalize)
 * - Handling multi-line text (future consideration)
 *
 * Based on the legacy preEffect() and drawSubstitutionMask() functions.
 */

import type { PimcoMaskSubstitutionTypeDefinition } from '../types/pimco';
import { createCanvas, getContext2D, type AnyCanvas } from '../utils/canvas';
import type { Canvas2DContext } from '../utils/canvas';

/**
 * Default typography values (from legacy renderer).
 * LH = line height ratio, MW = max width ratio, OVSC = overscale factor
 */
const DEFAULT_LINE_HEIGHT = 0.08;
const DEFAULT_MAX_WIDTH = 0.85;
const DEFAULT_FONT_WEIGHT = '400';
const DEFAULT_FONT_FAMILY = 'sans-serif';
const OVERSCALE_FACTOR = 1.5;

/**
 * Typography configuration for text rendering.
 */
export interface TypographyConfig {
  /** Font family name (e.g., 'Arial', 'sans-serif') */
  fontFamily: string;
  /** Font weight (e.g., '400', '700', 'bold') */
  fontWeight: string | number;
  /** Computed font size in pixels */
  fontSize: number;
  /** Letter spacing CSS value (e.g., '0.1em', '2px') */
  letterSpacing: string;
  /** Text transform: uppercase, lowercase, capitalize, or none */
  textTransform: 'uppercase' | 'lowercase' | 'capitalize' | 'none';
  /** Horizontal alignment: left, center, or right */
  alignment: 'left' | 'center' | 'right';
  /** Scale factor for width adjustment */
  widthScale: number;
  /** Scale factor for height adjustment */
  heightScale: number;
}

/**
 * Text measurement result.
 */
export interface TextMeasurement {
  /** Measured text width in pixels */
  width: number;
  /** Computed text height in pixels */
  height: number;
  /** Scale factor applied to fit within max width */
  scale: number;
  /** The transformed text content */
  text: string;
  /** Typography configuration used */
  typography: TypographyConfig;
}

/**
 * Text rasterization result.
 */
export interface RasterizedText {
  /** Canvas containing the rasterized text */
  canvas: AnyCanvas;
  /** Canvas width */
  width: number;
  /** Canvas height */
  height: number;
  /** The measurement data used */
  measurement: TextMeasurement;
}

/**
 * Options for text rasterization.
 */
export interface TextRasterizerOptions {
  /** Main canvas width (for computing relative sizes) */
  workWidth: number;
  /** Main canvas height (for computing relative sizes) */
  workHeight: number;
  /** Typography definition from the mask */
  type?: PimcoMaskSubstitutionTypeDefinition;
  /** Text content to render */
  content: string;
}

/**
 * Apply text transform to content.
 *
 * @param text - Original text
 * @param transform - Transform type
 * @returns Transformed text
 */
export function applyTextTransform(
  text: string,
  transform: 'uppercase' | 'lowercase' | 'capitalize' | 'none'
): string {
  switch (transform) {
    case 'uppercase':
      return text.toUpperCase();
    case 'lowercase':
      return text.toLowerCase();
    case 'capitalize':
      // Capitalize first letter of each word
      return text.replace(/\b\w/g, (char) => char.toUpperCase());
    case 'none':
    default:
      return text;
  }
}

/**
 * Parse typography definition to a normalized config.
 *
 * @param type - Typography definition from mask
 * @param workWidth - Main canvas width
 * @returns Typography configuration
 */
export function parseTypography(
  type: PimcoMaskSubstitutionTypeDefinition | undefined,
  workWidth: number
): TypographyConfig {
  const lineHeight = type?.lineheight ?? DEFAULT_LINE_HEIGHT;
  const fontSize = workWidth * lineHeight;

  return {
    fontFamily: type?.fontfamily ?? DEFAULT_FONT_FAMILY,
    fontWeight: type?.fontweight ?? DEFAULT_FONT_WEIGHT,
    fontSize,
    letterSpacing: type?.letterspacing ?? '',
    textTransform: type?.texttransform ?? 'none',
    alignment: type?.alignment ?? 'center',
    widthScale: type?.widthscale ?? 1,
    heightScale: type?.heightscale ?? 1,
  };
}

/**
 * Build a CSS font string from typography config.
 *
 * @param typography - Typography configuration
 * @returns CSS font string (e.g., '400 24px sans-serif')
 */
export function buildFontString(typography: TypographyConfig): string {
  return `${typography.fontWeight} ${typography.fontSize}px/100% ${typography.fontFamily}`;
}

/**
 * Apply letter spacing to a context if supported.
 *
 * @param ctx - Canvas 2D context
 * @param letterSpacing - Letter spacing value
 */
export function applyLetterSpacing(ctx: Canvas2DContext, letterSpacing: string): void {
  // Check if letterSpacing is supported (not all contexts support it)
  if ('letterSpacing' in ctx) {
    (ctx as CanvasRenderingContext2D).letterSpacing = letterSpacing;
  }
}

/**
 * Measure text dimensions and compute scaling.
 *
 * @param content - Text content to measure
 * @param type - Typography definition
 * @param workWidth - Main canvas width
 * @returns Text measurement result
 */
export function measureText(
  content: string,
  type: PimcoMaskSubstitutionTypeDefinition | undefined,
  workWidth: number
): TextMeasurement {
  // Parse typography
  const typography = parseTypography(type, workWidth);

  // Apply text transform
  const text = applyTextTransform(content, typography.textTransform);

  // Handle empty text
  if (!text) {
    return {
      width: 0,
      height: 0,
      scale: 1,
      text: '',
      typography,
    };
  }

  // Create a temporary canvas for measurement
  const canvas = createCanvas(1, 1);
  const ctx = getContext2D(canvas);

  if (!ctx) {
    throw new Error('Failed to create context for text measurement');
  }

  // Set font for measurement
  ctx.font = buildFontString(typography);
  applyLetterSpacing(ctx, typography.letterSpacing);

  // Measure text width
  const metrics = ctx.measureText(text);
  let measuredWidth = metrics.width * typography.widthScale;

  // Calculate max width and scale factor
  const maxWidth = type?.maxwidth ?? DEFAULT_MAX_WIDTH;
  const maxWidthPx = workWidth * maxWidth;
  const scale = Math.min(maxWidthPx / measuredWidth, 1);

  // If we need to scale down, recalculate with scaled font
  if (scale < 1) {
    const scaledFontSize = typography.fontSize * scale;
    const scaledTypography = { ...typography, fontSize: scaledFontSize };
    ctx.font = buildFontString(scaledTypography);

    // Re-measure with scaled font
    const scaledMetrics = ctx.measureText(text);
    measuredWidth = scaledMetrics.width * typography.widthScale;

    // Update typography with scaled font size
    typography.fontSize = scaledFontSize;
  }

  // Calculate final dimensions
  const width = Math.floor(measuredWidth * typography.widthScale);
  const height = Math.floor(typography.fontSize * OVERSCALE_FACTOR * typography.heightScale);

  return {
    width,
    height,
    scale,
    text,
    typography,
  };
}

/**
 * Rasterize text to a canvas.
 *
 * @param options - Rasterization options
 * @returns Rasterized text result
 */
export function rasterizeText(options: TextRasterizerOptions): RasterizedText {
  const { workWidth, type, content } = options;

  // Measure text
  const measurement = measureText(content, type, workWidth);

  // Handle empty text
  if (!measurement.text || measurement.width === 0 || measurement.height === 0) {
    const emptyCanvas = createCanvas(1, 1);
    return {
      canvas: emptyCanvas,
      width: 1,
      height: 1,
      measurement,
    };
  }

  // Create canvas for rasterization
  const canvas = createCanvas(measurement.width, measurement.height);
  const ctx = getContext2D(canvas);

  if (!ctx) {
    throw new Error('Failed to create context for text rasterization');
  }

  // Clear canvas
  ctx.clearRect(0, 0, measurement.width, measurement.height);

  // Set typography
  const { typography } = measurement;
  ctx.font = buildFontString({
    ...typography,
    fontSize: typography.fontSize / OVERSCALE_FACTOR, // Divide by overscale as we're drawing to overscaled canvas
  });
  applyLetterSpacing(ctx, typography.letterSpacing);

  // Set fill style
  ctx.fillStyle = '#000000';

  // Set text baseline for vertical centering
  ctx.textBaseline = 'middle';

  // Set text alignment
  let x = 0;
  switch (typography.alignment) {
    case 'center':
      ctx.textAlign = 'center';
      x = measurement.width / 2;
      break;
    case 'right':
      ctx.textAlign = 'right';
      x = measurement.width;
      break;
    case 'left':
    default:
      ctx.textAlign = 'left';
      x = 0;
      break;
  }

  // Draw text (vertically centered)
  const y = measurement.height / 2;
  ctx.fillText(measurement.text, x, y);

  return {
    canvas,
    width: measurement.width,
    height: measurement.height,
    measurement,
  };
}

/**
 * TextRasterizer class for managing text rasterization context.
 * Provides a reusable interface for text rendering operations.
 */
export class TextRasterizer {
  /**
   * Measure text with typography settings.
   *
   * @param content - Text content
   * @param type - Typography definition
   * @param workWidth - Main canvas width
   * @returns Text measurement
   */
  measure(
    content: string,
    type: PimcoMaskSubstitutionTypeDefinition | undefined,
    workWidth: number
  ): TextMeasurement {
    return measureText(content, type, workWidth);
  }

  /**
   * Rasterize text to a canvas.
   *
   * @param options - Rasterization options
   * @returns Rasterized text result
   */
  rasterize(options: TextRasterizerOptions): RasterizedText {
    return rasterizeText(options);
  }

  /**
   * Apply text transform to content.
   *
   * @param text - Original text
   * @param transform - Transform type
   * @returns Transformed text
   */
  transform(
    text: string,
    transform: 'uppercase' | 'lowercase' | 'capitalize' | 'none'
  ): string {
    return applyTextTransform(text, transform);
  }

  /**
   * Clean up resources.
   * Currently a no-op, but provided for interface consistency with other slaves.
   */
  destroy(): void {
    // No-op for now - resources are created and released per-call
  }
}

/**
 * Create a new TextRasterizer instance.
 *
 * @returns TextRasterizer instance
 */
export function createTextRasterizer(): TextRasterizer {
  return new TextRasterizer();
}
