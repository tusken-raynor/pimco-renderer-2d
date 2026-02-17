// Please don't confuse this with Thread Workers of any kind. This is just a pool of canvases to use for graphical operations.

import params from "@/params";
import utils from "@/utils";

export interface CanvasWorker {
  readonly source: number;
  readonly canvas: OffscreenCanvas;
  readonly context: OffscreenCanvasRenderingContext2DPlus;
  readonly cvs: OffscreenCanvas;
  readonly ctx: OffscreenCanvasRenderingContext2DPlus;
  width: number;
  height: number;
  release: () => void;
  cloneCanvas: () => OffscreenCanvas;
  toHTMLCanvasElement: () => HTMLCanvasElement | null;
  extendBorrowTime: (then: number | Promise<any>) => void;
};

interface StoredCanvasWorkerData {
  id: number;
  canvas: OffscreenCanvas;
  context: OffscreenCanvasRenderingContext2D;
  busy: boolean;
}
interface OffscreenCanvasRenderingContext2DPlus extends CanvasRenderingContext2D {
  letterSpacing: string;
};
interface QueuedCanvasWorkerRequest {
  resolver: (worker: CanvasWorker) => void;
  w?: number;
  h?: number;
  b?: number;
};

const CANVAS_WORKER_COUNT = 6;
const CANVAS_WORKERS: Array<StoredCanvasWorkerData> = [];
const CANVAS_WORKER_QUEUE: Array<QueuedCanvasWorkerRequest> = [];
const DFLT_BORROW_TIME = 10000;
const MAX_WAIT_TIME = 100;

// let maxBorrowedCount = 0;
// setInterval(() => {
//   const borrowedCount = CANVAS_WORKERS.filter((w) => w.busy).length;
//   if (borrowedCount > maxBorrowedCount) {
//     maxBorrowedCount = borrowedCount;
//     console.log("Max borrowed canvases: " + maxBorrowedCount);
//   }
// }, 10);
// setInterval(() => {
//   console.log("Available canvases: " + CANVAS_WORKERS.filter((w) => !w.busy).length);
// }, 5000);

const TEMPLATE_CANVAS = createCanvas(1, 1) as OffscreenCanvas;
const TEMPLATE_CONTEXT = TEMPLATE_CANVAS.getContext("2d")!;

let REUSE_CANVASES = !params.getBool('no-worker-reuse');

// Initialize the canvas workers
for (let i = 0; i < CANVAS_WORKER_COUNT; i++) {
  addCanvasWorker();
}

export default {
  request(width?: number, height?: number, altBorrowTime?: number) {
    return new Promise<CanvasWorker>((resolve) => {
      // Check if there are any available workers
      const available = grabWorker();
      if (available) {
        if (width) {
          available.width = width;
        }
        if (height) {
          available.height = height;
        }
        fulfillRequest(resolve, available, altBorrowTime);
      } else {
        // If there are no available workers, add the resolve function to the queue
        const data = { resolver: resolve, w: width, h: height, b: altBorrowTime };
        CANVAS_WORKER_QUEUE.push(data);
        // Set a timer to resolve the request if it is not fulfilled
        setTimeout(() => {
          const index = CANVAS_WORKER_QUEUE.indexOf(data);
          if (index !== -1) {
            // Pull the request data out of the queue
            CANVAS_WORKER_QUEUE.splice(index, 1);
            // If the request is still in the queue, resolve it with a new shiny worker
            addCanvasWorker();
            const newWorker = grabWorker();
            if (newWorker) {
              if (width) {
                newWorker.width = width;
              }
              if (height) {
                newWorker.height = height;
              }
              fulfillRequest(resolve, newWorker, altBorrowTime);
            } else {
              console.error("No canvas workers available");
            }
          }
        }, MAX_WAIT_TIME);
      }
    });
  },
  requestSync(width?: number, height?: number, altBorrowTime?: number) {
    const available = grabWorker();
    if (available) {
      if (width) {
        available.width = width;
      }
      if (height) {
        available.height = height;
      }
      fulfillRequest((_) => {}, available, altBorrowTime);
      return available;
    } else {
      console.error("No canvas workers available");
      return null;
    }
  },
  addWorker() {
    addCanvasWorker();
  },
  hasAvailable() {
    return !!CANVAS_WORKERS.find((w) => !w.busy);
  },
  countAvailable() {
    return CANVAS_WORKERS.filter((w) => !w.busy).length;
  },
  setMode(mode: "no-reuse" | "reuse") {
    REUSE_CANVASES = mode === "reuse";
  }
};

(window as any).countAvailableCanvasWorkers = () => CANVAS_WORKERS.filter((w) => !w.busy).length;


