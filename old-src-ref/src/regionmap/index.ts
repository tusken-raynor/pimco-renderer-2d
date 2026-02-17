import params from "@/params";
import store from "@/store";
import { ProductImageComponent } from "@/types";
import Worker from '../regionmap/worker.ts?worker';
import utils from "@/utils";

export interface WorkerMessageData {
  status: "success" | "error";
  message: string;
  payload?: any;
}
export type WorkerMessageType = "LoadRegionImages" | "ApplyRegion" | "ResetRegionMap" | "OuputRegionBuffer" | "QueryRegionMap" | "QueueRegionImage" | "DrawDataBufferQueue";

const USE_REGION_MAP = "OffscreenCanvas" in window && (!params.has('region-map') || params.getBool('region-map'));

const REGION_IMG_SENT: Record<string, boolean> = {};

const CACHE_LIBRARY = new Set<string>();

const WORKER = new Worker();
const WORKER_CALLBACKS: Map<string, (data: WorkerMessageData) => void> = new Map();
WORKER.onmessage = (e) => {
  const data = e.data as WorkerMessageData & { id: string };
  const callback = data.id in specialFunctions ? specialFunctions[data.id] : WORKER_CALLBACKS.get(data.id);
  delete (data as any).id;
  if (callback) {
    callback(data);
  }
};

const REGION_STEP_MAP: Map<number, string[]> = new Map();
const REGION_PIMCO_MAP: Map<string, number> = new Map();

