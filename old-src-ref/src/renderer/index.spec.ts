import { describe, it, expect, vi } from "vitest";

/**
 * Renderer Module Tests
 *
 * Note: The renderer module has complex dependencies on browser Canvas APIs
 * and extends CanvasRenderingContext2D.prototype at module load time.
 * Full testing of the real implementation requires a browser environment.
 * These tests work with the globally mocked renderer from vitest.setup.ts.
 *
 * The renderer module provides:
 * - draw(): Renders pimcos to a canvas
 * - preloadImages(): Preloads images for rendering
 * - drawSubstitution(): Draws text/mask substitutions
 */

// Import the mocked renderer (from vitest.setup.ts)
import renderer from "@/renderer";

describe("renderer (mocked)", () => {
  describe("module structure", () => {
    it("should export createContext method", () => {
      expect(typeof renderer.createContext).toBe("function");
    });

    it("should export render method", () => {
      expect(typeof renderer.render).toBe("function");
    });

    it("should export registerWorker method", () => {
      expect(typeof renderer.registerWorker).toBe("function");
    });
  });

  describe("createContext", () => {
    it("should return a context object with render and setView methods", () => {
      const context = renderer.createContext();

      expect(context).toBeDefined();
      expect(typeof context.render).toBe("function");
      expect(typeof context.setView).toBe("function");
    });
  });

  describe("render", () => {
    it("should be callable", () => {
      expect(() => renderer.render()).not.toThrow();
    });
  });

  describe("registerWorker", () => {
    it("should be callable", () => {
      expect(() => renderer.registerWorker()).not.toThrow();
    });
  });
});
