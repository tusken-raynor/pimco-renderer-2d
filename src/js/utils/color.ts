/**
 * Color manipulation utilities for the 2D renderer.
 * Provides parsing, conversion, and manipulation functions for color values.
 */

/**
 * RGBA color representation as a tuple [R, G, B, A].
 * Values range from 0-255 for RGB and 0-1 for Alpha.
 */
export type RGBAColor = [number, number, number, number];

/**
 * RGB color representation as a tuple [R, G, B].
 * Values range from 0-255.
 */
export type RGBColor = [number, number, number];

/**
 * Parse a hex color string to RGB values.
 * Supports both 3-digit (#RGB) and 6-digit (#RRGGBB) hex formats.
 *
 * @param hex - Hex color string (with or without leading #)
 * @returns RGB tuple [R, G, B] with values 0-255, or null if invalid
 */
export function parseHexColor(hex: string): RGBColor | null {
  // Remove leading # if present
  const cleanHex = hex.startsWith('#') ? hex.slice(1) : hex;

  // Validate hex string
  if (!/^[0-9A-Fa-f]{3}$|^[0-9A-Fa-f]{6}$/.test(cleanHex)) {
    return null;
  }

  let r: number, g: number, b: number;

  if (cleanHex.length === 3) {
    // 3-digit hex: #RGB -> #RRGGBB
    r = parseInt(cleanHex[0] + cleanHex[0], 16);
    g = parseInt(cleanHex[1] + cleanHex[1], 16);
    b = parseInt(cleanHex[2] + cleanHex[2], 16);
  } else {
    // 6-digit hex: #RRGGBB
    r = parseInt(cleanHex.slice(0, 2), 16);
    g = parseInt(cleanHex.slice(2, 4), 16);
    b = parseInt(cleanHex.slice(4, 6), 16);
  }

  return [r, g, b];
}

/**
 * Parse a hex color string to RGBA values.
 * Supports 3-digit (#RGB), 6-digit (#RRGGBB), 4-digit (#RGBA), and 8-digit (#RRGGBBAA) formats.
 *
 * @param hex - Hex color string (with or without leading #)
 * @returns RGBA tuple [R, G, B, A] with RGB 0-255 and A 0-1, or null if invalid
 */
export function parseHexColorWithAlpha(hex: string): RGBAColor | null {
  // Remove leading # if present
  const cleanHex = hex.startsWith('#') ? hex.slice(1) : hex;

  // Validate hex string
  if (!/^[0-9A-Fa-f]{3,4}$|^[0-9A-Fa-f]{6}$|^[0-9A-Fa-f]{8}$/.test(cleanHex)) {
    return null;
  }

  let r: number, g: number, b: number, a: number;

  if (cleanHex.length === 3) {
    // 3-digit hex: #RGB
    r = parseInt(cleanHex[0] + cleanHex[0], 16);
    g = parseInt(cleanHex[1] + cleanHex[1], 16);
    b = parseInt(cleanHex[2] + cleanHex[2], 16);
    a = 1;
  } else if (cleanHex.length === 4) {
    // 4-digit hex: #RGBA
    r = parseInt(cleanHex[0] + cleanHex[0], 16);
    g = parseInt(cleanHex[1] + cleanHex[1], 16);
    b = parseInt(cleanHex[2] + cleanHex[2], 16);
    a = parseInt(cleanHex[3] + cleanHex[3], 16) / 255;
  } else if (cleanHex.length === 6) {
    // 6-digit hex: #RRGGBB
    r = parseInt(cleanHex.slice(0, 2), 16);
    g = parseInt(cleanHex.slice(2, 4), 16);
    b = parseInt(cleanHex.slice(4, 6), 16);
    a = 1;
  } else {
    // 8-digit hex: #RRGGBBAA
    r = parseInt(cleanHex.slice(0, 2), 16);
    g = parseInt(cleanHex.slice(2, 4), 16);
    b = parseInt(cleanHex.slice(4, 6), 16);
    a = parseInt(cleanHex.slice(6, 8), 16) / 255;
  }

  return [r, g, b, a];
}

/**
 * Convert RGB values to a hex color string.
 *
 * @param r - Red component (0-255)
 * @param g - Green component (0-255)
 * @param b - Blue component (0-255)
 * @returns Hex color string in #RRGGBB format
 */
export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const toHex = (v: number) => clamp(v).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Convert RGBA values to a hex color string with alpha.
 *
 * @param r - Red component (0-255)
 * @param g - Green component (0-255)
 * @param b - Blue component (0-255)
 * @param a - Alpha component (0-1)
 * @returns Hex color string in #RRGGBBAA format
 */
