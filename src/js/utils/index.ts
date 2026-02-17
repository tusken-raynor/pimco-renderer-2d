/**
 * Utility functions for the 2D renderer.
 * Re-exports all utilities from sub-modules.
 */

// Color utilities
export {
  parseHexColor,
  parseHexColorWithAlpha,
  rgbToHex,
  rgbaToHex,
  relativeLuminance,
  brightness,
  isDarkColor,
  multiplyColor,
  highlightSaturate,
  alphaBlend,
  lerpColor,
  clampColorValue,
} from './color';
export type { RGBAColor, RGBColor } from './color';

// Canvas utilities
export {
  isOffscreenCanvasSupported,
  createCanvas,
  getContext2D,
  createCanvasWithContext,
  resetCanvasContext,
  clearCanvas,
  cloneCanvas,
  resizeCanvas,
  drawImageFit,
  applyMatrix,
  getTransformMatrix,
  isWebGL2Supported,
  imageDataToImageBitmap,
  canvasToImageBitmap,
  drawCover,
  drawContain,
} from './canvas';
export type { Canvas2DContext, AnyCanvas } from './canvas';