function addCanvasWorker() {
  const canvas = createCanvas(1, 1) as OffscreenCanvas;
  const context = canvas.getContext("2d", { willReadFrequently: true }) as any;
  // Add this a stored canvas worker data to the array
  CANVAS_WORKERS.push({
    id: CANVAS_WORKERS.length,
    canvas,
    context,
    busy: false,
  });
}

function grabWorker() {
  const available = CANVAS_WORKERS.find((w) => !w.busy);
  if (available) {
    available.busy = true;
    return packageWorker(available);
  }
  return null;
}

function releaseWorker(worker: CanvasWorker & {'--timerID'?: number}) {
  // Find the stored data for the worker
  const storedData = CANVAS_WORKERS.find((d) => d.id === worker.source);
  if (!storedData) {
    // If the stored data is not found, we are probably generating canvases
    // on the fly, so just disable the worker
    disableWorker(worker);
    return;
  }
  if (REUSE_CANVASES) {
    // Keep and reset the context
    resetCanvasContext(storedData.context);
  } else {
    // We are just going to create a new canvas and context
    storedData.canvas = createCanvas(1, 1) as OffscreenCanvas;
    storedData.context = storedData.canvas.getContext("2d") as any;
  }
  storedData.busy = false;
  // Clear the timer if it exists
  if (worker['--timerID'] !== undefined) {
    clearTimeout(worker['--timerID']);
  }
  // Disable the worker
  disableWorker(worker);
  // Check if there are any queued requests
  const queued = CANVAS_WORKER_QUEUE.shift();
  if (queued) {
    const newWorker = packageWorker(storedData);
    // If there are queued requests, resolve the first one
    if (queued.w) {
      newWorker.width = queued.w;
    }
    if (queued.h) {
      newWorker.height = queued.h;
    }
    fulfillRequest(queued.resolver, newWorker);
  }
}

function fulfillRequest(resolver: (worker: CanvasWorker) => void, worker: CanvasWorker, borrowTime?: number) {
  borrowTime = borrowTime !== undefined ? borrowTime : DFLT_BORROW_TIME;
  resolver(worker);
  // Set a timer to return the worker to the pool if it is not released
  // This will prevent memory leaks and clear render blockages
  // This timer is cleared if the worker is released before it fires
  setReleaseTimer(worker, borrowTime);
}

function cloneCanvas(canvas: OffscreenCanvas) {
  const newCanvas = createCanvas(canvas.width, canvas.height);
  const newContext = newCanvas.getContext("2d") as OffscreenCanvasRenderingContext2D;
  newContext.drawImage(canvas, 0, 0);
  return newCanvas;
}

function createCanvas(width: number, height: number) {
  // Check if the OffscreenCanvas is supported
  let canvas: OffscreenCanvas | HTMLCanvasElement;
  if (typeof OffscreenCanvas !== "undefined") {
    canvas = new OffscreenCanvas(width, height);
  } else {
    canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
  }
  return canvas;
}

function packageWorker(storedData: StoredCanvasWorkerData) {
  const worker: CanvasWorker = {
    source: storedData.id,
    canvas: storedData.canvas,
    context: storedData.context as any,
    width: 1,
    height: 1,
    cvs: storedData.canvas,
    ctx: storedData.context as any,
    release() {
      releaseWorker(this);
    },
    cloneCanvas() {
      return cloneCanvas(this.canvas) as OffscreenCanvas;
    },
    toHTMLCanvasElement() {
      if (typeof document !== "undefined") {
        const htmlCanvas = document.createElement("canvas");
        htmlCanvas.width = this.canvas.width;
        htmlCanvas.height = this.canvas.height;
        const htmlContext = htmlCanvas.getContext("2d") as CanvasRenderingContext2D;
        htmlContext.drawImage(this.canvas, 0, 0);
        return htmlCanvas;
      }
      return null;
    },
    extendBorrowTime(then: number | Promise<any>) {
      extendBorrowTime(this, then);
    }
  };
  // Make the width and height properties reactive
  Object.defineProperty(worker, "width", {
    get() {
      return this.canvas.width;
    },
    set(value) {
      this.canvas.width = value;
    },
  });
  Object.defineProperty(worker, "height", {
    get() {
      return this.canvas.height;
    },
    set(value) {
      this.canvas.height = value;
    },
  });
  return worker;
}

function extendBorrowTime(worker: CanvasWorker, then: number | Promise<any>) {
  // Remove the current timer
  clearTimeout((worker as any)['--timerID']);
  if (typeof then === "number") {
    setReleaseTimer(worker, then);
  } else {
    then.then(() => {
      // If the promise resolves, set the timer to what the borrow time was before
      setReleaseTimer(worker, (worker as any)['--timerTimout']);
    });
  }
}

