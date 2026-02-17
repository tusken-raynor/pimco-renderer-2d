import utils from "@/utils";
import type { actions } from "./lib";
import Worker from "./worker?worker";

const WORKER_MAX = Math.max(Math.min((navigator.hardwareConcurrency || 4) - 2, 8), 2);

const tasks: {
  payload: {
    action: keyof typeof actions;
    data: Parameters<(typeof actions)[keyof typeof actions]>[0];
  };
  transfer: Transferable[];
  resolve: (value: any) => void;
}[] = [];
const workerPool = [] as ReturnType<
  typeof utils.createWorkerSuite<
    { action: keyof typeof actions; data: Parameters<(typeof actions)[keyof typeof actions]>[0] },
    ReturnType<(typeof actions)[keyof typeof actions]>
  >
>[];
let workerCount = 0;

export default {
  decode: async (input: ArrayBuffer, options?: any): Promise<ImageData> => {
    return handleNewTask<ImageData>({ action: "decode", data: { input, options } }, [input]);
  },
  encode: (imageData: ImageData, options?: any): Promise<ArrayBuffer> => {
    return handleNewTask<ArrayBuffer>({ action: "encode", data: { imageData, options } }, [imageData.data.buffer]);
  },
};

function handleNewTask<T>(payload: (typeof tasks)[0]["payload"], transfer: Transferable[]): Promise<T> {
  return new Promise<T>(async (resolve) => {
    // Check if the task queue is empty. If it is, push the new task on the queue to be
    // processed when it can. Otherwise, find an available worker.
    if (tasks.length !== 0) {
      tasks.push({ payload, transfer, resolve });
      return;
    }
    // Check for an available worker. If there is no available worker, and we haven't hit the max,
    // create a new worker. Otherwise, just queue the task.
    let worker = workerPool.shift();
    if (!worker) {
      if (workerCount < WORKER_MAX) {
        worker = utils.createWorkerSuite(new Worker());
        workerCount++;
      } else {
        tasks.push({ payload, transfer, resolve });
        return;
      }
    }
    const result: T = await worker.post(payload, transfer);
    returnWorkerToPool(worker);
    resolve(result);
  });
}

function returnWorkerToPool(worker: (typeof workerPool)[0]) {
  // Check if there are any queued tasks. If so, process the next one.
  const nextTask = tasks.shift();
  if (nextTask) {
    const { payload, transfer, resolve } = nextTask;
    worker
      .post(payload, transfer)
      .then((result) => {
        resolve(result);
        returnWorkerToPool(worker);
      })
      .catch((error) => {
        console.error("Worker task error:", error);
        returnWorkerToPool(worker);
      });
  } else {
    // No queued tasks, return the worker to the pool.
    workerPool.push(worker);
  }
}