export default {
  async applyToRegionBuffer(pimco: ProductImageComponent, index?: number) {
    // Check a bunch of stuff before we start the region mapping process
    if (!USE_REGION_MAP || !pimco.regionid) return;
    if (store.state.wasmUnavailable || window['isTouch']) return;
    if (typeof pimco.mask !== "string") return;
    
    // Find any png or webp images, they may have transparency in them that we are intereseted in
    let imgs: string[] = [];
    if (pimco.image.match(/\.(png|webp)(\?.+)?$/)) {
      imgs.push(pimco.image);
    }
    if (pimco.mask.match(/\.(png|webp)(\?.+)?$/)) {
      imgs.push(pimco.mask);
    }

    // If there were no PNG images, then we don't need to do anything
    if (!imgs.length) return;

    const key = imgs.join("---");

    if (!REGION_IMG_SENT[key]) {
      const messageData = await postWorkerMessage("LoadRegionImages", { images: imgs, key, color: pimco.regionid });
      if (messageData.status === "success") {
        REGION_IMG_SENT[key] = true;
      } else {
        console.error("Failed to load region images", messageData.message);
        return;
      }
    }

    const messageData = await postWorkerMessage("ApplyRegion", { key });

    if (messageData.status === "error") {
      console.error("Failed to apply region", messageData.message);
    }
  },
  async applyImageDataToRegionBuffer(imageData: ImageData, regionID: number, key?: string) {
    if (!USE_REGION_MAP) return;
    if (store.state.wasmUnavailable || window['isTouch']) return;
    if (!(imageData.width > 0 && imageData.height > 0)) return;
    
    const messageData = await postWorkerMessage("QueueRegionImage", { color: regionID, imageData, key }, [imageData.data.buffer]);
    if (messageData.status === "error") {
      console.error("Failed to queue region image", messageData.message);
    }
  },
  async resetRegionMap(width: number, height: number) {
    if (!USE_REGION_MAP) return;
    if (store.state.wasmUnavailable || window['isTouch']) return;

    const messageData = await postWorkerMessage("ResetRegionMap", { width, height });
    if (messageData.status === "error") {
      console.error("Failed to reset region map", messageData.message);
    }

    return messageData;
  },
  async renderRegionBuffer(pimcos: ProductImageComponent[], canvasWidth: number, canvasHeight: number, returnData: boolean = false) {
    // Check a bunch of stuff before we start the region mapping process
    if (!USE_REGION_MAP) return false;
    if (store.state.wasmUnavailable || window['isTouch']) return false;

    // Reset the region map

    let messageData = await postWorkerMessage("ResetRegionMap", { width: canvasWidth, height: canvasHeight });
    if (messageData.status === "error") {
      console.error("Failed to reset region map", messageData.message);
      return false;
    }

    // Apply the region images to the region buffer
    let i = 0;
    for (const pimco of pimcos) {
      await this.applyToRegionBuffer(pimco, i);
      i++;
    }
    if (returnData) {
      // Get the region buffer
      messageData = await postWorkerMessage("OuputRegionBuffer");
      if (messageData.status === "error") {
        console.error("Failed to output region buffer", messageData.message);
        return false;
      }

      const imageData = messageData.payload as ImageData;
      return imageData;
    }

    return false;
  },
  async renderRegionBufferFromQueue(returnData: boolean = false) {
    // Check a bunch of stuff before we start the region mapping process
    if (!USE_REGION_MAP) return false;
    if (store.state.wasmUnavailable || window['isTouch']) return false;

    const messageData = await postWorkerMessage("DrawDataBufferQueue");
    if (messageData.status === "error") {
      console.error("Failed to draw region data buffer queue", messageData.message);
      return false;
    }

    const outputData = await postWorkerMessage("OuputRegionBuffer");
    if (outputData.status === "error") {
      console.error("Failed to output region buffer", outputData.message);
      return false;
    }
    
    const imageData = outputData.payload as ImageData;
    if (returnData) {
      return imageData;
    }

    return false;
  },
  getRegionID(pimcoID: string) {
    if (REGION_PIMCO_MAP.has(pimcoID)) {
      return REGION_PIMCO_MAP.get(pimcoID);
    }
    // If the pimco doesn't have a region id, let's generate a number
    let id = Math.floor(Math.random() * 16777215) + 1;
    while (REGION_STEP_MAP.has(id)) {
      id = Math.floor(Math.random() * 16777215) + 1;
    }
    REGION_PIMCO_MAP.set(pimcoID, id);
    return id;
  },
  getPimcoIDFromRegion(regionID: number) {
    for (const [pimcoID, rID] of REGION_PIMCO_MAP.entries()) {
      if (rID === regionID) {
        return pimcoID;
      }
    }
    return null;
  },
  storeRegionStepData(id: number, stepIDs: string[]) {
    REGION_STEP_MAP.set(id, stepIDs);
  },
  async getStepListFromCoords(x: number, y: number) {
    const data = await postWorkerMessage("QueryRegionMap", { x, y });
    const regionID = data.payload;
    if (regionID === 0) return [];
    if (params.getBool("region-map-debug")) {
      const pimcoID = this.getPimcoIDFromRegion(regionID);
      console.log("Region map query at", x, y, "returned region ID:", regionID, "from PIMCO:", pimcoID);
    }
    return REGION_STEP_MAP.get(regionID) || [];
  },
  generatePimcoKey(pimco: ProductImageComponent) {
    const imgKeys = ['image', 'mask', 'hlimage1', 'hlimage2', 'placement'] as const;
    const imgValues: string[] = [];
    for (let i = 0; i < imgKeys.length; i++) {
      const key = imgKeys[i];
      if (key in pimco && pimco[key]) {
        imgValues.push(JSON.stringify(pimco[key]));
      }
    }
    return `${pimco.id}:::${utils.hashString(imgValues.join('-'), 32)}`;
  },
  isInCacheLibrary(key: string) {
    return CACHE_LIBRARY.has(key);
  }
}

let workerMessageID = 0;
function generateMesageID() {
  return workerMessageID++;
}

function postWorkerMessage(type: string, payload?: any, transferables?: Transferable[]): Promise<WorkerMessageData> {
  const id = generateMesageID().toString();
  return new Promise((resolve, reject) => {
    WORKER_CALLBACKS.set(id, (data) => {
      WORKER_CALLBACKS.delete(id);
      if (data.status === "error") {
        reject(data);
      } else {
        resolve(data);
      }
    });
    WORKER.postMessage({ id, type, payload }, transferables || []);
  });
}

const specialFunctions = {
  updateFrontEndCacheLibrary(data: { payload: string[] }) {
    CACHE_LIBRARY.clear();
    for (const item of data.payload) {
      CACHE_LIBRARY.add(item);
    }
  }
};