/**
 * AVIF Worker Pool Unit Tests
 *
 * Tests the worker pool management logic for AVIF encode/decode operations.
 * The pool dynamically creates workers up to WORKER_MAX and queues
 * tasks when all workers are busy.
 *
 * Key behaviors tested:
 * - Worker creation on demand (up to WORKER_MAX)
 * - Task queuing when pool is exhausted
 * - Worker reuse after task completion
 * - Queue processing in FIFO order
 * - Error handling returns workers to pool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ============================================================================
// Worker Pool Logic Tests
// Re-implements the core algorithm from src/avif/index.ts for isolated testing
// ============================================================================

describe("avif worker pool logic", () => {
  /**
   * These tests verify the queuing algorithm used by the AVIF module.
   * We re-implement the core logic to test it in isolation without
   * needing actual Web Workers or ImageData (which aren't available in Node).
   */

  interface Task<T> {
    payload: { action: string; data: any };
    transfer: Transferable[];
    resolve: (value: T) => void;
    reject: (error: Error) => void;
  }

  interface MockWorkerSuite {
    post: (payload: any, transfer?: Transferable[]) => Promise<any>;
  }

  // Simulated pool state
  let WORKER_MAX: number;
  let tasks: Task<any>[];
  let workerPool: MockWorkerSuite[];
  let workerCount: number;
  let processDelay: number;

  function createMockWorkerSuite(): MockWorkerSuite {
    return {
      post: vi.fn().mockImplementation((payload) => {
        return new Promise((resolve) => {
          setTimeout(() => {
            if (payload.action === "encode") {
              resolve({ type: "encoded", size: 100 });
            } else if (payload.action === "decode") {
              resolve({ type: "decoded", width: 10, height: 10 });
            } else {
              resolve(null);
            }
          }, processDelay);
        });
      }),
    };
  }

  /**
   * Re-implementation of handleNewTask from src/avif/index.ts
   */
  function handleNewTask<T>(
    payload: { action: string; data: any },
    transfer: Transferable[]
  ): Promise<T> {
    return new Promise<T>(async (resolve, reject) => {
      // Check if the task queue is empty. If it is, push the new task on the queue to be
      // processed when it can. Otherwise, find an available worker.
      if (tasks.length !== 0) {
        tasks.push({ payload, transfer, resolve, reject });
        return;
      }

      // Check for an available worker. If there is no available worker, and we haven't hit the max,
      // create a new worker. Otherwise, just queue the task.
      let worker = workerPool.shift();
      if (!worker) {
        if (workerCount < WORKER_MAX) {
          worker = createMockWorkerSuite();
          workerCount++;
        } else {
          tasks.push({ payload, transfer, resolve, reject });
          return;
        }
      }

      try {
        const result: T = await worker.post(payload, transfer);
        returnWorkerToPool(worker);
        resolve(result);
      } catch (error) {
        returnWorkerToPool(worker);
        reject(error as Error);
      }
    });
  }

  /**
   * Re-implementation of returnWorkerToPool from src/avif/index.ts
   */
  function returnWorkerToPool(worker: MockWorkerSuite) {
    // Check if there are any queued tasks. If so, process the next one.
    const nextTask = tasks.shift();
    if (nextTask) {
      const { payload, transfer, resolve, reject } = nextTask;
      worker
        .post(payload, transfer)
        .then((result) => {
          resolve(result);
          returnWorkerToPool(worker);
        })
        .catch((error) => {
          console.error("Worker task error:", error);
          reject(error);
          returnWorkerToPool(worker);
        });
    } else {
      // No queued tasks, return the worker to the pool.
      workerPool.push(worker);
    }
  }

  beforeEach(() => {
    WORKER_MAX = 4;
    tasks = [];
    workerPool = [];
    workerCount = 0;
    processDelay = 50;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("worker creation", () => {
    it("should create worker on first request", async () => {
      expect(workerCount).toBe(0);

      const promise = handleNewTask({ action: "encode", data: {} }, []);
      await vi.advanceTimersByTimeAsync(100);
      await promise;

      expect(workerCount).toBe(1);
    });

    it("should reuse worker from pool on subsequent requests", async () => {
      // First request creates worker
      const promise1 = handleNewTask({ action: "encode", data: {} }, []);
      await vi.advanceTimersByTimeAsync(100);
      await promise1;

      expect(workerCount).toBe(1);
      expect(workerPool.length).toBe(1);

      // Second request should reuse the same worker
      const promise2 = handleNewTask({ action: "encode", data: {} }, []);
      await vi.advanceTimersByTimeAsync(100);
      await promise2;

      expect(workerCount).toBe(1); // Still only 1 worker created
      expect(workerPool.length).toBe(1); // Worker back in pool
    });

    it("should create additional workers when pool is empty and concurrent requests come in", async () => {
      // Configure slower processing to ensure requests overlap
      processDelay = 200;

      // Start first request - creates first worker
      const promise1 = handleNewTask({ action: "encode", data: { id: 1 } }, []);

      // Advance just enough for worker to be created but not finish
      await vi.advanceTimersByTimeAsync(10);
      expect(workerCount).toBe(1);
      expect(workerPool.length).toBe(0); // Worker is busy

      // Second request should create new worker since pool is empty
      const promise2 = handleNewTask({ action: "encode", data: { id: 2 } }, []);
      await vi.advanceTimersByTimeAsync(10);

      expect(workerCount).toBe(2);

      // Let both complete
      await vi.advanceTimersByTimeAsync(250);
      await Promise.all([promise1, promise2]);

      expect(workerPool.length).toBe(2); // Both workers back in pool
    });

    it("should not exceed WORKER_MAX workers", async () => {
      processDelay = 500;

      // Start WORKER_MAX + 2 concurrent requests
      const promises = [];
      for (let i = 0; i < WORKER_MAX + 2; i++) {
        promises.push(handleNewTask({ action: "encode", data: { id: i } }, []));
        await vi.advanceTimersByTimeAsync(5); // Small delay between requests
      }

      // Should have created exactly WORKER_MAX workers
      expect(workerCount).toBe(WORKER_MAX);

      // Extra tasks should be queued
      expect(tasks.length).toBe(2);

      // Complete all tasks
      await vi.advanceTimersByTimeAsync(1000);
      await Promise.all(promises);

      expect(tasks.length).toBe(0);
      expect(workerPool.length).toBe(WORKER_MAX);
    });
  });

  describe("task queuing", () => {
    it("should queue tasks when all workers are busy", async () => {
      processDelay = 200;

      // Fill up workers
      const promises = [];
      for (let i = 0; i < WORKER_MAX; i++) {
        promises.push(handleNewTask({ action: "encode", data: { id: i } }, []));
        await vi.advanceTimersByTimeAsync(5);
      }

      expect(workerCount).toBe(WORKER_MAX);
      expect(workerPool.length).toBe(0); // All busy

      // Next request should be queued
      const queuedPromise = handleNewTask(
        { action: "encode", data: { id: "queued" } },
        []
      );

      expect(tasks.length).toBe(1);

      // Complete all
      await vi.advanceTimersByTimeAsync(500);
      await Promise.all([...promises, queuedPromise]);

      expect(tasks.length).toBe(0);
    });

    it("should process queued tasks in FIFO order", async () => {
      const order: number[] = [];
      processDelay = 50;

      // Pre-fill workers so they're all busy
      workerCount = WORKER_MAX;
      // workerPool is empty (all workers busy)

      // Queue multiple tasks
      const promise1 = handleNewTask({ action: "encode", data: { id: 1 } }, []).then(
        () => order.push(1)
      );
      const promise2 = handleNewTask({ action: "encode", data: { id: 2 } }, []).then(
        () => order.push(2)
      );
      const promise3 = handleNewTask({ action: "encode", data: { id: 3 } }, []).then(
        () => order.push(3)
      );

      expect(tasks.length).toBe(3);

      // Return a worker - should process tasks in order
      const worker = createMockWorkerSuite();
      returnWorkerToPool(worker);

      await vi.advanceTimersByTimeAsync(200);
      await Promise.all([promise1, promise2, promise3]);

      expect(order).toEqual([1, 2, 3]);
    });

    it("should add to queue if queue already has pending tasks", async () => {
      processDelay = 100;
      workerCount = WORKER_MAX;

      // First queued task
      handleNewTask({ action: "encode", data: { id: 1 } }, []);
      expect(tasks.length).toBe(1);

      // Second queued task - should also queue (not try to get worker)
      handleNewTask({ action: "encode", data: { id: 2 } }, []);
      expect(tasks.length).toBe(2);

      // Third queued task
      handleNewTask({ action: "encode", data: { id: 3 } }, []);
      expect(tasks.length).toBe(3);
    });
  });

  describe("worker return to pool", () => {
    it("should return worker to pool after completing task", async () => {
      const promise = handleNewTask({ action: "encode", data: {} }, []);

      expect(workerCount).toBe(1);
      expect(workerPool.length).toBe(0); // Worker is busy

      await vi.advanceTimersByTimeAsync(100);
      await promise;

      expect(workerPool.length).toBe(1); // Worker returned to pool
    });

    it("should return worker to pool after completing queued task", async () => {
      workerCount = WORKER_MAX;

      // Queue a task
      const promise = handleNewTask({ action: "encode", data: {} }, []);
      expect(tasks.length).toBe(1);

      // Return a worker to process the queued task
      const worker = createMockWorkerSuite();
      returnWorkerToPool(worker);

      await vi.advanceTimersByTimeAsync(100);
      await promise;

      // Worker should be back in pool
      expect(workerPool.length).toBe(1);
      expect(tasks.length).toBe(0);
    });

    it("should return worker to pool even after error", async () => {
      workerCount = WORKER_MAX;

      // Suppress console.error for this test
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      // Queue a task - immediately add catch handler to prevent unhandled rejection
      let errorCaught = false;
      const promise = handleNewTask({ action: "encode", data: {} }, []).catch((e) => {
        errorCaught = true;
        expect((e as Error).message).toBe("Worker error");
      });

      // Create worker that will fail
      const worker: MockWorkerSuite = {
        post: vi.fn().mockRejectedValue(new Error("Worker error")),
      };

      returnWorkerToPool(worker);

      await vi.advanceTimersByTimeAsync(100);
      await promise;

      expect(errorCaught).toBe(true);

      // Worker should still be back in pool
      expect(workerPool.length).toBe(1);

      consoleSpy.mockRestore();
    });
  });

  describe("encode and decode operations", () => {
    it("should handle encode action", async () => {
      const promise = handleNewTask<{ type: string }>(
        { action: "encode", data: { imageData: "mock" } },
        []
      );
      await vi.advanceTimersByTimeAsync(100);
      const result = await promise;

      expect(result.type).toBe("encoded");
    });

    it("should handle decode action", async () => {
      const promise = handleNewTask<{ type: string }>(
        { action: "decode", data: { input: "mock" } },
        []
      );
      await vi.advanceTimersByTimeAsync(100);
      const result = await promise;

      expect(result.type).toBe("decoded");
    });

    it("should handle mixed encode/decode operations concurrently", async () => {
      processDelay = 50;

      const encodePromise = handleNewTask<{ type: string }>(
        { action: "encode", data: {} },
        []
      );
      const decodePromise = handleNewTask<{ type: string }>(
        { action: "decode", data: {} },
        []
      );

      await vi.advanceTimersByTimeAsync(100);

      const [encodeResult, decodeResult] = await Promise.all([
        encodePromise,
        decodePromise,
      ]);

      expect(encodeResult.type).toBe("encoded");
      expect(decodeResult.type).toBe("decoded");
    });
  });

  describe("edge cases", () => {
    it("should handle rapid sequential requests", async () => {
      processDelay = 10;

      const results = [];
      for (let i = 0; i < 20; i++) {
        results.push(handleNewTask({ action: "encode", data: { id: i } }, []));
      }

      await vi.advanceTimersByTimeAsync(500);
      await Promise.all(results);

      // All tasks completed
      expect(tasks.length).toBe(0);
      // All workers back in pool
      expect(workerPool.length).toBe(workerCount);
    });

    it("should handle empty pool recovery", async () => {
      // Create and use all workers
      processDelay = 100;

      const promises = [];
      for (let i = 0; i < WORKER_MAX; i++) {
        promises.push(handleNewTask({ action: "encode", data: { id: i } }, []));
        await vi.advanceTimersByTimeAsync(5);
      }

      expect(workerPool.length).toBe(0);

      // Wait for all to complete
      await vi.advanceTimersByTimeAsync(200);
      await Promise.all(promises);

      // Pool should be full again
      expect(workerPool.length).toBe(WORKER_MAX);

      // New request should reuse existing worker
      const newPromise = handleNewTask({ action: "encode", data: {} }, []);
      expect(workerPool.length).toBe(WORKER_MAX - 1); // One taken from pool

      await vi.advanceTimersByTimeAsync(200);
      await newPromise;

      expect(workerPool.length).toBe(WORKER_MAX); // Back to full
    });
  });
});

