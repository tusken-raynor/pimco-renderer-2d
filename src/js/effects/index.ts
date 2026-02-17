/**
 * Effects module with WebGL PostProcessor integration.
 *
 * This module provides GPU-accelerated effects using WebGL2 shaders.
 * The shaders are internal to this project (src/shaders/*.glsl) while
 * webgl-postprocessor handles the WebGL2 boilerplate.
 *
 * Usage Pattern:
 * 1. Create/wake the WebGL buddy with myWebGLBuddy()
 * 2. Create or reuse a program via newProgram()/useProgram()
 * 3. Set uniforms and render via setUniforms().to(target)
 * 4. Clean up texture uniforms and sleep() when done
 */

import WebGLPostProcessor, { Uniforms } from 'webgl-postprocessor';

// Import shader sources using Vite's ?raw suffix
import alphaErodeFragSrc from '@/shaders/alpha-erode.frag.glsl?raw';
import embossFragSrc from '@/shaders/emboss.frag.glsl?raw';
import fuzzFragSrc from '@/shaders/fuzz.frag.glsl?raw';
import normalMapFragSrc from '@/shaders/normal-map.frag.glsl?raw';
import colorScaleFragSrc from '@/shaders/color-scale.frag.glsl?raw';

import type { Canvas2DContext, AnyCanvas } from '@/js/utils';

/**
 * Singleton WebGL PostProcessor instance.
 * Lazily initialized on first use.
 */
let webGLBuddy: WebGLPostProcessor | null = null;

/**
 * Get or create the WebGL PostProcessor singleton.
 * Returns null if WebGL2 is not supported.
 *
 * @returns The WebGL PostProcessor instance, or null if unsupported
 */
export function myWebGLBuddy(): WebGLPostProcessor | null {
  if (!WebGLPostProcessor.isWebGL2Supported()) {
    return null;
  }

  webGLBuddy ??= new WebGLPostProcessor();

  return webGLBuddy;
}

/**
 * Check if WebGL2 effects are available.
 *
 * @returns true if WebGL2 is supported
 */
export function isWebGL2EffectsAvailable(): boolean {
  return WebGLPostProcessor.isWebGL2Supported();
}

/**
 * 3x3 matrix tuple type for convolution kernels.
 */
export type Mat3Tuple = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

/**
 * Standard emboss matrix (raised effect - light from top-left).
 */
export const EMBOSS_MATRIX_STANDARD: Mat3Tuple = [0, -1, -1, 0, -1, 1, 1, 1, 0];

/**
 * Inverted emboss matrix (deboss/engraved effect).
 */
export const EMBOSS_MATRIX_INVERTED: Mat3Tuple = [0, 1, 1, 1, -1, 0, -1, -1, 0];

/**
 * Apply alpha erosion effect using WebGL.
 * Shrinks the alpha channel by sampling neighboring pixels.
 *
 * @param radius - Erosion radius in pixels
 * @param input - Source canvas/OffscreenCanvas
 * @param target - Target canvas/OffscreenCanvas
 */
export function alphaErode(
  radius: number,
  input: AnyCanvas,
  target: AnyCanvas | Canvas2DContext
): void {
  const buddy = myWebGLBuddy()?.wake();
  if (!buddy) {
    console.warn('WebGL2 is not supported, skipping alpha erode effect');
    return;
  }

  // Create or reuse the alpha erode program
  if (buddy.hasProgram('alpha_erode')) {
    buddy.useProgram('alpha_erode');
  } else {
    buddy.newProgram('alpha_erode', {
      fragmentSrc: alphaErodeFragSrc,
      fragmentKey: 'f_alpha_erode',
    });
  }

  const start = Math.ceil(-radius);
  const end = Math.ceil(radius);
  const texelSizeX = 1.0 / input.width;
  const texelSizeY = 1.0 / input.height;

  buddy.setResolution(input.width, input.height);
  buddy
    .setUniforms({
      uStart: { type: Uniforms.INT1, value: start },
      uEnd: { type: Uniforms.INT1, value: end },
      uTexelSizeX: { type: Uniforms.FLOAT1, value: texelSizeX },
      uTexelSizeY: { type: Uniforms.FLOAT1, value: texelSizeY },
      uInput: { type: Uniforms.TEXTURE2D, value: input },
    })
    .to(target);

  // Clean up and sleep
  buddy.unsetTextureUniforms('uInput').sleep();
}

