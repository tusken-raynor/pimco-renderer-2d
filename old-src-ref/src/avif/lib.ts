type AvifModule = {
  decode: (input: ArrayBuffer, options?: any) => Promise<ImageData>;
  encode: (imageData: ImageData, options?: any) => Promise<ArrayBuffer>;
};

let AVIF: AvifModule | null = null;

export const actions = {
  encode: async (payload: { imageData: ImageData; options?: any }): Promise<ArrayBuffer> => {
    if (!AVIF) {
      AVIF = await loadAvifModule();
      if (!AVIF) throw new Error("Failed to load AVIF module");
    }

    return AVIF.encode(payload.imageData, payload.options);
  },
  decode: async (payload: { input: ArrayBuffer; options?: any }): Promise<ImageData> => {
    if (!AVIF) {
      AVIF = await loadAvifModule();
      if (!AVIF) throw new Error("Failed to load AVIF module");
    }

    return AVIF.decode(payload.input, payload.options);
  },
};

async function loadAvifModule(): Promise<AvifModule | null> {
  try {
    // @ts-ignore
    const module = await import("https://unpkg.com/@jsquash/avif@2.1.1/index.js?module");
    return {
      decode: module.decode,
      encode: module.encode,
    };
  } catch (error) {
    console.warn("Error loading AVIF module:", error);
    throw error;
  }
}
