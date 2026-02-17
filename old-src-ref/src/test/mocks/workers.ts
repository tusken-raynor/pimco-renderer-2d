import { vi } from "vitest";

/**
 * Mock Web Worker class for testing worker-based functionality
 */
export class MockWorker {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  private messageQueue: unknown[] = [];

  constructor(public url: string | URL) {}

  postMessage(message: unknown) {
    this.messageQueue.push(message);
    // By default, simulate a successful response
    setTimeout(() => {
      this.onmessage?.({
        data: { type: "complete", result: null },
      } as MessageEvent);
    }, 0);
  }

  terminate() {}

  addEventListener(event: string, handler: EventListener) {
    if (event === "message") {
      this.onmessage = handler as (e: MessageEvent) => void;
    }
    if (event === "error") {
      this.onerror = handler as (e: ErrorEvent) => void;
    }
  }

  removeEventListener() {}

  /**
   * Simulate a message from the worker
   */
  simulateMessage(data: unknown) {
    this.onmessage?.({ data } as MessageEvent);
  }

  /**
   * Simulate an error from the worker
   */
  simulateError(message: string) {
    this.onerror?.({ message } as ErrorEvent);
  }

  /**
   * Get all messages sent to the worker
   */
  getMessageQueue() {
    return this.messageQueue;
  }

  /**
   * Clear the message queue
   */
  clearMessageQueue() {
    this.messageQueue = [];
  }
}

/**
 * Create a mock for the parser worker
 */
export function createMockParserWorker() {
  const worker = new MockWorker("parser-worker.js");

  // Override postMessage to simulate parsing behavior
  worker.postMessage = vi.fn((message: unknown) => {
    const msg = message as { template?: string; variables?: Record<string, unknown> };
    setTimeout(() => {
      worker.onmessage?.({
        data: {
          type: "complete",
          result: msg.template || "",
        },
      } as MessageEvent);
    }, 0);
  });

  return worker;
}

/**
 * Create a mock for the canvas worker
 */
export function createMockCanvasWorker() {
  const worker = new MockWorker("canvas-worker.js");

  worker.postMessage = vi.fn((message: unknown) => {
    const msg = message as { type?: string };
    setTimeout(() => {
      if (msg.type === "render") {
        worker.onmessage?.({
          data: {
            type: "rendered",
            imageData: new ImageData(100, 100),
          },
        } as MessageEvent);
      } else {
        worker.onmessage?.({
          data: { type: "complete", result: null },
        } as MessageEvent);
      }
    }, 0);
  });

  return worker;
}

/**
 * Create a mock canvas workers module (for @/renderer/canvas-workers)
 */
export function createMockCanvasWorkersModule() {
  return {
    request: vi.fn().mockResolvedValue({
      canvas: {
        width: 100,
        height: 100,
        getContext: vi.fn(() => ({
          clearRect: vi.fn(),
          drawImage: vi.fn(),
          getImageData: vi.fn(() => new ImageData(100, 100)),
          putImageData: vi.fn(),
        })),
      },
      ctx: {
        clearRect: vi.fn(),
        drawImage: vi.fn(),
        getImageData: vi.fn(() => new ImageData(100, 100)),
        putImageData: vi.fn(),
      },
      width: 100,
      height: 100,
      release: vi.fn(),
    }),
    setMode: vi.fn(),
    initialize: vi.fn().mockResolvedValue(undefined),
    terminate: vi.fn(),
  };
}

/**
 * Mock the global Worker constructor for all tests
 */
export function setupGlobalWorkerMock() {
  vi.stubGlobal("Worker", MockWorker);
}