/**
 * Apply emboss/deboss convolution effect using WebGL.
 *
 * @param input - Source canvas/OffscreenCanvas
 * @param target - Target canvas/OffscreenCanvas
 * @param inverted - If true, use inverted (deboss) matrix
 * @param customMatrix - Optional custom 3x3 convolution matrix (9 values)
 */
export function emboss(
  input: AnyCanvas,
  target: AnyCanvas | Canvas2DContext,
  inverted = false,
  customMatrix?: Mat3Tuple
): void {
  const buddy = myWebGLBuddy()?.wake();
  if (!buddy) {
    console.warn('WebGL2 is not supported, skipping emboss effect');
    return;
  }

  // Create or reuse the emboss program
  if (buddy.hasProgram('emboss')) {
    buddy.useProgram('emboss');
  } else {
    buddy.newProgram('emboss', {
      fragmentSrc: embossFragSrc,
      fragmentKey: 'f_emboss',
    });
  }

  const matrix: Mat3Tuple =
    customMatrix ?? (inverted ? EMBOSS_MATRIX_INVERTED : EMBOSS_MATRIX_STANDARD);

  const texelSizeX = 1.0 / input.width;
  const texelSizeY = 1.0 / input.height;

  buddy.setResolution(input.width, input.height);
  buddy
    .setUniforms({
      uTexelSizeX: { type: Uniforms.FLOAT1, value: texelSizeX },
      uTexelSizeY: { type: Uniforms.FLOAT1, value: texelSizeY },
      uMatrix: { type: Uniforms.MAT3, value: matrix },
      uInput: { type: Uniforms.TEXTURE2D, value: input },
    })
    .to(target);

  // Clean up and sleep
  buddy.unsetTextureUniforms('uInput').sleep();
}

/**
 * Apply fuzz effect using WebGL.
 * Creates a stitched/fuzzy appearance like embroidery.
 *
 * @param ctx - Target canvas context (also used as source)
 * @param fuzzScale - Intensity of the fuzz effect (default: 1.0)
 */
export function fuzz(ctx: Canvas2DContext, fuzzScale = 1.0): void {
  const buddy = myWebGLBuddy()?.wake();
  if (!buddy) {
    console.warn('WebGL2 is not supported, skipping fuzz effect');
    return;
  }

  // Create or reuse the fuzz program
  if (buddy.hasProgram('embroid_fuzz')) {
    buddy.useProgram('embroid_fuzz');
  } else {
    buddy.newProgram('embroid_fuzz', {
      fragmentSrc: fuzzFragSrc,
      fragmentKey: 'f_embroid_fuzz',
    });
  }

  const canvas = ctx.canvas;
  buddy.setResolution(canvas.width, canvas.height);
  buddy
    .setUniforms({
      uFuzzScale: { type: Uniforms.FLOAT1, value: fuzzScale },
      uTexelSizeX: { type: Uniforms.FLOAT1, value: 1.0 / canvas.width },
      uSeedOffset: { type: Uniforms.INT1, value: Math.floor(Math.random() * 1000) },
      uInput: { type: Uniforms.TEXTURE2D, value: canvas },
    })
    .to(ctx);

  // Clean up and sleep
  buddy.unsetTextureUniforms('uInput').sleep();
}

/**
 * Apply normal map generation using WebGL.
 * Converts a height map to a normal map for lighting effects.
 *
 * @param input - Source canvas/OffscreenCanvas (grayscale height map)
 * @param target - Target canvas/OffscreenCanvas
 * @param direction - Light direction: 'N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'
 * @param intensity - Normal strength (default: 1.0)
 */
