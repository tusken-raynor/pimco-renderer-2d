import { initWasm } from "@/wasm/init";
import { WorkerMessageData, WorkerMessageType } from ".";
import { getRegionMapDimensions, getRegionMapImage } from "@/wasm";

interface RegionMapMessageEvent<T extends WorkerMessageType = WorkerMessageType> extends MessageEvent {
  data: RegionMapMessageData<T>;
}
interface RegionMapMessageData<T extends WorkerMessageType> {
  id: string;
  type: T;
  payload: any;
}
interface WorkerMessageActionData extends WorkerMessageData {
  transferables?: Transferable[];
}
type MessageActions<T extends WorkerMessageType> = {
  [K in T]: (payload: any) => WorkerMessageActionData | Promise<WorkerMessageActionData>;
};

const REGION_DATA_BUFFERS: Record<string, ImageData> = {};
const REGION_DATA_BUFFER_CACHE: Record<string, Record<string, { data: ImageData; added: number; }>> = {};
const REGION_DATA_BUFFER_QUEUE: Array<string | ImageData> = [];
const MAX_SCOPE_CACHE = 3;

const REGION_BUFFER_CVS = new OffscreenCanvas(1, 1);
const REGION_BUFFER_CTX = REGION_BUFFER_CVS.getContext("2d", { willReadFrequently: true })!;
const WORKER_CVS = new OffscreenCanvas(1, 1);
const WORKER_CTX = WORKER_CVS.getContext("2d", { willReadFrequently: true })!;

const wasmLoadPromise = new Promise<void>((r) => initWasm(r));

self.onmessage = async function (event: RegionMapMessageEvent) {
  const { id, type, payload } = event.data;
  if (!(type in messageActions)) {
    postMessage({ status: "error", message: `Invalid message type: ${type}`, id });
  }
  // Make sure we have access to the OffscreenCanvas
  if (!("OffscreenCanvas" in self)) {
    postMessage({ status: "error", message: "OffscreenCanvas not supported", id });
    return;
  }
  // Make sure the wasm module is loaded
  await wasmLoadPromise;

  const messageData = await messageActions[type](payload);

  const transferables: Transferable[] = messageData.transferables || [];

  delete messageData.transferables;
  messageData['id'] = id;
  
  postMessage(messageData, transferables as any);
};

