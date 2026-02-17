/**
 * Test Image Fixtures
 *
 * Base64-encoded images for deterministic canvas rendering tests.
 * These small images allow tests to verify canvas operations without
 * relying on external image loading.
 */

// 10x10 solid red square (PNG)
export const RED_SQUARE_10X10 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8DwHwMRgHFUIX0JAAvUT/0HhYdFAAAAAElFTkSuQmCC";

// 10x10 solid blue square (PNG)
export const BLUE_SQUARE_10X10 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNkYPj/n4GIgHFUIX0JAG3CD/0SWbGKAAAAAElFTkSuQmCC";

// 10x10 solid white square (for masks)
export const WHITE_SQUARE_10X10 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8////fwY0wDiqkL4EANpkFP8Oiyk3AAAAAElFTkSuQmCC";

// 10x10 solid black square
export const BLACK_SQUARE_10X10 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNgGAWjYBSMglEwCkYBBQEABPoAAavIaasAAAAASUVORK5CYII=";

// 10x10 semi-transparent overlay (50% gray)
export const GRAY_OVERLAY_10X10 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAGElEQVR42mNgGAWjYBSMglEwCkbBSAcACvYAAQHFcfYAAAAASUVORK5CYII=";

// 1x1 transparent pixel
export const TRANSPARENT_PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

// Export all test images as a single object for convenience
export const TEST_IMAGES = {
  redSquare: RED_SQUARE_10X10,
  blueSquare: BLUE_SQUARE_10X10,
  whiteMask: WHITE_SQUARE_10X10,
  blackSquare: BLACK_SQUARE_10X10,
  grayOverlay: GRAY_OVERLAY_10X10,
  transparentPixel: TRANSPARENT_PIXEL,
};

/**
 * Factory function to create a test pimco (Product Image Component)
 * with sensible defaults that can be overridden.
 */
export interface TestPimco {
  image: string;
  mask?: string;
  color?: string;
  mode?: "color" | "texture" | "image";
  blend?: "multiply" | "screen" | "overlay" | "soft-light" | "source-over";
  alpha?: number;
  highlight1?: string;
  highlight2?: string;
}

export const createTestPimco = (overrides: Partial<TestPimco> = {}): TestPimco => ({
  image: RED_SQUARE_10X10,
  mask: WHITE_SQUARE_10X10,
  color: "#FF0000",
  mode: "color",
  blend: "multiply",
  alpha: 1.0,
  ...overrides,
});

/**
 * Create multiple test pimcos for testing layer composition
 */
export const createTestPimcoStack = (count: number = 3): TestPimco[] => {
  const colors = ["#FF0000", "#00FF00", "#0000FF", "#FFFF00", "#FF00FF"];
  const images = [
    RED_SQUARE_10X10,
    BLUE_SQUARE_10X10,
    RED_SQUARE_10X10,
    BLUE_SQUARE_10X10,
    RED_SQUARE_10X10,
  ];

  return Array.from({ length: count }, (_, i) => ({
    image: images[i % images.length],
    mask: WHITE_SQUARE_10X10,
    color: colors[i % colors.length],
    mode: "color" as const,
    blend: "multiply" as const,
    alpha: 1.0,
  }));
};

/**
 * Utility to load an image from a data URL and return it as an HTMLImageElement
 */
export const loadTestImage = (dataUrl: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${dataUrl.substring(0, 50)}...`));
    img.src = dataUrl;
  });
};

/**
 * Create a canvas with a test image drawn on it
 */
export const createCanvasWithImage = async (
  dataUrl: string,
  width: number = 10,
  height: number = 10
): Promise<HTMLCanvasElement> => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Failed to get 2D context");

  const img = await loadTestImage(dataUrl);
  ctx.drawImage(img, 0, 0, width, height);
  return canvas;
};