export function normalMap(
  input: AnyCanvas,
  target: AnyCanvas | Canvas2DContext,
  direction = 'N',
  intensity = 1.0
): void {
  const buddy = myWebGLBuddy()?.wake();
  if (!buddy) {
    console.warn('WebGL2 is not supported, skipping normal map generation');
    return;
  }

  // Create or reuse the normal map program
  if (buddy.hasProgram('normal_map')) {
    buddy.useProgram('normal_map');
  } else {
    buddy.newProgram('normal_map', {
      fragmentSrc: normalMapFragSrc,
      fragmentKey: 'f_normal_map',
    });
  }

  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const directionIndex = Math.max(directions.indexOf(direction.toUpperCase()), 0);

  const texelSizeX = 1.0 / input.width;
  const texelSizeY = 1.0 / input.height;

  buddy.setResolution(input.width, input.height);
  buddy
    .setUniforms({
      uTexelSizeX: { type: Uniforms.FLOAT1, value: texelSizeX },
      uTexelSizeY: { type: Uniforms.FLOAT1, value: texelSizeY },
      uIntensity: { type: Uniforms.FLOAT1, value: intensity },
      uDirection: { type: Uniforms.INT1, value: directionIndex },
      uInput: { type: Uniforms.TEXTURE2D, value: input },
    })
    .to(target);

  // Clean up and sleep
  buddy.unsetTextureUniforms('uInput').sleep();
}

/**
 * Apply color scaling using WebGL.
 * Adjusts color intensity around neutral gray.
 *
 * @param input - Source canvas/OffscreenCanvas
 * @param target - Target canvas/OffscreenCanvas
 * @param intensity - Scale factor (1.0 = no change, >1 = more contrast)
 */
export function colorScale(
  input: AnyCanvas,
  target: AnyCanvas | Canvas2DContext,
  intensity: number
): void {
  const buddy = myWebGLBuddy()?.wake();
  if (!buddy) {
    console.warn('WebGL2 is not supported, skipping color scale effect');
    return;
  }

  // Create or reuse the color scale program
  if (buddy.hasProgram('color_scale')) {
    buddy.useProgram('color_scale');
  } else {
    buddy.newProgram('color_scale', {
      fragmentSrc: colorScaleFragSrc,
      fragmentKey: 'f_color_scale',
    });
  }

  buddy.setResolution(input.width, input.height);
  buddy
    .setUniforms({
      uIntensity: { type: Uniforms.FLOAT1, value: intensity },
      uInput: { type: Uniforms.TEXTURE2D, value: input },
    })
    .to(target);

  // Clean up and sleep
  buddy.unsetTextureUniforms('uInput').sleep();
}

// =============================================================================
// Canvas 2D Effects (CPU-based fallbacks and additional effects)
// =============================================================================

/**
 * Apply emboss effect using Canvas 2D API (CPU-based).
 * This is a fallback for when WebGL is not available.
 *
 * @param ctx - Canvas 2D context (modified in place)
 * @param width - Canvas width
 * @param height - Canvas height
 * @param invertedMatrix - If true or matrix, use that for convolution
 */
export function emboss2D(
  ctx: Canvas2DContext,
  width: number,
  height: number,
  invertedMatrix: number[][] | boolean = false
): void {
  let matrix: number[][];

  if (invertedMatrix === false) {
    matrix = [
      [0, -1, -1],
      [0, -1, 1],
      [1, 1, 0],
    ];
  } else if (invertedMatrix === true) {
    matrix = [
      [0, 1, 1],
      [1, -1, 0],
      [-1, -1, 0],
    ];
  } else {
    matrix = invertedMatrix;
  }

  const imageData = ctx.getImageData(0, 0, width, height);
  const outputData = ctx.createImageData(width, height);
  convolute2D(imageData, matrix, outputData, 0, 0, width, height);
  ctx.putImageData(outputData, 0, 0);
}