const messageActions: MessageActions<WorkerMessageType> = {
  "LoadRegionImages": async (payload) => {
    const messageData: WorkerMessageData = { status: "success", message: "" };

    try {
      const images: ImageData[] = await Promise.all(payload.images.map((url: string) => loadImageData(url)));
      const regionMap = processRegionMap(payload.color, ...images);

      // Save the ImageData to the REGION_DATA_BUFFERS
      REGION_DATA_BUFFERS[payload.key] = regionMap;
      messageData.message = "Region images loaded successfully";
    } catch (error) {
      messageData.status = "error";
      messageData.message = "Failed to load region images";
    }

    return messageData;
  },
  "ApplyRegion": (payload) => {
    const messageData: WorkerMessageData = { status: "success", message: "" };

    const key = payload.key;
    if (!REGION_DATA_BUFFERS[key]) {
      messageData.status = "error";
      messageData.message = "Region image(s) not loaded for application: " + key;
      return messageData;
    }

    const regionMapImage = REGION_DATA_BUFFERS[key];
    // Apply the region image to the canvas
    WORKER_CVS.width = regionMapImage.width;
    WORKER_CVS.height = regionMapImage.height;
    WORKER_CTX.putImageData(regionMapImage, 0, 0);

    // Draw the ImageData onto the REGION_BUFFER_CVS
    REGION_BUFFER_CTX.drawImage(WORKER_CVS, 0, 0);

    return messageData;
  },
  "QueueRegionImage": (payload: { color: number, imageData: ImageData, key?: string }) => {
    const messageData: WorkerMessageData = { status: "success", message: "Region image queued" };

    if (payload.key && getCachedRegionMap(payload.key)) {
      REGION_DATA_BUFFER_QUEUE.push(payload.key);
    } else {
      // Generate the region map since we don't have it cached
      const regionMap = processRegionMap(payload.color, payload.imageData);
      if (payload.key) {
        putCachedRegionMap(payload.key, regionMap);
        REGION_DATA_BUFFER_QUEUE.push(payload.key);
      } else {
        REGION_DATA_BUFFER_QUEUE.push(regionMap);
      }
    }

    return messageData;
  },
  "DrawDataBufferQueue": () => {
    const messageData: WorkerMessageData = { status: "success", message: "Region data buffer drawn" };
    
    while (REGION_DATA_BUFFER_QUEUE.length > 0) {
      const regionMap = REGION_DATA_BUFFER_QUEUE.shift()!;
      const regionMapImage = typeof regionMap == "string" ? getCachedRegionMap(regionMap) : regionMap;
      if (!regionMapImage) continue;
      WORKER_CVS.width = regionMapImage.width;
      WORKER_CVS.height = regionMapImage.height;
      WORKER_CTX.putImageData(regionMapImage, 0, 0);

      // Draw the ImageData onto the REGION_BUFFER_CVS
      REGION_BUFFER_CTX.drawImage(WORKER_CVS, 0, 0);
    }

    return messageData;
  },
  "ResetRegionMap": async (payload) => {
    const messageData: WorkerMessageData = { status: "success", message: "Region map reset" };
    
    if ('width' in payload && 'height' in payload) {
      const [width, height] = Array.from(getRegionMapDimensions(payload.width, payload.height));
      REGION_BUFFER_CVS.width = width;
      REGION_BUFFER_CVS.height = height;
    }

    // Clear the REGION_BUFFER_CVS with black
    REGION_BUFFER_CTX.fillStyle = "black";
    REGION_BUFFER_CTX.fillRect(0, 0, REGION_BUFFER_CVS.width, REGION_BUFFER_CVS.height);

    return messageData;
  },
  "OuputRegionBuffer": () => {
    const messageData: WorkerMessageActionData = { status: "success", message: "Region map output" };

    // Get the ImageData from the REGION_BUFFER_CVS
    const imageData = REGION_BUFFER_CTX.getImageData(0, 0, REGION_BUFFER_CVS.width, REGION_BUFFER_CVS.height);

    // Return the ImageData
    messageData.payload = imageData;
    messageData.transferables = [imageData.data.buffer];

    return messageData;
  },
  "QueryRegionMap": (payload: {x: number, y: number}) => {
    const messageData: WorkerMessageData = { status: "success", message: "Region map queried" };

    let { x, y } = payload;

    x = Math.floor(REGION_BUFFER_CVS.width * x);
    y = Math.floor(REGION_BUFFER_CVS.height * y);

    const imageData = REGION_BUFFER_CTX.getImageData(x, y, 1, 1);
    const color = imageData.data;
    const regionID = (color[0] << 16) | (color[1] << 8) | color[2];

    messageData.payload = regionID;

    return messageData;
  }
};

function getCachedRegionMap(key: string): ImageData | null {
  const [pimcoScope, dataKey] = key.split(":::");
  if (pimcoScope && dataKey && REGION_DATA_BUFFER_CACHE[pimcoScope] && REGION_DATA_BUFFER_CACHE[pimcoScope][dataKey]) {
    return REGION_DATA_BUFFER_CACHE[pimcoScope][dataKey].data;
  }
  return null;
}