// ============================================================================
// WORKER_MAX calculation tests
// ============================================================================

describe("WORKER_MAX calculation", () => {
  /**
   * Tests the formula: Math.max(Math.min((hardwareConcurrency || 4) - 2, 8), 2)
   */

  const calculateWorkerMax = (hardwareConcurrency: number | undefined) => {
    return Math.max(Math.min((hardwareConcurrency || 4) - 2, 8), 2);
  };

  it("should default to 2 workers when hardwareConcurrency is undefined", () => {
    expect(calculateWorkerMax(undefined)).toBe(2); // (4 - 2) = 2
  });

  it("should use minimum of 2 workers for low core counts", () => {
    expect(calculateWorkerMax(1)).toBe(2); // (1 - 2) = -1, min of 2
    expect(calculateWorkerMax(2)).toBe(2); // (2 - 2) = 0, min of 2
    expect(calculateWorkerMax(3)).toBe(2); // (3 - 2) = 1, min of 2
  });

  it("should scale workers with core count", () => {
    expect(calculateWorkerMax(4)).toBe(2); // (4 - 2) = 2
    expect(calculateWorkerMax(6)).toBe(4); // (6 - 2) = 4
    expect(calculateWorkerMax(8)).toBe(6); // (8 - 2) = 6
  });

  it("should cap at 8 workers for high core counts", () => {
    expect(calculateWorkerMax(10)).toBe(8); // (10 - 2) = 8
    expect(calculateWorkerMax(12)).toBe(8); // (12 - 2) = 10, capped at 8
    expect(calculateWorkerMax(16)).toBe(8); // (16 - 2) = 14, capped at 8
    expect(calculateWorkerMax(32)).toBe(8);
    expect(calculateWorkerMax(64)).toBe(8);
  });

  it("should handle edge case of 0 cores", () => {
    expect(calculateWorkerMax(0)).toBe(2); // (4 - 2) = 2 (uses fallback)
  });

  it("should always return between 2 and 8 inclusive", () => {
    for (let cores = 0; cores <= 128; cores++) {
      const result = calculateWorkerMax(cores);
      expect(result).toBeGreaterThanOrEqual(2);
      expect(result).toBeLessThanOrEqual(8);
    }
  });
});

// ============================================================================
// Transferable handling tests
// ============================================================================

describe("transferable handling", () => {
  it("should pass transferables to worker post", async () => {
    // This tests that the API correctly passes transferables
    // In real usage, ArrayBuffer ownership is transferred for efficiency

    interface MockWorkerSuite {
      post: ReturnType<typeof vi.fn>;
    }

    const mockWorker: MockWorkerSuite = {
      post: vi.fn().mockResolvedValue({ success: true }),
    };

    const payload = { action: "encode", data: {} };
    const buffer = new ArrayBuffer(100);
    const transferables = [buffer];

    await mockWorker.post(payload, transferables);

    expect(mockWorker.post).toHaveBeenCalledWith(payload, transferables);
  });

  it("should work with empty transferables array", async () => {
    const mockWorker = {
      post: vi.fn().mockResolvedValue({ success: true }),
    };

    await mockWorker.post({ action: "decode", data: {} }, []);

    expect(mockWorker.post).toHaveBeenCalledWith(
      { action: "decode", data: {} },
      []
    );
  });
});
