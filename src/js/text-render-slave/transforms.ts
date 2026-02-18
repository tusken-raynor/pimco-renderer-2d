/**
 * 2D Transform Module for Text Render Slave
 *
 * Handles translation, rotation, and scale transformations for text layers.
 * Transforms are applied after text rasterization and before post-mask application.
 *
 * Based on legacy applyWithTransformation() function in old-src-ref/src/renderer/index.ts
 */

import type { PimcoMaskSubstitutionTransformation } from '../types/pimco';
import type { AnyCanvas, Canvas2DContext } from '../utils/canvas';

/**
 * Parsed transform values ready for application.
 * All values are in pixels or radians.
 */
export interface ParsedTransform {
  /** X translation in pixels (default: 0) */
  translateX: number;
  /** Y translation in pixels (default: 0) */
  translateY: number;
  /** Rotation in degrees (default: 0) */
  rotation: number;
  /** X scale factor (default: 1) */
  scaleX: number;
  /** Y scale factor (default: 1) */
  scaleY: number;
}

/**
 * Text alignment type for computing transform origin offset.
 */
export type TextAlignment = 'left' | 'center' | 'right';

/**
 * Build a scale CSS string from scale value.
 *
 * @param scale - Scale value (number or [x, y] tuple)
 * @returns CSS scale() string or empty string if undefined
 */
export function toScaleString(scale: number | [number, number] | undefined): string {
  if (scale === undefined) {
    return '';
  }
  if (Array.isArray(scale)) {
    return `scale(${String(scale[0])}, ${String(scale[1])})`;
  }
  return `scale(${String(scale)})`;
}

/**
 * Build a rotation CSS string from rotation value.
 *
 * @param rotation - Rotation value (number in degrees or string with unit)
 * @returns CSS rotate() string or empty string if undefined
 */
export function toRotationString(rotation: string | number | undefined): string {
  if (rotation === undefined) {
    return '';
  }
  if (typeof rotation === 'string') {
    return `rotate(${rotation})`;
  }
  return `rotate(${String(rotation)}deg)`;
}

/**
 * Parse transform data from mask substitution into usable values.
 *
 * Transform coordinates are percentages of canvas dimensions:
 * - translation[0] = x offset as percentage (-50 to 50 maps to left to right)
 * - translation[1] = y offset as percentage (-50 to 50 maps to top to bottom)
 *
 * @param transform - Transform data from mask
 * @param canvasWidth - Canvas width in pixels
 * @param canvasHeight - Canvas height in pixels
 * @returns Parsed transform values
 */
export function parseTransform(
  transform: PimcoMaskSubstitutionTransformation | undefined,
  canvasWidth: number,
  canvasHeight: number
): ParsedTransform {
  // Default transform: identity
  const result: ParsedTransform = {
    translateX: 0,
    translateY: 0,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
  };

  if (!transform) {
    return result;
  }

  // Parse translation (percentage of canvas)
  if (transform.translation) {
    // translation[0] is X percentage, translation[1] is Y percentage
    // These are relative offsets where 0 = center, -50 = left/top edge, 50 = right/bottom edge
    result.translateX = canvasWidth * ((transform.translation[0] || 0) / 100);
    result.translateY = canvasHeight * ((transform.translation[1] || 0) / 100);
  }

  // Parse rotation (degrees)
  if (transform.rotation !== undefined) {
    result.rotation = transform.rotation;
  }

  // Parse scale (uniform or non-uniform)
  if (transform.scale !== undefined) {
    if (Array.isArray(transform.scale)) {
      result.scaleX = transform.scale[0];
      result.scaleY = transform.scale[1];
    } else {
      result.scaleX = transform.scale;
      result.scaleY = transform.scale;
    }
  }

  return result;
}

/**
 * Calculate alignment-based offset for text.
 *
 * When text is left/right aligned, the transform origin needs to be
 * adjusted so rotation/scale happens around the correct point.
 *
 * @param alignment - Text alignment
 * @param sourceWidth - Width of the source canvas/image
 * @returns Offset in pixels to apply before transforms
 */
export function calculateAlignmentOffset(
  alignment: TextAlignment | undefined,
  sourceWidth: number
): number {
  if (alignment === 'left') {
    return sourceWidth / 2;
  }
  if (alignment === 'right') {
    return -sourceWidth / 2;
  }
  // Center alignment (default): no offset needed
  return 0;
}

