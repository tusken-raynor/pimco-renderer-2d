/**
 * Canvas Worker Pool Unit Tests
 *
 * Tests the borrowing/releasing/queuing logic of the canvas worker pool.
 * This module manages a pool of OffscreenCanvas contexts for concurrent rendering.
 *
 * Key behaviors tested:
 * - Worker acquisition (async and sync)
 * - Queue management when pool is exhausted
 * - Automatic timeout release
 * - Context reset on release
 * - Worker disabling after release
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Use vi.hoisted to set up mocks before any module imports
const { MockOffscreenCanvas, createMockContext } = vi.hoisted(() => {
  // Create a comprehensive mock context that includes all methods used by resetCanvasContext
  const createMockContext = () => ({
    // Transform methods
    setTransform: vi.fn(),
    resetTransform: vi.fn(),
    transform: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    rotate: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),

    // Drawing methods
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    drawImage: vi.fn(),

    // Path methods
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),

    // Line style properties/methods
    lineWidth: 1,
    lineJoin: "miter" as const,
    lineCap: "butt" as const,
    setLineDash: vi.fn(),

    // Fill/stroke styles
    fillStyle: "#000000",
    strokeStyle: "#000000",

    // Compositing
    globalAlpha: 1,
    globalCompositeOperation: "source-over",

    // Text properties
    font: "10px sans-serif",
    textAlign: "start" as const,
    textBaseline: "alphabetic" as const,
    direction: "ltr" as const,
    letterSpacing: "0px",

    // Shadow properties
    shadowColor: "rgba(0, 0, 0, 0)",
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,

    // Image smoothing
    imageSmoothingEnabled: true,

    // Filter
    filter: "none",

    // Canvas reference (will be set later)
    canvas: null as any,
  });

  // Mock OffscreenCanvas
  class MockOffscreenCanvas {
    width: number;
    height: number;
    private _context: ReturnType<typeof createMockContext>;

    constructor(width: number, height: number) {
      this.width = width;
      this.height = height;
      this._context = createMockContext();
      this._context.canvas = this;
    }

    getContext(_type: string, _options?: any) {
      return this._context;
    }

    transferToImageBitmap() {
      return {} as ImageBitmap;
    }
  }

  // Install the mock globally
  (globalThis as any).OffscreenCanvas = MockOffscreenCanvas;

  return { MockOffscreenCanvas, createMockContext };
});

// Mock params before importing canvas-workers
vi.mock("@/params", () => ({
  default: {
    getBool: vi.fn(() => false),
  },
}));

// Mock utils
vi.mock("@/utils", () => ({
  default: {},
}));

// Dynamic import to allow module reset between tests
let canvasWorkers: typeof import("./canvas-workers").default;

describe("canvas-workers", () => {
  beforeEach(async () => {
    // Reset modules to get a fresh canvas-workers instance with full pool
    vi.resetModules();

    // Re-apply OffscreenCanvas mock (it gets cleared with resetModules)
    (globalThis as any).OffscreenCanvas = MockOffscreenCanvas;

    // Re-import to get a fresh module
    const module = await import("./canvas-workers");
    canvasWorkers = module.default;

    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("pool initialization", () => {
    it("should initialize with 6 workers available", () => {
      expect(canvasWorkers.countAvailable()).toBe(6);
    });

    it("should report hasAvailable as true when pool is full", () => {
      expect(canvasWorkers.hasAvailable()).toBe(true);
    });
  });

  describe("request (async)", () => {
    it("should return a worker when pool has available", async () => {
      const worker = await canvasWorkers.request();

      expect(worker).toBeDefined();
      expect(worker.canvas).toBeDefined();
      expect(worker.context).toBeDefined();
      expect(typeof worker.release).toBe("function");

      // Clean up
      worker.release();
    });

    it("should set worker dimensions when width/height provided", async () => {
      const worker = await canvasWorkers.request(200, 150);

      expect(worker.width).toBe(200);
      expect(worker.height).toBe(150);

      worker.release();
    });

    it("should reduce available count when worker is borrowed", async () => {
      const initialCount = canvasWorkers.countAvailable();

      const worker = await canvasWorkers.request();

      expect(canvasWorkers.countAvailable()).toBe(initialCount - 1);

      worker.release();
    });

    it("should queue request when pool is exhausted", async () => {
      // Borrow all 6 workers
      const workers: Awaited<ReturnType<typeof canvasWorkers.request>>[] = [];
      for (let i = 0; i < 6; i++) {
        workers.push(await canvasWorkers.request());
      }

      expect(canvasWorkers.countAvailable()).toBe(0);
      expect(canvasWorkers.hasAvailable()).toBe(false);

      // Request another worker - should be queued
      let resolved = false;
      const queuedPromise = canvasWorkers.request().then((w) => {
        resolved = true;
        return w;
      });

      // Should not be resolved yet (queue is waiting)
      await vi.advanceTimersByTimeAsync(50);
      expect(resolved).toBe(false);

      // Release one worker - should fulfill queued request
      workers[0].release();
      await Promise.resolve(); // Let promise chain resolve

      expect(resolved).toBe(true);

      const queuedWorker = await queuedPromise;
      queuedWorker.release();

      // Clean up remaining workers
      for (let i = 1; i < workers.length; i++) {
        workers[i].release();
      }
    });

    it("should create new worker if queue times out (MAX_WAIT_TIME=100ms)", async () => {
      // Borrow all 6 workers
      const workers: Awaited<ReturnType<typeof canvasWorkers.request>>[] = [];
      for (let i = 0; i < 6; i++) {
        workers.push(await canvasWorkers.request());
      }

      expect(canvasWorkers.countAvailable()).toBe(0);

      // Request another worker - should be queued
      const queuedPromise = canvasWorkers.request();

      // Advance past MAX_WAIT_TIME (100ms) to trigger new worker creation
      await vi.advanceTimersByTimeAsync(150);

      const newWorker = await queuedPromise;
      expect(newWorker).toBeDefined();

      newWorker.release();

      // Clean up
      for (const worker of workers) {
        worker.release();
      }
    });
  });

  describe("requestSync", () => {
    it("should return worker immediately when available", () => {
      const worker = canvasWorkers.requestSync();

      expect(worker).not.toBeNull();
      expect(worker!.canvas).toBeDefined();

      worker!.release();
    });

    it("should return null when no workers available", async () => {
      // Borrow all workers asynchronously first (sync won't work if pool is empty)
      const workers: Awaited<ReturnType<typeof canvasWorkers.request>>[] = [];
      for (let i = 0; i < 6; i++) {
        workers.push(await canvasWorkers.request());
      }

      // Try to get another synchronously
      const result = canvasWorkers.requestSync();
      expect(result).toBeNull();

      // Clean up
      for (const worker of workers) {
        worker.release();
      }
    });

    it("should set dimensions when provided", () => {
      const worker = canvasWorkers.requestSync(300, 250);

      expect(worker).not.toBeNull();
      expect(worker!.width).toBe(300);
      expect(worker!.height).toBe(250);

      worker!.release();
    });
  });

  describe("release", () => {
    it("should make worker available again after release", async () => {
      const worker = await canvasWorkers.request();

      const countBeforeRelease = canvasWorkers.countAvailable();
      worker.release();

      expect(canvasWorkers.countAvailable()).toBe(countBeforeRelease + 1);
    });

    it("should fulfill queued requests when worker released", async () => {
      // Borrow all 6 workers
      const workers: Awaited<ReturnType<typeof canvasWorkers.request>>[] = [];
      for (let i = 0; i < 6; i++) {
        workers.push(await canvasWorkers.request());
      }

      // Queue two more requests
      let resolved1 = false;
      let resolved2 = false;

      const queued1 = canvasWorkers.request().then((w) => {
        resolved1 = true;
        return w;
      });
      const queued2 = canvasWorkers.request().then((w) => {
        resolved2 = true;
        return w;
      });

      // Release first worker - should fulfill first queued request
      workers[0].release();
      await Promise.resolve(); // Let promise chain resolve
      expect(resolved1).toBe(true);

      // Release second worker - should fulfill second queued request
      workers[1].release();
      await Promise.resolve();
      expect(resolved2).toBe(true);

      // Clean up
      (await queued1).release();
      (await queued2).release();
      for (let i = 2; i < workers.length; i++) {
        workers[i].release();
      }
    });

    it("should throw if worker used after release", async () => {
      const worker = await canvasWorkers.request();

      worker.release();

      // Accessing properties should throw
      expect(() => worker.canvas).toThrow("This worker has been released");
      expect(() => worker.context).toThrow("This worker has been released");
      expect(() => worker.width).toThrow("This worker has been released");
      expect(() => worker.height).toThrow("This worker has been released");
      expect(() => worker.cvs).toThrow("This worker has been released");
      expect(() => worker.ctx).toThrow("This worker has been released");

      // Methods should throw
      expect(() => worker.release()).toThrow("This worker has been released");
      expect(() => worker.cloneCanvas()).toThrow("This worker has been released");
      expect(() => worker.toHTMLCanvasElement()).toThrow("This worker has been released");
      expect(() => worker.extendBorrowTime(1000)).toThrow("This worker has been released");
    });
  });

  describe("borrow timeout", () => {
    it("should auto-release after DFLT_BORROW_TIME (10000ms)", async () => {
      const worker = await canvasWorkers.request();

      const countAfterBorrow = canvasWorkers.countAvailable();

      // Advance time past default borrow time (10 seconds)
      await vi.advanceTimersByTimeAsync(10001);

      // Worker should have been auto-released
      expect(canvasWorkers.countAvailable()).toBe(countAfterBorrow + 1);

      // Worker should be disabled
      expect(() => worker.canvas).toThrow("This worker has been released");
    });

    it("should use custom borrow time when provided", async () => {
      const customBorrowTime = 5000;
      const worker = await canvasWorkers.request(undefined, undefined, customBorrowTime);

      const countAfterBorrow = canvasWorkers.countAvailable();

      // Advance time past custom borrow time but not default
      await vi.advanceTimersByTimeAsync(5001);

      // Worker should have been auto-released
      expect(canvasWorkers.countAvailable()).toBe(countAfterBorrow + 1);
    });

    it("should extend timeout with extendBorrowTime(number)", async () => {
      const worker = await canvasWorkers.request(undefined, undefined, 3000);

      const countAfterBorrow = canvasWorkers.countAvailable();

      // Advance 2 seconds
      await vi.advanceTimersByTimeAsync(2000);

      // Worker should still be borrowed
      expect(canvasWorkers.countAvailable()).toBe(countAfterBorrow);

      // Extend by 5 more seconds
      worker.extendBorrowTime(5000);

      // Advance original 3 seconds (would have expired without extension)
      await vi.advanceTimersByTimeAsync(2000);

      // Worker should still be borrowed due to extension
      expect(canvasWorkers.countAvailable()).toBe(countAfterBorrow);

      // Advance past extension
      await vi.advanceTimersByTimeAsync(4000);

      // Now should be released
      expect(canvasWorkers.countAvailable()).toBe(countAfterBorrow + 1);
    });

    it("should extend timeout with extendBorrowTime(Promise)", async () => {
      const worker = await canvasWorkers.request(undefined, undefined, 3000);

      const countAfterBorrow = canvasWorkers.countAvailable();

      // Create a promise that we control
      let resolvePromise: () => void;
      const controlledPromise = new Promise<void>((resolve) => {
        resolvePromise = resolve;
      });

      // Extend with promise
      worker.extendBorrowTime(controlledPromise);

      // Advance past original borrow time
      await vi.advanceTimersByTimeAsync(4000);

      // Worker should still be borrowed (waiting for promise)
      expect(canvasWorkers.countAvailable()).toBe(countAfterBorrow);

      // Resolve the promise
      resolvePromise!();
      await Promise.resolve(); // Let promise chain resolve

      // Now the original timer should be restored
      // Advance past restored borrow time
      await vi.advanceTimersByTimeAsync(4000);

      // Should be released
      expect(canvasWorkers.countAvailable()).toBe(countAfterBorrow + 1);
    });

    it("should clear borrow timeout when manually released", async () => {
      const worker = await canvasWorkers.request();

      const countAfterBorrow = canvasWorkers.countAvailable();

      // Release immediately
      worker.release();

      expect(canvasWorkers.countAvailable()).toBe(countAfterBorrow + 1);

      // Advance past default borrow time
      await vi.advanceTimersByTimeAsync(11000);

      // Count should remain the same (no double-release)
      expect(canvasWorkers.countAvailable()).toBe(countAfterBorrow + 1);
    });
  });

  describe("setMode", () => {
    it("should accept 'reuse' mode", () => {
      expect(() => canvasWorkers.setMode("reuse")).not.toThrow();
    });

    it("should accept 'no-reuse' mode", () => {
      expect(() => canvasWorkers.setMode("no-reuse")).not.toThrow();
    });
  });

  describe("worker properties", () => {
    it("should provide canvas and context aliases (cvs, ctx)", async () => {
      const worker = await canvasWorkers.request();

      expect(worker.cvs).toBe(worker.canvas);
      expect(worker.ctx).toBe(worker.context);

      worker.release();
    });

    it("should provide cloneCanvas method", async () => {
      const worker = await canvasWorkers.request(100, 100);

      const clone = worker.cloneCanvas();

      expect(clone).toBeDefined();
      expect(clone.width).toBe(100);
      expect(clone.height).toBe(100);

      worker.release();
    });

    it("should provide toHTMLCanvasElement method", async () => {
      const worker = await canvasWorkers.request(100, 100);

      const htmlCanvas = worker.toHTMLCanvasElement();

      expect(htmlCanvas).toBeDefined();
      expect(htmlCanvas).toBeInstanceOf(HTMLCanvasElement);

      worker.release();
    });

    it("should track source ID for internal pool management", async () => {
      const worker = await canvasWorkers.request();

      expect(typeof worker.source).toBe("number");
      expect(worker.source).toBeGreaterThanOrEqual(0);

      worker.release();
    });
  });

  describe("addWorker", () => {
    it("should add a new worker to the pool", () => {
      const countBefore = canvasWorkers.countAvailable();
      canvasWorkers.addWorker();
      expect(canvasWorkers.countAvailable()).toBe(countBefore + 1);
    });
  });
});
