import CanvasWorkers from "@/renderer/canvas-workers";
import utils from "@/utils";
import SparkMD5 from "spark-md5";
import indexeddb from "./indexeddb";
import storage from ".";
import effects from "@/effects";

interface ImageBlobRegistrationConfig {
  resize?: [number, number];
  reformat?: "png" | "jpeg" | "webp";
  quality?: number;
}

// Create a cache for Blob URLs keyed by their hash
const blobKeyMap = new Map<string, string>();
// Track who registers blobs
const blobRegistrarMap = new Map<string, Set<string>>();

const uploaded = {
  async registerImageBlob(blob: Blob, config: ImageBlobRegistrationConfig = {}): Promise<{ key: string; }> {
    blob = await processImageBlob(blob, config);
    const blobHash = await hashBlob(blob);
    // If the hashed blob has a cache hit, return that blob's key
    if (blobKeyMap.has(blobHash)) {
      // Just return the key
      return { key: blobHash };
    }

    const blobUrl = URL.createObjectURL(blob);
    blobKeyMap.set(blobHash, blobUrl);

    // The blob may exist in IndexedDB storage but not in the cache
    // Save the blob data to IndexedDB if it's not there already
    const existingBlob = await indexeddb.getBlob(blobHash);
    if (!existingBlob) {
      try {
        await indexeddb.saveBlob(blobHash, blob);
      } catch (error) {
        console.error("Error saving blob to IndexedDB:", error);
      }
    }

    return { key: blobHash };
  },
  async getBlobUrl(key: string, registrar: string): Promise<string | undefined> {
    if (blobKeyMap.has(key)) {
      // Add to the registrar map
      addRegistrar(key, registrar);
      // If the blob URL is already cached, return it
      return blobKeyMap.get(key);
    }
    // See if the blob lives in IndexedDB
    const blob = await indexeddb.getBlob(key);
    if (blob) {
      const blobUrl = URL.createObjectURL(blob);
      // Save the blob URL to the cache
      blobKeyMap.set(key, blobUrl);
      // Add to the registrar map
      addRegistrar(key, registrar);

      return blobUrl;
    }
    return undefined;
  },
  getBlobUrlSync(key: string, registrar: string): string | undefined {
    // Here we can only grab from the cache
    if (blobKeyMap.has(key)) {
      // Add to the registrar map
      addRegistrar(key, registrar);
      // If the blob URL is already cached, return it
      return blobKeyMap.get(key);
    } else {
      // Just register a new URL for this key if gets called again
      this.getBlob(key).then((blob) => {
        if (!blob) return;
        const blobUrl = URL.createObjectURL(blob);
        blobKeyMap.set(key, blobUrl);
      });
    }
    return undefined;
  },
  async hasBlob(key: string): Promise<boolean> {
    if (blobKeyMap.has(key)) {
      return true;
    }
    // Check if the blob exists in IndexedDB
    const blob = await indexeddb.getBlob(key);
    return !!blob;
  },
  async getBlob(key: string): Promise<Blob | null> {
    const blob = await indexeddb.getBlob(key);
    if (blob && !blobKeyMap.has(key)) {
      // Set a blob URL in the cache
      const blobUrl = URL.createObjectURL(blob);
      blobKeyMap.set(key, blobUrl);
    }
    return blob;
  },
  async deleteBlob(key: string, registrar: string): Promise<void> {
    const registrars = blobRegistrarMap.get(key);
    if (registrars?.has(registrar)) {
      registrars.delete(registrar);
      // If there are no more registrars, delete the blob
      if (registrars.size === 0) {
        blobKeyMap.delete(key);
        removeRegistrar(key, registrar);
        await indexeddb.deleteBlob(key);
      }
    }
  }
}

export default uploaded;

async function hashBlob(blob: Blob): Promise<string> {
  const arrayBuffer = await blob.arrayBuffer();
  const hash = SparkMD5.ArrayBuffer.hash(arrayBuffer);
  return hash; // 32-char hex string
}

async function processImageBlob(
  blob: Blob,
  config: ImageBlobRegistrationConfig
): Promise<Blob> {
  if (!config.resize && !config.reformat) {
    // No need to change the blob
    return blob;
  }

  const isSvg = blob.type === "image/svg+xml";
  const bitmap = await (isSvg ? loadSVGImage(blob) : createImageBitmap(blob));

  let targetWidth = bitmap.width;
  let targetHeight = bitmap.height;
  if (config.resize && (bitmap.width > config.resize[0] || bitmap.height > config.resize[1] || isSvg)) {
    const resized = containResize([bitmap.width, bitmap.height], config.resize, isSvg);
    targetWidth = resized[0];
    targetHeight = resized[1];
  }
  if (isSvg) {
    (bitmap as HTMLImageElement).width = targetWidth;
    (bitmap as HTMLImageElement).height = targetHeight;
  }

  const worker = await CanvasWorkers.request(bitmap.width, bitmap.height);
  worker.ctx.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height);
  await effects.processRenderedImage(worker.ctx).resize(targetWidth, targetHeight).execute();

  let mimeType = blob.type; // default to original type
  if (config.reformat) {
    mimeType = `image/${config.reformat}`;
  }
  
  const processedBlob = await utils.imageDataOrCanvasToBlob(worker.canvas, mimeType, config.quality || 0.92);

  worker.release();

  return processedBlob;
}

function containResize(
  src: [number, number],
  max: [number, number],
  isVector: boolean = false
): [number, number] {
  const [srcWidth, srcHeight] = src;
  const [maxWidth, maxHeight] = max;

  const widthRatio = maxWidth / srcWidth;
  const heightRatio = maxHeight / srcHeight;
  // If the image is vector, we actaully are okay with upscaling
  const ratio = Math.min(widthRatio, heightRatio, 1 + (isVector ? 10000 : 0));

  return [
    Math.round(srcWidth * ratio),
    Math.round(srcHeight * ratio)
  ];
}

function loadSVGImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (error) => reject(error);
    img.src = URL.createObjectURL(blob);
  });
}

function addRegistrar(key: string, registrar: string): void {
  if (!blobRegistrarMap.has(key)) {
    blobRegistrarMap.set(key, new Set());
  }
  blobRegistrarMap.get(key)!.add(registrar);
  storage.saveValue(`registrars_${key}`, Array.from(blobRegistrarMap.get(key)!));
}

function removeRegistrar(key: string, registrar: string): void {
  const registrars = blobRegistrarMap.get(key);
  if (registrars) {
    registrars.delete(registrar);
    if (registrars.size === 0) {
      blobRegistrarMap.delete(key);
      storage.deleteValue(`registrars_${key}`);
    } else {
      storage.saveValue(`registrars_${key}`, Array.from(registrars));
    }
  }
}

function initSavedRegistrars(): void {
  // Load the saved registrars from session storage
  let keyNum = 0;
  while (sessionStorage.key(keyNum)) {
    const key = sessionStorage.key(keyNum)!;
    if (key.startsWith("registrars_")) {
      const blobKey = key.substring(11);
      try {
        const registrars = JSON.parse(sessionStorage.getItem(key) || "[]");
        blobRegistrarMap.set(blobKey, new Set(registrars));
        // Load the blob URLs into the cache for the registrars
        registrars.forEach((registrar: string) => {
          // This will load the blob URL into the cache if it exists in IndexedDB
          uploaded.getBlobUrl(blobKey, registrar);
        });
      } catch (error) {
        console.error("Failed to parse registrars:", error);
      }
    }
    keyNum++;
  }
}
initSavedRegistrars();