/**
 * Invert RGB values of the canvas.
 *
 * @param ctx - Canvas 2D context
 * @param width - Canvas width
 * @param height - Canvas height
 */
export function invert(ctx: Canvas2DContext, width: number, height: number): void {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const length = data.length;

  for (let idx = 0; idx < length; idx += 4) {
    data[idx] = 255 - data[idx]; // red
    data[idx + 1] = 255 - data[idx + 1]; // green
    data[idx + 2] = 255 - data[idx + 2]; // blue
    // alpha unchanged
  }

  ctx.putImageData(imageData, 0, 0);
}

/**
 * Convert black areas to alpha (grayscale to alpha mask).
 *
 * @param ctx - Canvas 2D context
 * @param width - Canvas width
 * @param height - Canvas height
 */
export function blackToAlpha(ctx: Canvas2DContext, width: number, height: number): void {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const length = data.length;

  for (let idx = 0; idx < length; idx += 4) {
    const alpha = data[idx]; // Use red channel as alpha
    data[idx] = 255; // red
    data[idx + 1] = 255; // green
    data[idx + 2] = 255; // blue
    data[idx + 3] = alpha;
  }

  ctx.putImageData(imageData, 0, 0);
}

/**
 * Convert white areas to alpha (inverse grayscale to alpha mask).
 *
 * @param ctx - Canvas 2D context
 * @param width - Canvas width
 * @param height - Canvas height
 */
export function whiteToAlpha(ctx: Canvas2DContext, width: number, height: number): void {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const length = data.length;

  for (let idx = 0; idx < length; idx += 4) {
    const alpha = 255 - data[idx]; // Inverse of red channel as alpha
    data[idx] = 0; // red
    data[idx + 1] = 0; // green
    data[idx + 2] = 0; // blue
    data[idx + 3] = alpha;
  }

  ctx.putImageData(imageData, 0, 0);
}

/**
 * Apply color burn effect (saturate with a multiply color).
 *
 * @param ctx - Canvas 2D context
 * @param width - Canvas width
 * @param height - Canvas height
 * @param colorArray - RGB color array to burn with [r, g, b]
 */
export function colorBurn(
  ctx: Canvas2DContext,
  width: number,
  height: number,
  colorArray: number[]
): void {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const length = data.length;

  for (let idx = 0; idx < length; idx += 4) {
    const color = highlightSaturateRGB(
      [data[idx], data[idx + 1], data[idx + 2]],
      colorArray
    );
    data[idx] = color[0];
    data[idx + 1] = color[1];
    data[idx + 2] = color[2];
  }

  ctx.putImageData(imageData, 0, 0);
}

/**
 * Apply color scaling using Canvas 2D API (CPU-based).
 *
 * @param ctx - Canvas 2D context
 * @param width - Canvas width
 * @param height - Canvas height
 * @param intensity - Scale factor
 */
export function colorScale2D(
  ctx: Canvas2DContext,
  width: number,
  height: number,
  intensity: number
): void {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  for (let idx = 0; idx < data.length; idx += 4) {
    data[idx] = (data[idx] - 128) * intensity + 128;
    data[idx + 1] = (data[idx + 1] - 128) * intensity + 128;
    data[idx + 2] = (data[idx + 2] - 128) * intensity + 128;
  }

  ctx.putImageData(imageData, 0, 0);
}

/**
 * Tile an image pattern across a canvas.
 *
 * @param image - Source image/canvas to tile
 * @param width - Target canvas width
 * @param height - Target canvas height
 * @returns Canvas with tiled pattern, or null on failure
 */
export function tile(
  image: HTMLImageElement | HTMLCanvasElement | ImageBitmap,
  width: number,
  height: number
): HTMLCanvasElement | OffscreenCanvas | null {
  const canvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(width, height)
      : document.createElement('canvas');

  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d') as Canvas2DContext | null;
  if (!context) {
    return null;
  }

  const pattern = context.createPattern(image, 'repeat');
  if (!pattern) {
    return null;
  }

  context.fillStyle = pattern;
  context.fillRect(0, 0, width, height);

  return canvas;
}