export function rgbaToHex(r: number, g: number, b: number, a: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const toHex = (v: number) => clamp(v).toString(16).padStart(2, '0');
  const alphaHex = Math.round(Math.max(0, Math.min(1, a)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}${alphaHex}`;
}

/**
 * Calculate the relative luminance of a color (per WCAG 2.0).
 * This is useful for determining if text should be light or dark on a background.
 *
 * @param r - Red component (0-255)
 * @param g - Green component (0-255)
 * @param b - Blue component (0-255)
 * @returns Relative luminance value (0-1)
 */
export function relativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r / 255, g / 255, b / 255].map((c) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  );
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Calculate the perceived brightness of a color.
 * Uses the HSP color model which is more perceptually accurate than simple averaging.
 *
 * @param r - Red component (0-255)
 * @param g - Green component (0-255)
 * @param b - Blue component (0-255)
 * @returns Brightness value (0-255)
 */
export function brightness(r: number, g: number, b: number): number {
  // HSP color model: sqrt(0.299*R^2 + 0.587*G^2 + 0.114*B^2)
  return Math.sqrt(0.299 * r * r + 0.587 * g * g + 0.114 * b * b);
}

/**
 * Determine if a color is considered "dark" (useful for choosing text colors).
 *
 * @param r - Red component (0-255)
 * @param g - Green component (0-255)
 * @param b - Blue component (0-255)
 * @param threshold - Brightness threshold (default: 127.5)
 * @returns true if the color is dark, false otherwise
 */
export function isDarkColor(
  r: number,
  g: number,
  b: number,
  threshold = 127.5
): boolean {
  return brightness(r, g, b) < threshold;
}

/**
 * Multiply a color by another color (per-channel multiplication).
 * Used for color tinting and blending operations.
 *
 * @param base - Base color [R, G, B] with values 0-255
 * @param multiply - Multiply color [R, G, B] with values 0-255
 * @returns Result color [R, G, B] with values 0-255
 */
export function multiplyColor(base: RGBColor, multiply: RGBColor): RGBColor {
  return [
    Math.round((base[0] * multiply[0]) / 255),
    Math.round((base[1] * multiply[1]) / 255),
    Math.round((base[2] * multiply[2]) / 255),
  ];
}

/**
 * Apply highlight saturation to a color.
 * This is used for creating highlight effects in the renderer.
 * Based on the legacy highlightSaturate function.
 *
 * @param colorArray - Input color [R, G, B] with values 0-255
 * @param multiplyColor - Color to multiply with [R, G, B] with values 0-255
 * @returns Result color [R, G, B] with values 0-255
 */
export function highlightSaturate(
  colorArray: RGBColor,
  multiplyColorArray: RGBColor
): RGBColor {
  // Double the color values
  let newRed = colorArray[0] << 1;
  let newGreen = colorArray[1] << 1;
  let newBlue = colorArray[2] << 1;

  // Calculate extra color that exceeds 255, halved for distribution
  const extraRed = Math.max(0, newRed - 255) >> 1;
  const extraGreen = Math.max(0, newGreen - 255) >> 1;
  const extraBlue = Math.max(0, newBlue - 255) >> 1;

  // Apply multiply and clamp to 255
  newRed = (Math.min(255, newRed) * multiplyColorArray[0]) >> 8;
  newGreen = (Math.min(255, newGreen) * multiplyColorArray[1]) >> 8;
  newBlue = (Math.min(255, newBlue) * multiplyColorArray[2]) >> 8;

  // Distribute extra color to other channels
  newRed += extraGreen + extraBlue;
  newGreen += extraRed + extraBlue;
  newBlue += extraRed + extraGreen;

  return [Math.min(newRed, 255), Math.min(newGreen, 255), Math.min(newBlue, 255)];
}

/**
 * Blend two colors using alpha blending.
 *
 * @param fg - Foreground color [R, G, B, A]
 * @param bg - Background color [R, G, B, A]
 * @returns Blended color [R, G, B, A]
 */
export function alphaBlend(fg: RGBAColor, bg: RGBAColor): RGBAColor {
  const fgAlpha = fg[3];
  const bgAlpha = bg[3];
  const outAlpha = fgAlpha + bgAlpha * (1 - fgAlpha);

  if (outAlpha === 0) {
    return [0, 0, 0, 0];
  }

  return [
    Math.round((fg[0] * fgAlpha + bg[0] * bgAlpha * (1 - fgAlpha)) / outAlpha),
    Math.round((fg[1] * fgAlpha + bg[1] * bgAlpha * (1 - fgAlpha)) / outAlpha),
    Math.round((fg[2] * fgAlpha + bg[2] * bgAlpha * (1 - fgAlpha)) / outAlpha),
    outAlpha,
  ];
}

/**
 * Interpolate between two colors (linear interpolation).
 *
 * @param color1 - First color [R, G, B]
 * @param color2 - Second color [R, G, B]
 * @param t - Interpolation factor (0-1, where 0 = color1, 1 = color2)
 * @returns Interpolated color [R, G, B]
 */
export function lerpColor(color1: RGBColor, color2: RGBColor, t: number): RGBColor {
  const clampedT = Math.max(0, Math.min(1, t));
  return [
    Math.round(color1[0] + (color2[0] - color1[0]) * clampedT),
    Math.round(color1[1] + (color2[1] - color1[1]) * clampedT),
    Math.round(color1[2] + (color2[2] - color1[2]) * clampedT),
  ];
}

/**
 * Clamp a color component to valid range.
 *
 * @param value - Color component value
 * @param min - Minimum value (default: 0)
 * @param max - Maximum value (default: 255)
 * @returns Clamped value
 */
export function clampColorValue(value: number, min = 0, max = 255): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}