/**
 * Build a DOMMatrix representing the full transform chain.
 *
 * The transform is applied in this order:
 * 1. Translate to canvas center + transform offset
 * 2. Apply scale
 * 3. Apply rotation
 * 4. Apply alignment offset for the draw position
 *
 * The resulting matrix positions the source so it can be drawn at
 * (-sourceWidth/2, -sourceHeight/2) to appear centered with transforms.
 *
 * @param parsed - Parsed transform values
 * @param canvasWidth - Target canvas width
 * @param canvasHeight - Target canvas height
 * @param alignmentOffset - Alignment-based offset (from calculateAlignmentOffset)
 * @returns DOMMatrix for the combined transform
 */
export function buildTransformMatrix(
  parsed: ParsedTransform,
  canvasWidth: number,
  canvasHeight: number,
  alignmentOffset: number
): DOMMatrix {
  // Calculate the center position with transform offset applied
  // The base position is canvas center (0.5 of width/height)
  const centerX = canvasWidth * 0.5 + parsed.translateX;
  const centerY = canvasHeight * 0.5 + parsed.translateY;

  // Build the transform matrix using numeric operations.
  // This approach works in Web Workers where DOMMatrix string parsing is not available.
  // Transform order: translate, scale, rotate, alignment (applied left-to-right)

  // Start with identity matrix
  let matrix = new DOMMatrix();

  // 1. Translate to center + offset
  matrix = matrix.translate(centerX, centerY);

  // 2. Scale (if non-identity)
  if (parsed.scaleX !== 1 || parsed.scaleY !== 1) {
    matrix = matrix.scale(parsed.scaleX, parsed.scaleY);
  }

  // 3. Rotate (if non-zero) - DOMMatrix.rotate() takes degrees
  if (parsed.rotation !== 0) {
    matrix = matrix.rotate(parsed.rotation);
  }

  // 4. Alignment offset (moves the origin for left/right aligned text)
  if (alignmentOffset !== 0) {
    matrix = matrix.translate(alignmentOffset, 0);
  }

  return matrix;
}

/**
 * Apply transforms and draw source onto target context.
 *
 * This function handles the full transform pipeline:
 * 1. Saves current context state
 * 2. Applies the transform matrix
 * 3. Draws the source centered at origin
 * 4. Restores context state
 *
 * @param targetCtx - Target canvas 2D context
 * @param source - Source canvas or ImageBitmap to draw
 * @param transform - Transform data from mask
 * @param canvasWidth - Target canvas width
 * @param canvasHeight - Target canvas height
 * @param alignment - Text alignment for offset calculation
 */
export function applyTransformAndDraw(
  targetCtx: Canvas2DContext,
  source: AnyCanvas | ImageBitmap,
  transform: PimcoMaskSubstitutionTransformation | undefined,
  canvasWidth: number,
  canvasHeight: number,
  alignment?: TextAlignment
): void {
  // Get source dimensions
  const sourceWidth = source.width;
  const sourceHeight = source.height;

  // Parse transform data
  const parsed = parseTransform(transform, canvasWidth, canvasHeight);

  // Calculate alignment offset
  const alignmentOffset = calculateAlignmentOffset(alignment, sourceWidth);

  // Build the transform matrix
  const matrix = buildTransformMatrix(parsed, canvasWidth, canvasHeight, alignmentOffset);

  // Apply transform and draw
  targetCtx.save();
  targetCtx.setTransform(matrix);

  // Draw centered at origin (the matrix translates to the correct position)
  targetCtx.drawImage(source, -sourceWidth / 2, -sourceHeight / 2);

  targetCtx.restore();
}

/**
 * Check if a transform has any non-identity values.
 *
 * This can be used to skip transform application for performance
 * when no transforms are actually defined.
 *
 * @param transform - Transform data from mask
 * @returns True if any transform values are non-default
 */
export function hasActiveTransform(
  transform: PimcoMaskSubstitutionTransformation | undefined
): boolean {
  if (!transform) {
    return false;
  }

  // Check translation
  if (transform.translation) {
    if (transform.translation[0] !== 0 || transform.translation[1] !== 0) {
      return true;
    }
  }

  // Check rotation
  if (transform.rotation !== undefined && transform.rotation !== 0) {
    return true;
  }

  // Check scale
  if (transform.scale !== undefined) {
    if (Array.isArray(transform.scale)) {
      if (transform.scale[0] !== 1 || transform.scale[1] !== 1) {
        return true;
      }
    } else if (transform.scale !== 1) {
      return true;
    }
  }

  return false;
}