function putCachedRegionMap(key: string, imageData: ImageData): void {
  const [pimcoScope, dataKey] = key.split(":::");
  if (pimcoScope && dataKey) {
    if (!REGION_DATA_BUFFER_CACHE[pimcoScope]) {
      REGION_DATA_BUFFER_CACHE[pimcoScope] = {};
    }
    const keys = Object.keys(REGION_DATA_BUFFER_CACHE[pimcoScope]);
    if (keys.length >= MAX_SCOPE_CACHE) {
      // Remove the oldest entries
      keys.sort((a, b) => REGION_DATA_BUFFER_CACHE[pimcoScope][a].added - REGION_DATA_BUFFER_CACHE[pimcoScope][b].added);
      const numToRemove = keys.length - MAX_SCOPE_CACHE + 1;
      for (let i = 0; i < numToRemove; i++) {
        delete REGION_DATA_BUFFER_CACHE[pimcoScope][keys[i]];
      }
    }
    REGION_DATA_BUFFER_CACHE[pimcoScope][dataKey] = { data: imageData, added: Date.now() };
    // Update the front-end cache library using the backend cache keys
    const allKeys = Object.keys(REGION_DATA_BUFFER_CACHE).reduce((acc, scope) => {
      acc.push(...Object.keys(REGION_DATA_BUFFER_CACHE[scope]).map(k => `${scope}:::${k}`));
      return acc;
    }, [] as string[]);
    postMessage({ payload: allKeys, id: 'updateFrontEndCacheLibrary' });
  }
}

async function loadImageData(imageUrl: string): Promise<ImageData> {
  try {
    // Fetch the image data
    const response = await fetch(imageUrl);
    const blob = await response.blob();

    // Create an ImageBitmap from the Blob
    const bitmap = await createImageBitmap(blob);

    // Clear the worker canvas
    WORKER_CTX.clearRect(0, 0, WORKER_CVS.width, WORKER_CVS.height);
    // Set the canvas size to the image size
    WORKER_CVS.width = bitmap.width;
    WORKER_CVS.height = bitmap.height;
    // Draw the ImageBitmap onto the canvas
    WORKER_CTX.drawImage(bitmap, 0, 0);

    // Get the pixel data from the canvas
    const imageData = WORKER_CTX.getImageData(0, 0, bitmap.width, bitmap.height);

    // Return the ImageData
    return imageData;
  } catch (error) {
    console.error('Error loading image:', error);
    throw error;
  }
}

function processRegionMap(color: number, ...images: ImageData[]) {
  // We need to pile all the data into a single buffer to pass to the wasm module
  // The buffer format is as follows: [section_len, width, height, r, g, b, a, r, g, b, a, ...]
  // Section_len is the number of bytes in the whole section, takes up 4 bytes
  // Width and height are the dimensions of the image, each take up 2 bytes
  // The rest of the buffer is the pixel data, each pixel takes up 4 bytes
  // The buffer is then repeated for each image
  try {
    const bufferLen = images.reduce((acc, imageData) => acc + 8 + imageData.data.length, 0);
    const buffer = new Uint8Array(bufferLen);
    let offset = 0;
    for (let i = 0; i < images.length; i++) {
      const imageData = images[i];
      const sectionLen = 8 + imageData.data.length;
      const width = imageData.width;
      const height = imageData.height;
      const data = imageData.data;
      buffer[offset] = sectionLen & 0xff;
      buffer[offset + 1] = (sectionLen >> 8) & 0xff;
      buffer[offset + 2] = (sectionLen >> 16) & 0xff;
      buffer[offset + 3] = (sectionLen >> 24) & 0xff;
      buffer[offset + 4] = width & 0xff;
      buffer[offset + 5] = (width >> 8) & 0xff;
      buffer[offset + 6] = height & 0xff;
      buffer[offset + 7] = (height >> 8) & 0xff;
      buffer.set(data, offset + 8);
      offset += sectionLen;
    }
    
    const newBuffer = getRegionMapImage(buffer, color);
    const width = REGION_BUFFER_CVS.width;
    const height = Math.floor(newBuffer.length / (width * 4));
    const newImageData = new ImageData(new Uint8ClampedArray(newBuffer), width, height);

    return newImageData;
  } catch (error) {
    console.error('Error processing region map:', error);
    throw error;
  }
}