// =============================================================================
// Internal Helpers
// =============================================================================

/**
 * Apply highlight saturation for color burn effect.
 */
function highlightSaturateRGB(
  colorArray: [number, number, number],
  multiplyColor: number[]
): [number, number, number] {
  let newRed = colorArray[0] << 1;
  let newGreen = colorArray[1] << 1;
  let newBlue = colorArray[2] << 1;

  // Distribute overflow to other channels
  const extraRed = Math.max(0, newRed - 255) >> 1;
  const extraGreen = Math.max(0, newGreen - 255) >> 1;
  const extraBlue = Math.max(0, newBlue - 255) >> 1;

  newRed = (Math.min(255, newRed) * multiplyColor[0]) >> 8;
  newGreen = (Math.min(255, newGreen) * multiplyColor[1]) >> 8;
  newBlue = (Math.min(255, newBlue) * multiplyColor[2]) >> 8;

  // Add overflow from other channels
  newRed += extraGreen + extraBlue;
  newGreen += extraRed + extraBlue;
  newBlue += extraRed + extraGreen;

  return [Math.min(newRed, 255), Math.min(newGreen, 255), Math.min(newBlue, 255)];
}

/**
 * Apply 3x3 convolution kernel to image data (CPU-based).
 */
function convolute2D(
  input: ImageData,
  matrix: number[][],
  output: ImageData,
  xPos: number,
  yPos: number,
  width: number,
  height: number
): ImageData {
  const h = matrix.length;
  const d = Math.floor(h / 2);
  const bounds = boundCoordinates(xPos, yPos, width, height, input.width, input.height);
  const inData = input.data;
  const outData = output.data;

  for (let row = bounds.top; row < bounds.top + bounds.height; row++) {
    let outIdx = 4 * (row * bounds.width + bounds.left);

    for (let col = bounds.left; col < bounds.left + bounds.width; col++) {
      const sum = [0, 0, 0];

      for (let ky = 0; ky < h; ky++) {
        const sourceRow = (row - d + ky) * bounds.width;

        for (let kx = 0; kx < h; kx++) {
          const sourceCol = col - d + kx;
          const inIdx = 4 * (sourceRow + sourceCol);
          const pixel = inData[inIdx];

          if (!isNaN(pixel)) {
            const weight = matrix[ky][kx];
            sum[0] += pixel * weight;
            sum[1] += inData[inIdx + 1] * weight;
            sum[2] += inData[inIdx + 2] * weight;
          }
        }
      }

      outData[outIdx] = sum[0];
      outData[outIdx + 1] = sum[1];
      outData[outIdx + 2] = sum[2];
      outData[outIdx + 3] = 255;
      outIdx += 4;
    }
  }

  return output;
}

/**
 * Calculate bounded coordinates for convolution.
 */
function boundCoordinates(
  x: number,
  y: number,
  w: number,
  h: number,
  imgW: number,
  imgH: number
): { left: number; top: number; width: number; height: number } {
  const wrapCoord = (t: number, e: number): number => {
    const sign = e >= 0 ? 1 : -1;
    return t - e * (sign * Math.floor(t / Math.abs(e)));
  };

  const left = wrapCoord(x || 0, imgW);
  const top = wrapCoord(y || 0, imgH);
  const height = Math.min(imgH - top, h || imgH);
  const width = Math.min(imgW - left, w || imgW);

  return { left, top, height, width };
}

// =============================================================================
// Export all effects
// =============================================================================

export default {
  // WebGL effects
  myWebGLBuddy,
  isWebGL2EffectsAvailable,
  alphaErode,
  emboss,
  fuzz,
  normalMap,
  colorScale,

  // Canvas 2D effects
  emboss2D,
  invert,
  blackToAlpha,
  whiteToAlpha,
  colorBurn,
  colorScale2D,
  tile,

  // Constants
  EMBOSS_MATRIX_STANDARD,
  EMBOSS_MATRIX_INVERTED,
};
