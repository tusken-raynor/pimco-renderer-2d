/**
 * Image Loading Unit Tests
 *
 * Tests the image loading and caching logic used by the renderer.
 * The renderer uses an in-memory cache to prevent redundant image loads.
 *
 * Key behaviors tested:
 * - Image caching (same URL returns cached result)
 * - Error handling (failed loads resolve to null)
 * - Concurrent request deduplication
 * - Batch loading of pimco images
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ProductImageComponent } from "@/types";

// ============================================================================
// Re-implementation of renderer image loading for testing
// These match the implementations in src/renderer/index.ts
// ============================================================================

// Simulated image cache (matches LOADED_IMAGES Map in renderer)
let LOADED_IMAGES: Map<string, Promise<MockHTMLImageElement | null>>;

// Mock Image class with controllable load behavior
class MockHTMLImageElement {
  src: string = "";
  width: number = 100;
  height: number = 100;
  private _onload: (() => void) | null = null;
  private _onerror: ((e: Error) => void) | null = null;

  addEventListener(event: string, handler: () => void) {
    if (event === "load") {
      this._onload = handler;
    } else if (event === "error") {
      this._onerror = handler as any;
    }
  }

  // Test helpers to trigger load/error
  triggerLoad() {
    if (this._onload) this._onload();
  }

  triggerError() {
    if (this._onerror) this._onerror(new Error("Load failed"));
  }
}

// Track created images for test control
let createdImages: MockHTMLImageElement[] = [];

function createImage(): MockHTMLImageElement {
  const img = new MockHTMLImageElement();
  createdImages.push(img);
  return img;
}

function loadImage(url: string): Promise<MockHTMLImageElement | null> {
  // See if we've already loaded this image
  if (LOADED_IMAGES.has(url)) {
    const element = LOADED_IMAGES.get(url);
    if (element !== undefined) {
      return element;
    } else {
      return Promise.resolve(null);
    }
  } else {
    // Not yet, go ahead and load it up
    const p = new Promise<MockHTMLImageElement | null>((resolve) => {
      const image = createImage();
      image.addEventListener("load", () => {
        resolve(image);
      });
      image.addEventListener("error", () => {
        resolve(null);
      });
      image.src = url;
    });
    LOADED_IMAGES.set(url, p);
    return p;
  }
}

function loadImages(
  pimcos: Array<Partial<ProductImageComponent>>
): Promise<Array<MockHTMLImageElement | null>> {
  const loaders: Array<Promise<MockHTMLImageElement | null>> = [];
  for (const pimco of pimcos) {
    if (pimco.image) {
      loaders.push(loadImage(pimco.image));
    }
    if (pimco.mode !== "color") {
      if (pimco.texture) {
        loaders.push(loadImage(pimco.texture));
      }
    }
    if (pimco.hlimage1) {
      loaders.push(loadImage(pimco.hlimage1));
    }
    if (pimco.hlimage2) {
      loaders.push(loadImage(pimco.hlimage2));
    }
    // Check if the mask is an object (substitution) - if so, don't load it as image
    if (pimco.mask && !(pimco.mask instanceof Object)) {
      loaders.push(loadImage(pimco.mask as string));
    }
  }
  return Promise.all(loaders);
}

// ============================================================================
// Tests
// ============================================================================

describe("image loading", () => {
  beforeEach(() => {
    LOADED_IMAGES = new Map();
    createdImages = [];
  });

  describe("loadImage", () => {
    it("should return cached image on subsequent calls", async () => {
      const url = "https://example.com/image1.png";

      // First call
      const promise1 = loadImage(url);
      createdImages[0].triggerLoad();
      const img1 = await promise1;

      // Second call - should return same promise (cached)
      const promise2 = loadImage(url);
      const img2 = await promise2;

      expect(img1).toBe(img2);
      expect(createdImages.length).toBe(1); // Only one image created
    });

    it("should resolve to null on load error", async () => {
      const url = "https://example.com/broken-image.png";

      const promise = loadImage(url);
      createdImages[0].triggerError();
      const result = await promise;

      expect(result).toBeNull();
    });

    it("should not duplicate requests for same URL", async () => {
      const url = "https://example.com/image2.png";

      // Make two concurrent requests for same URL
      const promise1 = loadImage(url);
      const promise2 = loadImage(url);

      // Should be the exact same promise
      expect(promise1).toBe(promise2);

      // Only one image should be created
      expect(createdImages.length).toBe(1);

      // Trigger load and verify both resolve
      createdImages[0].triggerLoad();

      const [img1, img2] = await Promise.all([promise1, promise2]);
      expect(img1).toBe(img2);
    });

    it("should handle concurrent requests for same image", async () => {
      const url = "https://example.com/concurrent.png";

      // Start multiple requests before any complete
      const promises = [
        loadImage(url),
        loadImage(url),
        loadImage(url),
        loadImage(url),
      ];

      // Only one image should be created
      expect(createdImages.length).toBe(1);

      // Trigger load
      createdImages[0].triggerLoad();

      // All should resolve to same image
      const results = await Promise.all(promises);
      expect(new Set(results).size).toBe(1);
    });

    it("should create separate entries for different URLs", async () => {
      const url1 = "https://example.com/image-a.png";
      const url2 = "https://example.com/image-b.png";

      const promise1 = loadImage(url1);
      const promise2 = loadImage(url2);

      expect(createdImages.length).toBe(2);

      createdImages[0].triggerLoad();
      createdImages[1].triggerLoad();

      const [img1, img2] = await Promise.all([promise1, promise2]);
      expect(img1).not.toBe(img2);
    });

    it("should cache even failed loads", async () => {
      const url = "https://example.com/failing.png";

      const promise1 = loadImage(url);
      createdImages[0].triggerError();
      const result1 = await promise1;

      // Second request should return cached (null) result
      const promise2 = loadImage(url);
      const result2 = await promise2;

      expect(result1).toBeNull();
      expect(result2).toBeNull();
      expect(createdImages.length).toBe(1); // Still only one attempt
    });
  });

  describe("loadImages", () => {
    it("should load main image for each pimco", async () => {
      const pimcos: Partial<ProductImageComponent>[] = [
        { image: "https://example.com/pimco1.png", mode: "color" },
        { image: "https://example.com/pimco2.png", mode: "color" },
      ];

      const promise = loadImages(pimcos);

      // Trigger all loads
      createdImages.forEach((img) => img.triggerLoad());

      const results = await promise;
      expect(results.length).toBe(2);
      expect(createdImages.length).toBe(2);
    });

    it("should load texture when mode is not color", async () => {
      const pimcos: Partial<ProductImageComponent>[] = [
        {
          image: "https://example.com/base.png",
          mode: "texture",
          texture: "https://example.com/texture.png",
        },
      ];

      const promise = loadImages(pimcos);

      createdImages.forEach((img) => img.triggerLoad());

      const results = await promise;
      expect(results.length).toBe(2); // base + texture
    });

    it("should NOT load texture when mode is color", async () => {
      const pimcos: Partial<ProductImageComponent>[] = [
        {
          image: "https://example.com/base.png",
          mode: "color",
          texture: "https://example.com/texture.png", // Should be ignored
        },
      ];

      const promise = loadImages(pimcos);

      createdImages.forEach((img) => img.triggerLoad());

      const results = await promise;
      expect(results.length).toBe(1); // Only base, no texture
    });

    it("should load hlimage1 and hlimage2 when present", async () => {
      const pimcos: Partial<ProductImageComponent>[] = [
        {
          image: "https://example.com/base.png",
          mode: "color",
          hlimage1: "https://example.com/highlight1.png",
          hlimage2: "https://example.com/highlight2.png",
        },
      ];

      const promise = loadImages(pimcos);

      createdImages.forEach((img) => img.triggerLoad());

      const results = await promise;
      expect(results.length).toBe(3); // base + 2 highlights
    });

    it("should load mask when it is a string (not substitution object)", async () => {
      const pimcos: Partial<ProductImageComponent>[] = [
        {
          image: "https://example.com/base.png",
          mode: "color",
          mask: "https://example.com/mask.png",
        },
      ];

      const promise = loadImages(pimcos);

      createdImages.forEach((img) => img.triggerLoad());

      const results = await promise;
      expect(results.length).toBe(2); // base + mask
    });

    it("should NOT load mask when it is a substitution object", async () => {
      const pimcos: Partial<ProductImageComponent>[] = [
        {
          image: "https://example.com/base.png",
          mode: "color",
          mask: { type: "substitution", text: "TEST" } as any, // Object, not string
        },
      ];

      const promise = loadImages(pimcos);

      createdImages.forEach((img) => img.triggerLoad());

      const results = await promise;
      expect(results.length).toBe(1); // Only base, mask is an object
    });

    it("should return array of all loaded images", async () => {
      const pimcos: Partial<ProductImageComponent>[] = [
        {
          image: "https://example.com/img1.png",
          mode: "texture",
          texture: "https://example.com/tex1.png",
          hlimage1: "https://example.com/hl1.png",
        },
        {
          image: "https://example.com/img2.png",
          mode: "color",
          mask: "https://example.com/mask2.png",
        },
      ];

      const promise = loadImages(pimcos);

      createdImages.forEach((img) => img.triggerLoad());

      const results = await promise;
      // Pimco1: image + texture + hlimage1 = 3
      // Pimco2: image + mask = 2
      expect(results.length).toBe(5);
      results.forEach((r) => expect(r).not.toBeNull());
    });

    it("should handle empty pimco array", async () => {
      const pimcos: Partial<ProductImageComponent>[] = [];

      const results = await loadImages(pimcos);

      expect(results.length).toBe(0);
      expect(createdImages.length).toBe(0);
    });

    it("should deduplicate same URLs across pimcos", async () => {
      const sharedUrl = "https://example.com/shared.png";
      const pimcos: Partial<ProductImageComponent>[] = [
        { image: sharedUrl, mode: "color" },
        { image: sharedUrl, mode: "color" }, // Same URL
      ];

      const promise = loadImages(pimcos);

      // Only one image should be created due to caching
      expect(createdImages.length).toBe(1);

      createdImages[0].triggerLoad();

      const results = await promise;
      expect(results.length).toBe(2);
      expect(results[0]).toBe(results[1]); // Same cached image
    });
  });
});
