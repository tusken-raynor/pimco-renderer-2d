import { State } from "@/store/state";
import { Light3DReference, MaterialTextureName, Mesh3DReference, Mesh3DVariables, Model, Pimco3DMaterialCollection, ProductImageComponent } from "@/types";
import { initWasm } from "@/wasm/init";
import { Store } from "vuex";
import threedee, { ThreeJSTexture } from "@/threedee";
import canvasWorkers from "@/renderer/canvas-workers";
import renderer from "@/renderer";
import params from "@/params";

export default async function(store: Store<State>) {
  // Make sure the wasm is loaded
  await new Promise<void>(r => initWasm(r));
  // Wait for the data to be loaded
  const data = await new Promise<{
    orderedPimcos: ProductImageComponent[];
    materialPimcos3D: Pimco3DMaterialCollection;
    meshes3D: Mesh3DReference[];
    lights3D: Light3DReference[];
  }>((resolve) => {
    let updated = true;
    let orderedPimcos: ProductImageComponent[] = store.getters.getOrderedPimcos;
    let materialPimcos3D: Pimco3DMaterialCollection = store.getters.getMaterialPimcos3D;
    let meshes3D: Mesh3DReference[] = store.getters.getMeshes3D;
    let lights3D: Light3DReference[] = store.getters.getLights3D;
    store.watch((_, getters) => getters.getOrderedPimcos, (v) => (orderedPimcos = v, updated = true));
    store.watch((_, getters) => getters.getMaterialPimcos3D, (v) => (materialPimcos3D = v, updated = true));
    store.watch((_, getters) => getters.getMeshes3D, (v) => (meshes3D = v, updated = true));
    store.watch((_, getters) => getters.getLights3D, (v) => (lights3D = v, updated = true));
    // Run a 1sec throttle on the update check to make sure all the data is loaded
    const checkForUpdate = () => {
      if (!updated) {
        resolve({ materialPimcos3D, orderedPimcos, meshes3D, lights3D });
      } else {
        updated = false;
        setTimeout(checkForUpdate, 500);
      }
    };
    checkForUpdate();
  });
  // If we are working in a 2d context, we can go ahead and save the images
  if (store.getters.getProductRenderingContext === "2D") {
    store.dispatch("saveSessionImages");
    return;
  } else {
    
    let model: Model | null = null;
    const modelFetchAttemptLimit = 5;
    let attempts = 0;
    while (!model && attempts < modelFetchAttemptLimit) {
      if (attempts > 0) {
        // Wait half a second before trying again
        await new Promise(r => setTimeout(r, 500));
      }
      model = store.getters.getModel;
      attempts++;
    }
    if (!model) {
      console.warn("No product model found to render images");
      return;
    }
    // The context is 3D, so we need to set up the meshes and lighting
    const threedeeLoadPromise = threedee.initialize({
      meshes: data.meshes3D,
      lights: data.lights3D,
      render: () => {},
      cameraPosition: model.camera?.position,
      fov: typeof model.camera?.fov === "number" ? model.camera.fov : 25,
      globalTransform: model.globaltransform3d,
    });
    
    // Load the texture images and render the material textures
    const materialPimcos3D = data.materialPimcos3D;
    let materialSize = store.getters.getMaterialSize || model.materialsize;
    if (!materialSize) {
      // Check the product for a material size
      const product = store.getters.getProduct;
      materialSize = product.materialsize || [1024, 1024];
    }
    // This function also binds the textures to the THREE.js renderer
    const textureRenderPromise = renderMaterialTextures(materialPimcos3D, materialSize![0], materialSize![1]);

    // Wait for the 3D context to load and the textures to render
    await Promise.all([threedeeLoadPromise, textureRenderPromise]);
    // Now we can render and save the images
    store.dispatch("saveSessionImages");
  }
}

async function renderMaterialTextures(value: Pimco3DMaterialCollection, width: number, height: number) {
  const threeContext = threedee.getModificationContext();
  if (Object.keys(value).length) {
    const textures: Record<string, ImageData | ThreeJSTexture> = {};
    const keys = Object.keys(value) as MaterialTextureName[];
    const preloadImages = params.getBool('async-preload');
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const pimcos: ProductImageComponent[] = value[key] as any;
      const nextPimcos: ProductImageComponent[] = value[keys[i + 1]] as any;
      // Check for the HDR pimco set
      let hdrPimco: ProductImageComponent | null = null;
      if (key == "env" && (hdrPimco = pimcos.find(p => p.mode == 'image' && (p.texture?.includes(".hdr") || p.texture?.includes(".exr"))) || null)) {
        const tex = await threedee.loadHdrTexture(hdrPimco.texture!);
        if (tex) {
          if ('alpha' in hdrPimco) {
            tex['_intensity'] = hdrPimco.alpha;
          }
          textures[key] = tex;
        }
      } else {
        const worker = await canvasWorkers.request(width, height, 90000);
        worker.ctx.clearRect(0, 0, width, height);
        const renderPromise = renderer.draw(
          pimcos,
          worker.ctx,
          width, 
          height
        );
        // Attempt to load the images for the next set of pimcos while
        // the current texture is rendering
        if (nextPimcos && preloadImages) {
          renderer.preloadImages(nextPimcos);
        }
        await renderPromise;
        textures[key] = worker.ctx.getImageData(0, 0, width, height);
        worker.release();
      }
    }
    threeContext.setMaterialTextures(textures);
    
  } else {
    // Remove the materials from the meshes
    threeContext.setMaterialTextures({});
  }
}