function setReleaseTimer(worker: CanvasWorker, borrowTime: number) {
  const timer = setTimeout(() => {
    releaseWorker(worker);
    // Print a warning that the worker was returned because it's borrow time expired
    console.warn("A canvas worker was not returned before it's borrow time expired. Please review your code to ensure that canvas workers are always returned.");
  }, borrowTime);
  // Set a sneaky property on the worker to store the timer ID
  // This is used to clear the timer if the worker is released before it fires
  (worker as any)['--timerID'] = timer;
  // Also store the timer timeout on the worker
  (worker as any)['--timerTimout'] = borrowTime;
}

function disableWorker(worker: CanvasWorker) {
  // Over write all the properties with accessor functions that throw errors
  Object.defineProperties(worker, {
    canvas: {
      get() {
        throw new Error("This worker has been released and is no longer usable");
      },
      set(value) {
        throw new Error("This worker has been released and is no longer usable");
      },
    },
    context: {
      get() {
        throw new Error("This worker has been released and is no longer usable");
      },
      set(value) {
        throw new Error("This worker has been released and is no longer usable");
      },
    },
    width: {
      get() {
        throw new Error("This worker has been released and is no longer usable");
      },
      set(value) {
        throw new Error("This worker has been released and is no longer usable");
      },
    },
    height: {
      get() {
        throw new Error("This worker has been released and is no longer usable");
      },
      set(value) {
        throw new Error("This worker has been released and is no longer usable");
      },
    },
    cvs: {
      get() {
        throw new Error("This worker has been released and is no longer usable");
      },
      set(value) {
        throw new Error("This worker has been released and is no longer usable");
      },
    },
    ctx: {
      get() {
        throw new Error("This worker has been released and is no longer usable");
      },
      set(value) {
        throw new Error("This worker has been released and is no longer usable");
      },
    },
  });
  // Set the methods to throw errors
  worker.release = () => {
    throw new Error("This worker has been released and is no longer usable");
  };
  worker.cloneCanvas = () => {
    throw new Error("This worker has been released and is no longer usable");
  };
  worker.toHTMLCanvasElement = () => {
    throw new Error("This worker has been released and is no longer usable");
  };
  worker.extendBorrowTime = () => {
    throw new Error("This worker has been released and is no longer usable");
  }
}

function resetCanvasContext(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D) {
  // Reset transformations
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  // Clear the canvas to ensure no residual content remains
  const canvas = ctx.canvas;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Reset the canvas dimensions (if you are reusing the same canvas with potentially different dimensions)
  canvas.width = canvas.width;
  canvas.height = canvas.height;

  // Reset line styles
  ctx.lineWidth = TEMPLATE_CONTEXT.lineWidth;
  ctx.lineJoin = TEMPLATE_CONTEXT.lineJoin;
  ctx.lineCap = TEMPLATE_CONTEXT.lineCap;
  ctx.setLineDash([]);

  // Reset fill and stroke styles
  ctx.fillStyle = TEMPLATE_CONTEXT.fillStyle;
  ctx.strokeStyle = TEMPLATE_CONTEXT.strokeStyle;

  // Reset global alpha and composite operation
  ctx.globalAlpha = TEMPLATE_CONTEXT.globalAlpha;
  ctx.globalCompositeOperation = TEMPLATE_CONTEXT.globalCompositeOperation;

  // Reset text properties
  ctx.font = TEMPLATE_CONTEXT.font;
  ctx.textAlign = TEMPLATE_CONTEXT.textAlign;
  ctx.textBaseline = TEMPLATE_CONTEXT.textBaseline;
  ctx.direction = TEMPLATE_CONTEXT.direction;
  ctx.letterSpacing = TEMPLATE_CONTEXT.letterSpacing;

  // Reset shadow properties
  ctx.shadowColor = TEMPLATE_CONTEXT.shadowColor;
  ctx.shadowBlur = TEMPLATE_CONTEXT.shadowBlur;
  ctx.shadowOffsetX = TEMPLATE_CONTEXT.shadowOffsetX;
  ctx.shadowOffsetY = TEMPLATE_CONTEXT.shadowOffsetY;

  // Reset image smoothing
  ctx.imageSmoothingEnabled = TEMPLATE_CONTEXT.imageSmoothingEnabled;

  // Reset the filter
  ctx.filter = TEMPLATE_CONTEXT.filter;

  // Clear any active clipping region
  ctx.restore(); // Ensure that any clipping region is removed by restoring the default state

  // Start a new path (close any potentially open paths)
  ctx.beginPath();
}
