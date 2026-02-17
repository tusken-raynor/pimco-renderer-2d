<template>
  <div
    id="canvas-container"
    :class="[renderingContextClass, { 'help-lights': isInLightHelpMode }]"
    ref="canvasContainer"
  >
    <canvas
      id="main-canvas"
      ref="mainCanvas"
      :data-canvas-state="changingFrames || changingMeshes || changingTextures ? 'loading' : 'done'"
      :class="{ contain: fillScaleLock }"
    ></canvas>
    <div class="controls-3d" v-if="productRenderingContext !== '2D'" ref="controls3D"></div>
    <working-indicator :changing-frames="changingFrames || changingMeshes || changingTextures"></working-indicator>
  </div>
</template>

<script lang="ts">
import WorkingIndicator from "./WorkingIndicator.vue";
import { defineComponent, ref, Ref } from "vue";
import { mapGetters, mapMutations, mapState, mapActions } from "vuex";
import { Attribute, ConfiguratorView, PimcoMaskSubstitution, ProductImageComponent } from "@/types";
import renderer from "@/renderer";
import CanvasWorkers from "@/renderer/canvas-workers";
import params from "@/params";
import regionmap from "@/regionmap";
import threedee, { ThreeJSTexture } from "@/threedee";
import utils from "@/utils";
import canvasWorkers from "@/renderer/canvas-workers";
import { starters } from "@/store/initialize";
import { MaterialTextureName, Mesh3DReference, PimcoMaskSubstitutionProjection, NumericalFormula } from "@/types";
import { Model } from "@/types";
import { createNumericalFormula } from "@/formulas";
import effects from "@/effects";
import WebGLPostProcessor from "webgl-postprocessor";

export default defineComponent({
  name: "ProductImages",
  components: {
    WorkingIndicator,
  },
  computed: {
    ...mapState(["OS", "inStudioMode"]),
    ...mapGetters({
      orderedPimcos: "getOrderedPimcos",
      materialPimcos3D: "getMaterialPimcos3D",
      product: "getProduct",
      model: "getModel",
      filteredAttributes: "getFilteredAttributes",
      productRenderingContext: "getProductRenderingContext",
      meshes3D: "getMeshes3D",
      lights3D: "getLights3D",
      frameMaterialSize: "getMaterialSize",
      getProductView: "getProductView",
      productViews: "getViews",
      aspectRatio: "getProductAspectRatio",
      sizingMode: "getProductImageSizingMode",
    }),
    productImageDimensions(): [number, number] {
      if (this.product?.dimensions) {
        if (this.sizingMode === "fill") {
          return [
            Math.max(1, this.canvasContainerSizeX * devicePixelRatio),
            Math.max(1, this.canvasContainerSizeY * devicePixelRatio),
          ];
        }
        return this.product.dimensions;
      }
      return [1350, 1350];
    },
    // This is a reactive version of the canvasSize number that can be used to render appropriate
    // canvas dimensions for higher pixel density screens
    canvasX(): number {
      if (devicePixelRatio > 1) {
        return this.canvasSizeX * devicePixelRatio;
      }
      return this.canvasSizeX;
    },
    canvasY(): number {
      if (devicePixelRatio > 1) {
        return this.canvasSizeY * devicePixelRatio;
      }
      return this.canvasSizeY;
    },
    filteredAttributeIDs(): string[] {
      return this.filteredAttributes.map((attr: Attribute) => attr.id);
    },
    renderingContextClass(): string {
      return "render-context-" + utils.sanitize(this.productRenderingContext);
    },
    productView(): ConfiguratorView {
      return this.getProductView;
    },
    modelFOV(): number | NumericalFormula {
      return this.model?.camera?.fov;
    },
    fieldOfView3D(): number {
      const fov = this.modelFOV;
      if (typeof fov == "object") {
        return this.dynamicFOV3D;
      }
      return fov || 25;
    },
    isInLightHelpMode(): boolean {
      return params.getBool("gr:help-lights");
    },
  },
  data(): {
    canvasSizeX: number;
    canvasSizeY: number;
    canvasContainerSizeX: number;
    canvasContainerSizeY: number;
    workWidth: number;
    workHeight: number;
    mainCtx: CanvasRenderingContext2D;
    loadedImages: Map<string, Promise<HTMLImageElement | null>>;
    workCanvas: HTMLCanvasElement;
    workCtx: CanvasRenderingContext2D;
    colorCanvas: HTMLCanvasElement;
    colorCtx: CanvasRenderingContext2D;
    frameCanvas1: HTMLCanvasElement;
    frameCtx1: CanvasRenderingContext2D;
    frameCanvas2: HTMLCanvasElement;
    frameCtx2: CanvasRenderingContext2D;
    changingFrames: boolean;
    changingMeshes: boolean;
    changingTextures: boolean;
    pimcoUpdates: boolean;
    resizeObserver?: ResizeObserver;
    redrawCleanupTimeoutId: number;
    canvasMarkup: string;
    frameUpdating: boolean;
    currentPimcos: ProductImageComponent[];
    currentJSON: string;
    updatedSize: boolean;
    lastMousePosX: number;
    lastMousePosY: number;
    lastMouseTime: number;
    lastMouseUpdateID: any;
    lastMouseDown: number;
    lastFrameUpdate: number;
    thetaX: number;
    thetaY: number;
    thetaZ: number;
    twoTouchRotation: boolean;
    mouseTrackingOverlay: HTMLDivElement | null;
    threeJSReady: boolean;
    pendingMeshPromise: Promise<void> | null;
    pendingMeshes: Mesh3DReference[] | null;
    materialRenderInProgress: boolean;
    materialRenderNeedsUpdate: boolean;
    dynamicFOV3D: number;
    dynamicFOV3DFunction: (() => number) | null;
    zoomScale: number;
    maxZoom: number;
    fillScaleLock: boolean;
  } {
    // we need offscreen canvases to draw into and combine before adding a completed product to
    // the mainCanvas. Four should do:
    // 1. the work canvas where the layers of images are drawn on to for a single stack/pimco.
    //    For example, the palm of a glove would require the base image, coloring,
    //    and one or two highlight texture images and each of those being drawn would
    //    require a blend mode and opacity to be set when they are combined. Lastly, a
    //    mask would need to be placed over the whole stack of drawn images so only the
    //    web would be drawn on to the frame after all of those layers were drawn.
    // 2. the color canvas that a color rectangle or texture image is placed and then
    //    drawn onto the work canvas with whatever blending/opacity requirements needed
    // 3. a first frame canvas that the work canvas can be drawn to after it has completed its
    //    drawing on the work canvas.
    // 4. a second frame canvas that maintains what the current frame drawn on the mainCanvas
    //    so when swapping to a new frame we have a reference of the previous frame
    const workCanvas = document.createElement("canvas") as HTMLCanvasElement;
    const workCtx = workCanvas.getContext("2d") as CanvasRenderingContext2D;
    const colorCanvas = document.createElement("canvas") as HTMLCanvasElement;
    const colorCtx = colorCanvas.getContext("2d") as CanvasRenderingContext2D;
    const frameCanvas1 = document.createElement("canvas") as HTMLCanvasElement;
    const frameCtx1 = frameCanvas1.getContext("2d") as CanvasRenderingContext2D;
    const frameCanvas2 = document.createElement("canvas") as HTMLCanvasElement;
    const frameCtx2 = frameCanvas2.getContext("2d") as CanvasRenderingContext2D;
    const screenWidth = (starters.dev ? innerWidth : screen.availWidth) * devicePixelRatio;
    const screenHeight = (starters.dev ? innerHeight : screen.availHeight) * devicePixelRatio;
    const workCanvasWidth =
      screenHeight > 1350 && screenWidth > 1350 ? 1350 : screenHeight > screenWidth ? screenWidth : screenHeight;
    // for now, just setting it to the same as width but putting this in for future use
    const workCanvasHeight = workCanvasWidth;

    workCanvas.width = colorCanvas.width = frameCanvas1.width = frameCanvas2.width = workCanvasWidth;
    workCanvas.height = colorCanvas.height = frameCanvas1.height = frameCanvas2.height = workCanvasHeight;

    return {
      canvasSizeX: 0,
      canvasSizeY: 0,
      canvasContainerSizeX: 1,
      canvasContainerSizeY: 1,
      workWidth: workCanvasWidth,
      workHeight: workCanvasHeight,

      // for now just throwing in the frameCanvas2 context. Will be replaced
      // in the mounted() call with the correct context
      mainCtx: frameCtx2,
      loadedImages: new Map<string, Promise<HTMLImageElement | null>>(),

      workCanvas,
      workCtx,

      colorCanvas,
      colorCtx,

      frameCanvas1,
      frameCtx1,
      frameCanvas2,
      frameCtx2,

      changingFrames: false,
      changingMeshes: false,
      changingTextures: false,
      pimcoUpdates: true,

      resizeObserver: undefined,
      redrawCleanupTimeoutId: 0,
      canvasMarkup: "",
      frameUpdating: false,
      currentPimcos: [],
      currentJSON: "",
      updatedSize: false,
      lastMousePosX: 0,
      lastMousePosY: 0,
      lastMouseTime: 0,
      lastMouseUpdateID: null,
      lastMouseDown: 0,
      lastFrameUpdate: 0,
      thetaX: 0,
      thetaY: 0,
      thetaZ: 0,
      twoTouchRotation: false,
      mouseTrackingOverlay: null,
      threeJSReady: false,
      pendingMeshPromise: null,
      pendingMeshes: null,
      materialRenderInProgress: false,
      materialRenderNeedsUpdate: false,
      dynamicFOV3D: 25,
      dynamicFOV3DFunction: null,
      zoomScale: 1.0,
      maxZoom: 3.0,
      fillScaleLock: false,
    };
  },
  watch: {
    // watching for when the orderedPimcos change in the store and updating the product visually
    // by calling changeFrames().
    orderedPimcos(pimcos) {
      if (this.productRenderingContext !== "2D") return;
      // Only update the canvas reactively if we aren't running on iOS
      if (this.OS !== "iOS") {
        this.pimcoUpdates = true;
        this.currentPimcos = this.orderedPimcos;
        this.changeFrames();
      }
    },
    async meshes3D(value) {
      if (this.productRenderingContext == "2D") return;
      const meshesJSON = JSON.stringify(value);
      if (window["__meshesJSON__"] === meshesJSON) {
        return;
      }
      window["__meshesJSON__"] = meshesJSON;
      // If meshes are being worked on, we need to wait for the pendingMeshPromise to resolve
      // So store the meshes in pendingMeshes and wait for the promise to resolve
      if (this.pendingMeshPromise) {
        this.pendingMeshes = value;
        return;
      }
      // Make sure threeJS is ready before updating the scene
      this.pendingMeshPromise = new Promise<void>((r) => this.onThreeJSReady(r));
      // Trigger the loading indicator
      this.changingMeshes = true;
      await this.pendingMeshPromise;
      do {
        if (this.pendingMeshes) {
          value = this.pendingMeshes;
          this.pendingMeshes = null;
        }
        this.pendingMeshPromise = threedee.getModificationContext().updateSceneMeshes(value);
        await this.pendingMeshPromise;
        // In the time it took for the promise to fulfill, another set of meshes may have been
        // added to the pendingMeshes array. If so, we need to loop back and update the scene again
      } while (this.pendingMeshes);
      this.pendingMeshPromise = null;
      this.changingMeshes = false;
      this.changeFrames();
    },
    lights3D(value) {
      if (this.productRenderingContext == "2D") return;
      const lightsJSON = JSON.stringify(value);
      if (window["__lightsJSON__"] === lightsJSON) {
        return;
      }
      window["__lightsJSON__"] = lightsJSON;

      threedee.updateSceneLights(value);
      // Wait one frame before trying to change the frame from
      // this change, because the meshes may be triggering a
      // changeFrames call, and we prefer to use that one
      requestAnimationFrame(() => {
        // If there are no pending mesh promises, then we can change the frame
        // from this scope
        if (!this.pendingMeshPromise) {
          this.changeFrames(this.inStudioMode);
        }
      });
    },
    async threeJSReady(value) {
      if (this.productRenderingContext == "2D") return;
      if (value) {
        // Trigger the loading indicator
        this.changingTextures = true;
        await this.renderMaterialTextures();
        this.changingTextures = false;
      }
      // If there are no pending mesh promises, then we can change the frame
      // from this scope
      if (!this.pendingMeshPromise) {
        this.changeFrames(false, true);
      }
    },
    productImageDimensions(value) {
      if (this.sizingMode == "fill") {
        this.fillScaleLock = true;
        // We need to make sure the fillScaleLock is disabled after resizing
        // is finished
        if (window["__fillLockTimer"] !== undefined) {
          clearTimeout(window["__fillLockTimer"]);
        }
        window["__fillLockTimer"] = setTimeout(() => {
          this.fillScaleLock = false;
          window["__fillLockTimer"] = undefined;

          this.resizeCanvas();
          if (threedee.initialized) {
            // Update the fov for the new aspect-ratio
            const fov = this.calculateFOV3D();
            threedee.setCameraFOV(fov);
          }
          // Quickly rerender the scene
          this.changeFrames(true);
        }, 500);
      } else {
        this.resizeCanvas();
      }
    },
    productRenderingContext(value) {
      this.init3DContext();
      CanvasWorkers.setMode(value == "2D" ? "reuse" : "no-reuse");
    },
    async materialPimcos3D(value) {
      // const id = Math.random();
      // console.log("Material Pimcos 3D changed", id, value);
      if (this.productRenderingContext == "2D") return;
      if (!this.threeJSReady) return;
      const materialPimcosJSON = JSON.stringify(value);
      if (window["__materialPimcosJSON__"] === materialPimcosJSON) {
        return;
      }
      window["__materialPimcosJSON__"] = materialPimcosJSON;
      // Trigger the loading indicator
      this.changingTextures = true;
      await this.renderMaterialTextures();
      this.changingTextures = false;
      this.changeFrames();
    },
    async productView(value: ConfiguratorView, prev: ConfiguratorView) {
      if (this.productRenderingContext == "2D") return;
      await new Promise<void>((r) => this.onThreeJSReady(r));
      if (!Array.isArray(value)) return;
      if (JSON.stringify(value) === JSON.stringify(prev)) return;

      // Run an animation to rotate the model to the new view
      threedee.requestAnimationPromise().then(() => {
        // console.log("Running animation", key, time);
        setTimeout(() => {
          // threedee.beginAnimation();
          threedee.animateModelRotation(value, 600, this.cubicEasing);
          // Reset the zoomScale smoothly to 1.0 during the animation
          threedee.onAnimationProgress((progress) => {
            // console.log("Animation progress", key, progress, time);
            progress = this.cubicEasing(Math.min(progress * 2.0, 1.0));
            // Interpolate the zoom between the current zoom and the default zoom
            if (window["startZoom"] === undefined) {
              window["startZoom"] = this.zoomScale;
            }
            this.zoomScale = utils.lerp(window["startZoom"], 1.0, progress);
            if (progress === 1.0) {
              delete window["startZoom"];
            }
          });
        }, 100);
      });
    },
    modelFOV(fov: number | NumericalFormula) {
      if (this.productRenderingContext == "2D") return;
      if (!threedee.initialized) return;
      if (typeof fov == "object") {
        const func = createNumericalFormula(fov);
        this.dynamicFOV3DFunction = () => func(this.zoomScale);
      }
      this.calculateFOV3D();
    },
    fieldOfView3D(fov: number) {
      if (this.productRenderingContext == "2D") return;
      if (!threedee.initialized) return;
      if (threedee.getCameraFOV() == fov) return;
      threedee.setCameraFOV(fov);
      this.changeFrames();
    },
  },
  methods: {
    ...mapMutations([
      "setProductImageDataURL",
      "incrementProductView",
      "decrementProductView",
      "setStandardPopup",
      "setProductView",
    ]),
    ...mapActions(["setCurrentAttribute", "setAttributes"]),
    // convenience method for loading images, with a basic in-memory caching mechanism
    loadImage(url: string): Promise<HTMLImageElement | null> {
      if (this.OS === "iOS") {
        return this.iOSLoadImage(url);
      }
      // see if we've already loaded this image
      if (this.loadedImages.has(url)) {
        const element = this.loadedImages.get(url);
        if (element !== undefined) {
          // yep we have, just resolve to that
          return element;
        } else {
          console.log("we should not be getting here");
          return Promise.resolve(null);
        }
      } else {
        // not yet, go ahead and load it up
        const p = new Promise<HTMLImageElement | null>((resolve) => {
          const image = new Image();
          image.addEventListener("load", () => {
            // make sure to save it in the cache
            resolve(image);
          });
          image.addEventListener("error", () => {
            resolve(null);
          });
          image.src = url;
        });
        this.loadedImages.set(url, p);
        return p;
      }
    },
    // Have it only cache url status if they return 404, if we store all of them
    // it sometimes causes the device not to render the product
    iOSLoadImage(url: string): Promise<HTMLImageElement | null> {
      if (this.loadedImages.has(url)) {
        const element = this.loadedImages.get(url);
        if (element !== undefined) {
          // yep we have, just resolve to that
          return element;
        } else {
          console.log("we should not be getting here");
          return Promise.resolve(null);
        }
      } else {
        const p = new Promise<HTMLImageElement | null>((resolve) => {
          const image = new Image();
          image.addEventListener("load", () => {
            // make sure to save it in the cache
            resolve(image);
          });
          image.addEventListener("error", () => {
            this.loadedImages.set(url, p);
            resolve(null);
          });
          image.src = url;
        });
        return p;
      }
    },
    // I don't like this because we're putting logic in two places but it is necessary
    // so we don't have a single request, blocking loading queue of images. This is to
    // ensure that all images are preloading before drawing them on the stack and it won't
    // block for each image loading request, just make all of them and wait until they're
    // all completed.
    loadImages(): Promise<Array<HTMLImageElement | null>> {
      const loaders: Array<Promise<HTMLImageElement | null>> = [];
      for (const idx in this.currentPimcos) {
        const pimco = this.currentPimcos[idx];
        loaders.push(this.loadImage(pimco.image));
        if (pimco.mode != "color") {
          if (pimco.texture) {
            loaders.push(this.loadImage(pimco.texture));
          }
        }
        if (pimco.hlimage1) {
          loaders.push(this.loadImage(pimco.hlimage1));
        }
        if (pimco.hlimage2) {
          loaders.push(this.loadImage(pimco.hlimage2));
        }
        // Check if the mask is an object, which would mean its a substitution
        if (!(pimco.mask instanceof Object)) {
          loaders.push(this.loadImage(pimco.mask));
        }
      }
      return Promise.all(loaders);
    },

    /**
     * This will take care of drawing all of the layers required for a stack onto
     * the workCanvas with its mask so it can then be drawn to the frameCanvas1 canvas
     * only showing the resulting image for this stack.
     * This method can be considered the owner of the workCanvas and colorCanvas so it
     * will take care of clearing them out as it needs to. Clearing out frameCanvas1 is done
     * in the updateFrame() call.
     */
    async drawStack(
      pimco: ProductImageComponent,
      altColoring = { color: "#00000000", alpha: 0, blend: "multiply" },
    ): Promise<void> {
      this.workCtx.globalCompositeOperation = "source-over" as any;
      this.workCtx.globalAlpha = 1.0;
      this.workCtx.clearRect(0, 0, this.workWidth, this.workHeight);
      // If the pimco doesn't have it's own base image, use the base image from the model
      const workUrl = pimco.image;
      const workImg = await this.loadImage(workUrl);
      if (!workImg) {
        return;
      }
      this.workCtx.drawImage(workImg, 0, 0, workImg.width, workImg.height, 0, 0, this.workWidth, this.workHeight);

      // Set the color or the texture image for the colorCanvas
      this.colorCtx.clearRect(0, 0, this.workWidth, this.workHeight);
      this.workCtx.globalCompositeOperation = pimco.blend as any;
      this.workCtx.globalAlpha = pimco.alpha;
      if (pimco.mode == "color") {
        if (pimco.color) {
          this.colorCtx.fillStyle = pimco.color as string;
        } else {
          // need to use the alternative color setup
          this.workCtx.globalCompositeOperation = altColoring.blend as any;
          this.workCtx.globalAlpha = altColoring.alpha;
          this.colorCtx.fillStyle = altColoring.color;
        }
        this.colorCtx.fillRect(0, 0, this.workWidth, this.workHeight);
        this.workCtx.drawImage(
          this.colorCanvas,
          0,
          0,
          this.colorCanvas.width,
          this.colorCanvas.height,
          0,
          0,
          this.workWidth,
          this.workHeight,
        );
      } else {
        if (pimco.texture) {
          const textureImage = await this.loadImage(pimco.texture);
          if (!textureImage) {
            return;
          }
          this.workCtx.drawImage(
            textureImage,
            0,
            0,
            textureImage.width,
            textureImage.height,
            0,
            0,
            this.workWidth,
            this.workHeight,
          );
        }
      }

      // load up the highlight and draw on to the work canvas with blending and opacity
      if (pimco.hlimage1 && pimco.hlalpha1 && pimco.hlblend1) {
        const highlightImg = await this.loadImage(pimco.hlimage1);
        if (!highlightImg) {
          return;
        }
        this.workCtx.globalCompositeOperation = pimco.hlblend1 as any;
        this.workCtx.globalAlpha = pimco.hlalpha1;
        this.workCtx.drawImage(
          highlightImg,
          0,
          0,
          highlightImg.width,
          highlightImg.height,
          0,
          0,
          this.workWidth,
          this.workHeight,
        );
        // We'll use the alpha property as the base identifier for the second highlight
        // and fill the other values using values from the first highlight if needed
        if (pimco.hlalpha2) {
          const highlightImg2 = await this.loadImage(pimco.hlimage2 || pimco.hlimage1);
          if (!highlightImg2) {
            return;
          }
          this.workCtx.globalCompositeOperation = (pimco.hlblend2 || pimco.hlblend1) as any;
          this.workCtx.globalAlpha = pimco.hlalpha2;
          this.workCtx.drawImage(
            highlightImg2,
            0,
            0,
            highlightImg2.width,
            highlightImg2.height,
            0,
            0,
            this.workWidth,
            this.workHeight,
          );
        }
      }

      // last get the mask and mask the work canvas out before drawing on to the main canvas
      if (pimco.mask instanceof Object) {
        return;
      }
      const maskImg = await this.loadImage(pimco.mask);
      if (!maskImg) {
        return;
      }
      this.workCtx.globalCompositeOperation = "destination-in" as any;
      this.workCtx.globalAlpha = 1.0;
      this.workCtx.drawImage(maskImg, 0, 0, maskImg.width, maskImg.height, 0, 0, this.workWidth, this.workHeight);

      // draw that on to the frame canvas, no masking, blending, opacity or anything like that
      this.frameCtx1.globalCompositeOperation = "source-over" as any;
      this.frameCtx1.globalAlpha = 1.0;
      this.frameCtx1.drawImage(
        this.workCanvas,
        0,
        0,
        this.workWidth,
        this.workHeight,
        0,
        0,
        this.workWidth,
        this.workHeight,
      );
    },
    async drawSubstitution(pimco: ProductImageComponent & { mask: PimcoMaskSubstitution }) {
      this.workCtx.clearRect(0, 0, this.workWidth, this.workHeight);
      await renderer.drawSubstitution(pimco, this.workCtx, this.workWidth, this.workHeight);
      this.frameCtx1.globalCompositeOperation = "source-over" as any;
      this.frameCtx1.globalAlpha = 1.0;
      this.frameCtx1.drawImage(
        this.workCanvas,
        0,
        0,
        this.workWidth,
        this.workHeight,
        0,
        0,
        this.workWidth,
        this.workHeight,
      );
    },

    /**
     * This will take the latest version of the orderedPimcos value and redraw whatever
     * values in that on to frameCanvas1. Note that it doesn't do anything to the mainCanvas.
     */
    async updateFrame(): Promise<void | false> {
      // Check the currentJSON to see if we need to update the frames
      // Only check with the 2D renderer, because the 3D renderer get's
      // laggy for some reason
      if (this.productRenderingContext == "2D" && this.OS !== "iOS") {
        const newJSON = JSON.stringify([this.orderedPimcos, this.canvasX, this.canvasY]);
        if (newJSON === this.currentJSON) return;
      }

      const currentFrameData = this.currentPimcos;
      // Do some projection data replacing if the tool was used to modify the projection
      if (starters.dev && params.has("projection-effect-tool") && window["__projAlt__"]) {
        for (let i = 0; i < currentFrameData.length; i++) {
          const pimco = currentFrameData[i];
          if (
            pimco.mask instanceof Object &&
            pimco.mask.projection?.identifier &&
            window["__projAlt__"][pimco.mask.projection.identifier]
          ) {
            pimco.mask.projection = Object.assign(
              {},
              pimco.mask.projection,
              window["__projAlt__"][pimco.mask.projection.identifier],
            );
          }
        }
      }

      const regionMapPromises: Array<Promise<any>> = [];
      const doRegionMap = params.getBool("region-map") || this.product.regionmap;
      if (doRegionMap) {
        regionMapPromises.push(regionmap.resetRegionMap(this.canvasSizeX, this.canvasSizeY));
      }
      // Only process region layers if the canvas is at least 400px wide
      const processRegionLayers = this.mainCanvas && this.mainCanvas.width >= 400;

      const useNew2DRenderModule = params.has("new-render-2d") ? params.getBool("new-render-2d") : true;
      if (this.productRenderingContext == "THREE") {
        window["workFrameCanvas1"] = this.frameCanvas1;
        threedee.render(this.frameCtx1);
      } else if (useNew2DRenderModule) {
        await renderer.draw(
          currentFrameData,
          this.frameCtx1,
          this.workWidth,
          this.workHeight,
          processRegionLayers
            ? (getImageData, pimco) => {
                if (!doRegionMap) return;
                if (!pimco.regionid) return;
                const key = regionmap.generatePimcoKey(pimco);
                const isCached = regionmap.isInCacheLibrary(key);
                const imageData = isCached ? new ImageData(1, 1) : getImageData();
                if (!imageData) return;
                regionMapPromises.push(regionmap.applyImageDataToRegionBuffer(imageData, pimco.regionid, key));
              }
            : undefined,
        );
      } else {
        this.frameCtx1.clearRect(0, 0, this.workWidth, this.workHeight);

        await this.loadImages();

        // loop through the currentFrameData indexes and pass that
        // number in to the drawStack() method, await'ing each time.
        for (let i = 0; i < currentFrameData.length; i++) {
          // Check to see if the pimco image is a data object instead
          if (!(currentFrameData[i].mask instanceof Object)) {
            await this.drawStack(currentFrameData[i]);
          } else {
            // It's an object then? Okay, it should have the nessecary data to render
            // without a mask or any highlights
            await this.drawSubstitution(currentFrameData[i]);
          }
        }
      }

      // Render the regions to the region buffer
      if (doRegionMap) {
        await Promise.all(regionMapPromises);
        regionmap
          .renderRegionBufferFromQueue(params.getBool("region-map-debug"))
          .catch((e) => {
            console.error(e);
            if (params.getBool("region-map-debug")) {
              const regionCanvas = document.querySelector<HTMLCanvasElement>("#region-canvas");
              if (regionCanvas) {
                const regionCtx = regionCanvas.getContext("2d")!;
                regionCtx.clearRect(0, 0, regionCanvas.width, regionCanvas.height);
              }
            }
          })
          .then((regionBuffer) => {
            if (!regionBuffer) return;
            if (params.getBool("region-map-debug")) {
              let regionCanvas = document.querySelector<HTMLCanvasElement>("#region-canvas");
              if (!regionCanvas) {
                regionCanvas = document.createElement("canvas");
                regionCanvas.id = "region-canvas";
                regionCanvas.style.position = "absolute";
                regionCanvas.style.top = "0";
                regionCanvas.style.left = "0";
                regionCanvas.style.zIndex = "100";
                document.body.appendChild(regionCanvas);
              }
              regionCanvas.width = regionBuffer.width;
              regionCanvas.height = regionBuffer.height;
              regionCanvas.style.width = regionBuffer.width + "px";
              regionCanvas.style.height = regionBuffer.height + "px";

              const regionCtx = regionCanvas.getContext("2d")!;
              regionCtx.putImageData(regionBuffer, 0, 0);
            }
          });
      }
    },

    /**
     * This takes care of ensuring the latest version of the product is drawn on frameCanvas1
     * and then swaps the mainCanvas between what is drawn on frameCanvas2 and frameCanvas1,
     * ultimately blitting frameCanvas1 on to frameCanvas2 and checking if there are more updates
     * and calling itself again if needed.
     */
    changeFrames(instant = false, override = false): void {
      let newJSON = "";
      if (this.OS !== "iOS") {
        // Only do this check on non-iOS devices since iOS
        // uses passive scan to render the product
        newJSON = JSON.stringify([this.orderedPimcos, this.canvasX, this.canvasY]);
        instant = instant || newJSON === this.currentJSON;
      }
      if ((this.changingFrames || this.changingTextures || this.changingMeshes) && override !== true) {
        // currently in the process, just return
        return;
      }
      // block other update calls
      if (!instant) {
        this.changingFrames = true;
      }
      // mark the pimcoUpdates as false so we can detect if there is another update
      // that happens between the time that we start the frame swap and when we're done.
      // This is necessary because part of a frame swap can be loading images from the
      // server, which may cause a delay in the swap to happen while the user is still
      // able to keep making changes on the product.
      this.pimcoUpdates = false;

      requestAnimationFrame(async () => {
        if (this.mainCanvas != null) {
          // make sure we've got the latest version on frameCanvas1 that we'll switch to
          const forward = await this.updateFrame();
          if (newJSON) {
            this.currentJSON = newJSON;
          }
          if (forward === false) return;

          // If we are on iOS or WebGL2 is not supported, don't do the crossfade
          if (this.OS == "iOS" || !WebGLPostProcessor.isWebGL2Supported() || instant) {
            this.mainCtx.clearRect(0, 0, this.mainCanvas.width, this.mainCanvas.height);
            this.mainCtx.drawImage(
              this.frameCanvas1,
              0,
              0,
              this.frameCanvas1.width,
              this.frameCanvas1.height,
              0,
              0,
              this.mainCanvas.width,
              this.mainCanvas.height,
            );
            // Since we are doing an instaneous swap, we need to draw frameCanvas1 on to frameCanvas2
            this.frameCtx2.clearRect(0, 0, this.workWidth, this.workHeight);
            this.frameCtx2.drawImage(
              this.frameCanvas1,
              0,
              0,
              this.frameCanvas1.width,
              this.frameCanvas1.height,
              0,
              0,
              this.workWidth,
              this.workHeight,
            );
            this.changingFrames = false;
            return;
          }
          // this is to track where we're at in the animation process
          // when it hits 1.0 then it ends
          let currSwapOpacity = 0.05;
          const animationHandle = effects.startSpecialCrossFadeAnimation(
            this.frameCanvas2,
            this.frameCanvas1,
            this.mainCtx,
          );

          const frameTransition = () => {
            // let's just clamp this at 1.0 since js math isn't always clean
            currSwapOpacity = Math.min(currSwapOpacity, 1.0);

            // clear out the main canvas
            this.mainCtx.clearRect(0, 0, this.canvasX, this.canvasY);

            animationHandle.step(currSwapOpacity);

            if (currSwapOpacity >= 1.0) {
              // we're done with the transition
              // animationHandle.step(0.1);
              animationHandle.end();
              // blit frame1 to frame2
              this.frameCtx2.clearRect(0, 0, this.workWidth, this.workHeight);
              this.frameCtx2.drawImage(
                this.frameCanvas1,
                0,
                0,
                this.workWidth,
                this.workHeight,
                0,
                0,
                this.workWidth,
                this.workHeight,
              );
              // Also blit to main canvas to ensure it's fully drawn
              this.mainCtx.clearRect(0, 0, this.canvasX, this.canvasY);
              this.mainCtx.drawImage(
                this.frameCanvas1,
                0,
                0,
                this.frameCanvas1.width,
                this.frameCanvas1.height,
                0,
                0,
                this.canvasX,
                this.canvasY,
              );
              this.changingFrames = false;

              // do we have any further updates on the queue?
              if (this.pimcoUpdates) {
                // yes, go ahead and run again
                this.changeFrames();
                // } else {
                //   // The image is final, send the image data url to the store so other components can use it
                //   this.sendImageDataToStore();
              }
            } else {
              // increment the opacity
              currSwapOpacity += 0.06;
              requestAnimationFrame(frameTransition);
            }
          };
          frameTransition();
        }
      });
    },
    // this is just used for the observer but only calls the resizeCanvas() method
    resizeCanvasHandler(entries: ReadonlyArray<ResizeObserverEntry>, observer: ResizeObserver): void {
      if (this.sizingMode == "fill") {
        const entry = entries[0];
        this.canvasContainerSizeX = entry.contentRect.width;
        this.canvasContainerSizeY = entry.contentRect.height;
        // Changing the canvas container size will trigger a resizeCanvas call so we don't need to call it here
      } else {
        this.resizeCanvas();
      }
    },
    // ensures all of the dimensions are correct on canvases for faster processing/blitting
    resizeCanvas() {
      if (this.mainCanvas != null && this.canvasContainer != null) {
        this.updatedSize = true;
        // determine what the new size of the canvas should be.
        // the base size will be the lesser of the width and height
        const containerWidth = this.canvasContainer.clientWidth;
        const containerHeight = this.canvasContainer.clientHeight;

        const productImageX = this.productImageDimensions[0];
        const productImageY = this.productImageDimensions[1];
        this.updateWorkDimensions();

        // Set this to true if the container height is squishing the image vertically
        const tooShort = productImageX / productImageY < containerWidth / containerHeight;

        // safety valve here: if the canvas size is less than 0, then the canvasSize will default
        // to base product dimensions, which the default product image size.
        if (containerWidth == 0 || containerHeight == 0) {
          this.canvasSizeX = productImageX;
          this.canvasSizeY = productImageY;
        } else if (tooShort) {
          this.canvasSizeY = Math.min(containerHeight, productImageY);
          this.canvasSizeX = Math.floor((productImageX / productImageY) * this.canvasSizeY);
        } else {
          this.canvasSizeX = Math.min(containerWidth, productImageX);
          this.canvasSizeY = Math.floor((productImageY / productImageX) * this.canvasSizeX);
        }

        // Only resize the main canvas if the fillScaleLock is not enabled
        if (!this.fillScaleLock) {
          // Set the canvas size to correlate to devicePixelRatio if device is 600px or smaller
          this.mainCanvas.width = this.canvasX;
          this.mainCanvas.height = this.canvasY;

          if (containerWidth == 0 || containerHeight == 0) {
            // just set the css size to 0 for both
            this.mainCanvas.style.width = "0px";
            this.mainCanvas.style.height = "0px";
          } else {
            this.mainCanvas.style.width = this.canvasSizeX + "px";
            this.mainCanvas.style.height = this.canvasSizeY + "px";
          }
          this.mainCtx.clearRect(0, 0, this.canvasX, this.canvasY);
        }

        if (!this.changingFrames && this.mainCanvas.height > 0) {
          // draw frameCanvas2 back on to mainCanvas as the resizing has
          // cleared out what was already there. Note that we are using
          // the full 9-argument syntax for drawImage() to ensure the image
          // is sized correctly on the mainCanvas
          this.mainCtx.globalAlpha = 1.0;

          // If we are in fill mode, we need to size the canvas using contain style
          if (this.sizingMode !== "fill") {
            // Source and target aspect ratios are similar enough to use the default drawImage method
            this.mainCtx.drawImage(
              this.frameCanvas2,
              0,
              0,
              this.workWidth,
              this.workHeight,
              0,
              0,
              this.canvasX,
              this.canvasY,
            );
          } else {
            // The source and target have different aspect ratios, so we need to calculate the
            // correct draw width, draw height, and offsets to contain the image
            // We ran into terrible, unexplainable bugs when I tried using drawImage to simulate contain
            // sizing. It was one of the weirdest things I've ever seen. So instead, we are going to lock
            // the canvas width / height during resize and use CSS object-fit: contain to do the job.
            // We should have already set fillScaleLock to true by now
          }
        }
      }
    },
    sendImageDataToStore() {
      if (this.frameCanvas1 && this.frameCanvas2) {
        this.$nextTick(() => {
          // going to draw back on frame1 but with a white background first
          this.frameCtx1.save();
          this.frameCtx1.globalAlpha = 1.0;
          this.frameCtx1.globalCompositeOperation = "destination-over" as any;
          this.frameCtx1.fillStyle = "#ffffff";
          this.frameCtx1.fillRect(0, 0, this.canvasSizeX, this.canvasSizeY);
          this.frameCtx1.drawImage(
            this.frameCanvas2,
            0,
            0,
            this.workWidth,
            this.workHeight,
            0,
            0,
            this.workWidth,
            this.workHeight,
          );
          this.frameCtx1.restore();
          this.frameCanvas1.toBlob((blob) => {
            if (blob) {
              const url = URL.createObjectURL(blob);
              this.setProductImageDataURL(url);
            }
          });
        });
      }
    },
    onArrowKeyPress(e: KeyboardEvent) {
      if (document.activeElement === document.body && !e.shiftKey) {
        if (e.key === "ArrowRight") {
          this.incrementProductView();
        } else if (e.key === "ArrowLeft") {
          this.decrementProductView();
        }
      }
    },
    passiveScan() {
      if (this.productRenderingContext == "2D") {
        setTimeout(() => {
          const newJSON = JSON.stringify(this.orderedPimcos);
          if (newJSON !== this.currentJSON || this.updatedSize) {
            this.currentJSON = newJSON;
            this.currentPimcos = this.orderedPimcos;
            this.pimcoUpdates = true;
            this.updatedSize = false;
            this.changeFrames();
          }
          this.passiveScan();
        }, 100);
      } else {
        setTimeout(() => {
          const newJSON = JSON.stringify(this.materialPimcos3D);
          if (newJSON !== this.currentJSON || (this.updatedSize && !this.fillScaleLock)) {
            this.currentJSON = newJSON;
            this.pimcoUpdates = true;
            this.updatedSize = false;
            this.changeFrames(true);
          }
          this.passiveScan();
        }, 1000);
      }
    },
    async updateWorkDimensions() {
      let [width, height] = this.productImageDimensions;
      // Adjust the width and height if the available screen size requires it
      const screenWidth = (starters.dev ? innerWidth : screen.availWidth) * devicePixelRatio;
      const screenHeight = (starters.dev ? innerHeight : screen.availHeight) * devicePixelRatio;
      if (width > screenWidth) {
        height = Math.floor((height / width) * screenWidth);
        width = screenWidth;
      }
      if (height > screenHeight) {
        width = Math.floor((width / height) * screenHeight);
        height = screenHeight;
      }
      // Check if the width or height is different from the current workWidth or workHeight
      if (!(width != this.workWidth || height != this.workHeight)) return;
      // Grab a worker canvas to temporarily draw the image on to
      const worker = await CanvasWorkers.request(this.workWidth, this.workHeight);
      worker.ctx.drawImage(this.workCanvas, 0, 0, this.workWidth, this.workHeight, 0, 0, width, height);
      this.workWidth = width;
      this.workHeight = height;
      this.updateCanvasSizes(width, height);
      // Now that the work dimensions are updated, draw the image back on to the work canvas
      this.workCtx.drawImage(worker.canvas, 0, 0, width, height, 0, 0, this.workWidth, this.workHeight);
      worker.release();
    },
    async updateCanvasSizes(width: number, height: number) {
      if (starters.dev) {
        if (window["_trmTimer"] !== undefined) {
          clearTimeout(window["_trmTimer"]);
        }
        if (!window["_trmImageData"]) {
          window["_trmImageData"] = this.frameCtx1.getImageData(
            0,
            0,
            this.frameCanvas1.width,
            this.frameCanvas1.height,
          );
        }
        window["_trmTimer"] = setTimeout(() => {
          window["_trmTimer"] = undefined;
          delete window["_trmImageData"];
          this.changeFrames(true);
        }, 500);
      }
      // Update the canvas sizes like we came here to do
      this.workCanvas.width = this.colorCanvas.width = this.frameCanvas1.width = this.frameCanvas2.width = width;
      this.workCanvas.height = this.colorCanvas.height = this.frameCanvas1.height = this.frameCanvas2.height = height;

      // Put the image back on to frameCanvas1 & frameCanvas2
      if (starters.dev && window["_trmImageData"]) {
        const worker = await CanvasWorkers.request(window["_trmImageData"].width, window["_trmImageData"].height);
        worker.ctx.putImageData(window["_trmImageData"], 0, 0);
        this.frameCtx1.drawImage(worker.canvas, 0, 0, worker.width, worker.height, 0, 0, width, height);
        this.frameCtx2.drawImage(worker.canvas, 0, 0, worker.width, worker.height, 0, 0, width, height);
        worker.release();
      }
    },
    initializeRegionMap() {
      if (!this.product?.regionmap) return;
      // If the region map param was explicitly set to falsy, then don't initialize the region map
      if (params.has("region-map") && !params.getBool("region-map")) return;
      // Add the region map interface to be globally available so the pimco compiler can use it
      if (!("regionMapInterface" in window)) {
        (window as any).regionMapInterface = regionmap;
      }
      // Setup the region map click event listener on the canvas
      if (this.mainCanvas && !this.mainCanvas.hasAttribute("data-region-map-ready")) {
        this.mainCanvas.setAttribute("data-region-map-ready", "");
        this.mainCanvas.addEventListener("click", this.gotoCanvasRegionSteps);
      }
    },
    async gotoCanvasRegionSteps(e: MouseEvent) {
      // Grab the x and y coordinates of the click event on the canvas in normalized coordinates
      const x = e.offsetX / this.canvasSizeX;
      const y = e.offsetY / this.canvasSizeY;
      // Grab the region data from the region map
      const stepIDs = await regionmap.getStepListFromCoords(x, y);
      if (!stepIDs.length) return;
      // Loop through the step IDs and compare them to product attributes
      // to find the correct step to go to
      let attributeIndex = -1;
      let attribute: Attribute | null = null;
      for (let i = 0; i < stepIDs.length; i++) {
        const stepID = stepIDs[i];
        attributeIndex = this.filteredAttributeIDs.indexOf(stepID);
        if (attributeIndex !== -1) {
          attribute = this.filteredAttributes[attributeIndex];
          break;
        }
      }
      if (attributeIndex === -1 || !attribute) return;
      // Loop through the step list again and find the sub attributes
      const subAttributeSteps =
        "attributes" in attribute && attribute.attributes
          ? stepIDs.filter((stepID) => attribute!["attributes"]?.includes(stepID))
          : [];
      // If the sub attribute ID is empty, then we can just go to the attribute
      if (!subAttributeSteps.length) {
        this.setCurrentAttribute(attributeIndex);
        return;
      }
      // Otherwise set both attributes
      this.setAttributes({ attribute: attributeIndex, subAttribute: subAttributeSteps });
    },
    trackUserControls3D() {
      this.controls3D?.addEventListener("mousedown", this.trackUserControls3DStart);
      this.controls3D?.addEventListener("touchstart", this.trackUserControls3DStart);
    },
    trackUserControls3DStart(e: MouseEvent | TouchEvent) {
      if (e instanceof MouseEvent && e.button !== 0) return;
      e.preventDefault();
      // Cancel any threedee animation happening
      threedee.cancelAnimation();
      // Create the overlay div for user mouse tracking
      const overlay = document.createElement("div");
      overlay.style.position = "fixed";
      overlay.style.inset = "0";
      overlay.style.zIndex = "10000";
      overlay.style.cursor = "grabbing";
      document.body.appendChild(overlay);
      document.body.style.userSelect = "none";
      this.mouseTrackingOverlay = overlay;

      overlay.addEventListener("mousemove", this.trackUserControls3DMove);
      this.controls3D?.addEventListener("touchmove", this.trackUserControls3DMove);
      // window['userControls3DInterval'] = setInterval(() => {
      //   this.trackUserControls3DMove(e);
      // }, 100);
      window.addEventListener("mouseup", this.trackUserControls3DEnd);
      window.addEventListener("touchend", this.trackUserControls3DEnd);
      // Set the start position of the mouse/finger movement
      const isTouchEvent = this.isTouchEvent(e);
      if (isTouchEvent && e.touches.length > 1) {
        // This is a multi-touch event, we can use this to rotate along the Z axis
        // Capture the starting angle of the touches
        this.thetaZ = Math.atan2(
          e.touches[0].clientY - e.touches[1].clientY,
          e.touches[0].clientX - e.touches[1].clientX,
        );
        this.twoTouchRotation = true;
        window["startThetaZ"] = this.thetaZ;
        window["startDist"] = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY,
        );
      }
      this.lastMousePosX = isTouchEvent ? e.touches[0]?.clientX || 0 : e.clientX;
      this.lastMousePosY = isTouchEvent ? e.touches[0]?.clientY || 0 : e.clientY;
    },
    async trackUserControls3DMove(e: MouseEvent | TouchEvent) {
      // This code is commented out, but we might use it later to smooth animate
      // the movements between longer mouse event intervals
      e.preventDefault();
      // const now = Date.now();
      // if (now - this.lastFrameUpdate < 50) {
      //   return;
      // }
      // this.lastFrameUpdate = now;
      let updateLastPos = false;
      let newX = 0;
      let newY = 0;
      let deltaX = 0;
      let deltaY = 0;
      let deltaZ = 0;
      const isTouchEvent = this.isTouchEvent(e);
      if (isTouchEvent && e.touches.length > 1) {
        // Get the angle change from the starting Z angle
        const newThetaZ = Math.atan2(
          e.touches[0].clientY - e.touches[1].clientY,
          e.touches[0].clientX - e.touches[1].clientX,
        );
        if (this.twoTouchRotation) {
          deltaZ = this.thetaZ - newThetaZ;
          // If twoTouchRotation is true, then start params are set in the window
          const startThetaZ = window["startThetaZ"];
          let totalDeltaZ = (Math.abs(startThetaZ - newThetaZ) * 180) / Math.PI;
          if (window["maxThetaZ"] === undefined || totalDeltaZ > window["maxThetaZ"]) {
            window["maxThetaZ"] = totalDeltaZ;
          } else {
            totalDeltaZ = window["maxThetaZ"];
          }
          const startDist = window["startDist"];
          const currentDist = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY,
          );
          let distDelta = currentDist - startDist;
          const distSign = Math.sign(distDelta);
          distDelta = Math.abs(distDelta);
          // If the distance between the touches is greater than 50px and the angle change is less than 8 degrees, then we can assume
          // the user is trying to zoom in or out
          const angleThreshholdLow = 8;
          const angleThreshholdHi = 10;
          const angleScale = Math.max(
            0,
            Math.min((totalDeltaZ - angleThreshholdHi) / (angleThreshholdLow - angleThreshholdHi), 1),
          );
          const zoomDistThresholdLow = 20;
          const zoomDistThresholdHi = 200;
          const zoomAlpha = Math.max(
            0,
            Math.min((distDelta - zoomDistThresholdLow) / (zoomDistThresholdHi - zoomDistThresholdLow), 1),
          );
          const scale = zoomAlpha * 0.3 * angleScale * distSign + 1.0;
          // this.zoomScale = this.cubicEasing(zoomAlpha * angleScale) * (this.maxZoom - 1.0) + 1.0;
          this.zoomScale = Math.max(1.0, Math.min(this.zoomScale * scale, this.maxZoom));
          // deltaZ *= (1.0 - zoomAlpha);
        }
        this.thetaZ = newThetaZ;
        this.twoTouchRotation = true;
        if (typeof window["startThetaZ"] === "undefined") {
          window["startThetaZ"] = this.thetaZ;
          window["startDist"] = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY,
          );
        }
      } else {
        // This is a normal movement, so just calc the delta
        newX = isTouchEvent ? e.touches[0]?.clientX || 0 : e.clientX;
        newY = isTouchEvent ? e.touches[0]?.clientY || 0 : e.clientY;
        deltaX = newX - this.lastMousePosX;
        deltaY = newY - this.lastMousePosY;
        updateLastPos = true;
      }

      if (!isTouchEvent) {
        // Dampen the movement of the lesser axis if the greater axis has 5x the movement
        if (deltaX === 0) {
          // No dampening required, let's just avoid division by zero
        } else if (deltaY === 0) {
          // No dampening required, let's just avoid division by zero
        } else {
          const horzontalRatio = Math.abs(deltaX / deltaY);
          const verticalRatio = Math.abs(deltaY / deltaX);
          const xDampening = Math.min(1.0, Math.sqrt(Math.max(0.0, (horzontalRatio - 0.2) / (5.0 - 0.2))));
          const yDampening = Math.min(1.0, Math.sqrt(Math.max(0.0, (verticalRatio - 0.2) / (5.0 - 0.2))));
          deltaX *= xDampening;
          deltaY *= yDampening;
        }
      }

      if (isTouchEvent && (deltaX !== 0 || deltaY !== 0)) {
        // Incorporate easing into the movement, slower movements are easier to control
        const curveEnd = 2; // The point at which the curve ends and the linear starts

        const signX = Math.sign(deltaX);
        const signY = Math.sign(deltaY);
        deltaX = Math.abs(deltaX);
        deltaY = Math.abs(deltaY);

        deltaX = deltaX < curveEnd ? (deltaX * deltaX) / (2 * curveEnd) : deltaX - curveEnd / 2;
        deltaY = deltaY < curveEnd ? (deltaY * deltaY) / (2 * curveEnd) : deltaY - curveEnd / 2;

        deltaX *= signX;
        deltaY *= signY;
      }

      const { transformation, THREE } = await threedee.initialize();
      this.threeJSReady = true;

      const movementScalar = isTouchEvent ? 4.7 / Math.sqrt(this.zoomScale) : 10;

      if (e.shiftKey) {
        // Scale the rotation down by five to make the controls finer
        deltaX /= 5;
        deltaY /= 5;
      }

      if (e.metaKey && starters.dev) {
        const thetaX = deltaX / 100;
        const thetaY = deltaY / 100;
        threedee.setCameraPosition(thetaX, thetaY);
      } else if (deltaZ !== 0) {
        transformation.makeRotationZ(deltaZ);
        threedee.triggerTransformChangeEvent();
      } else {
        const thetaX = (deltaY / innerWidth) * movementScalar;
        const thetaY = (deltaX / innerHeight) * movementScalar;
        transformation.makeRotationY(thetaY).multiply(new THREE.Matrix4().makeRotationX(thetaX));
        threedee.triggerTransformChangeEvent();
        window["__moved_transform_controls__"] = 1;
      }

      if (updateLastPos) {
        this.lastMousePosX = newX;
        this.lastMousePosY = newY;
      }

      const fov = this.calculateFOV3D();
      threedee.setCameraFOV(fov);
      this.dynamicFOV3D = fov;

      const frameLength = params.isNumber("frame-rate")
        ? Math.max(1000 / params.getNumber("frame-rate") || 16, 16)
        : 16;

      if (this.lastMouseUpdateID) {
        clearTimeout(this.lastMouseUpdateID);
      }
      this.lastMouseUpdateID = setTimeout(
        () => {
          this.lastMouseUpdateID = null;
          this.lastFrameUpdate = Date.now();
          this.changeFrames(true);

          // This code is commented out, but we might use it later to smooth animate
          // the movements between longer mouse event intervals
          // threedee.animateModelRotation([this.thetaX, this.thetaY], 50, () => this.changeFrames(true));
        },
        Math.max(-1, frameLength - (Date.now() - this.lastFrameUpdate)),
      );
    },
    async trackUserControls3DEnd() {
      // If the mouse was recently released, count it as a double-click and reset the transformation
      let controlsWereReset = false;
      const now = Date.now();
      if (now - this.lastMouseDown < 300) {
        this.resetUserControls3D();
        controlsWereReset = true;
      }
      this.lastMouseDown = now;
      this.mouseTrackingOverlay?.removeEventListener("mousemove", this.trackUserControls3DMove);
      this.controls3D?.removeEventListener("touchmove", this.trackUserControls3DMove);
      window.removeEventListener("mouseup", this.trackUserControls3DEnd);
      window.removeEventListener("touchend", this.trackUserControls3DEnd);
      document.body.style.userSelect = "";
      this.mouseTrackingOverlay?.remove();
      this.mouseTrackingOverlay = null;
      // Blit the contents of the frameCanvas1 to frameCanvas2
      this.frameCtx2.clearRect(0, 0, this.workWidth, this.workHeight);
      this.frameCtx2.drawImage(
        this.frameCanvas1,
        0,
        0,
        this.frameCanvas1.width,
        this.frameCanvas1.height,
        0,
        0,
        this.workWidth,
        this.workHeight,
      );
      // Reset the transformation to an identity matrix
      const { transformation } = await threedee.initialize();
      transformation.identity();
      // Reset the tracked values
      this.thetaX = 0.0;
      this.thetaY = 0.0;
      this.thetaZ = 0.0;
      this.twoTouchRotation = false;
      delete window["startThetaZ"];
      delete window["startDist"];
      delete window["maxThetaZ"];
      if (!controlsWereReset && window["__moved_transform_controls__"] !== undefined) {
        // Sync the new transformation with the view in the Vue state
        this.setProductView({ unit: "radians", view: threedee.getModelRotation() });
        delete window["__moved_transform_controls__"];
      }
    },
    resetUserControls3D() {
      const [angleIndex] = threedee.getAngleIndicesSortedByClosest(this.productViews);
      const angle: [number, number, number] = angleIndex > -1 ? this.productViews[angleIndex] : [0, 0, 0];
      // See how different the current angle is from the new angle using dot product. If they
      // are basically the same angle (dot is nearly 1), then don't run the reset animation.
      // Instead just increment the view to the next one.
      const newAngleDiff = threedee.getRotationDistance(angle);
      // The angle diff must be greater than 0.013948 radians to trigger the reset animation
      if (newAngleDiff < 0.013948) {
        this.incrementProductView();
        return;
      }
      threedee.animateModelRotation(angle, 1000, this.cubicEasing);
      threedee.onAnimationProgress((progress) => {
        progress = this.cubicEasing(Math.min(progress * 2.0, 1.0));
        // Interpolate the zoom between the current zoom and the default zoom
        if (window["startZoom"] === undefined) {
          window["startZoom"] = this.zoomScale;
        }
        this.zoomScale = utils.lerp(window["startZoom"], 1.0, progress);
        if (progress === 1.0) {
          delete window["startZoom"];
        }
      });
      this.lastMousePosX = 0;
      this.lastMousePosY = 0;
      this.thetaX = 0.0;
      this.thetaY = 0.0;
      this.thetaZ = 0.0;
    },
    init3DContext() {
      if (this.threeJSReady) return;
      // Setup the mouse/touch controls for ThreeDee interaction
      if (this.productRenderingContext == "THREE" || this.productRenderingContext == "WEBGL") {
        threedee
          .initialize({
            meshes: this.meshes3D,
            lights: this.lights3D,
            globalTransform: (this.model as Model)?.globaltransform3d || undefined,
            fov: this.fieldOfView3D,
            cameraPosition: (this.model as Model)?.camera?.position || undefined,
            render: this.quickRender,
          })
          .then(() => {
            this.trackUserControls3D();
            this.threeJSReady = true;
            if (typeof this.modelFOV == "object") {
              const func = createNumericalFormula(this.modelFOV);
              this.dynamicFOV3DFunction = () => func(this.zoomScale);
              this.dynamicFOV3D = this.dynamicFOV3DFunction() / this.zoomScale;
            }
          });
        threedee.onAnimationFinish((state) => {
          // If the animation is finished, we need to update the thetaX and thetaY
          // This looks backwards, but horizontal movement results in a rotation along the y axis
          // and vertical movement results in a rotation along the x axis
          this.thetaX = state.y;
          this.thetaY = state.x;
          this.thetaZ = state.z;
        });
      }
    },
    onThreeJSReady(callback: () => void) {
      if (this.threeJSReady) {
        callback();
        return;
      }
      let maxTimer: any = -1;
      const interval = setInterval(() => {
        if (this.threeJSReady) {
          if (maxTimer !== -1) {
            clearTimeout(maxTimer);
          }
          clearInterval(interval);
          callback();
        }
      }, 100);
      maxTimer = setTimeout(() => {
        clearInterval(interval);
        console.error("ThreeJS did not initialize in time");
      }, 20000);
    },
    async renderMaterialTextures() {
      if (this.productRenderingContext == "2D") {
        return;
      }
      if (this.materialRenderInProgress) {
        // If a material render is already in progress, then set the flag
        // that another render is needed once the current one is done
        this.materialRenderNeedsUpdate = true;
        return;
      }
      this.materialRenderInProgress = true;
      const threeContext = threedee.getModificationContext();
      const value = this.materialPimcos3D;
      if (Object.keys(value).length) {
        const [width, height] = this.frameMaterialSize;
        const textures: Record<string, ImageData | ThreeJSTexture> = {};
        const keys = Object.keys(value) as MaterialTextureName[];
        for (let i = 0; i < keys.length; i++) {
          const key = keys[i];
          const pimcos: ProductImageComponent[] = value[key];
          // Check for the HDR pimco set
          let hdrPimco: ProductImageComponent | null = null;
          if (
            key == "env" &&
            (hdrPimco =
              pimcos.find((p) => p.mode == "image" && (p.texture?.includes(".hdr") || p.texture?.includes(".exr"))) ||
              null)
          ) {
            const tex = await threedee.loadHdrTexture(hdrPimco.texture!);
            if (tex) {
              if ("alpha" in hdrPimco) {
                tex["_intensity"] = hdrPimco.alpha;
              }
              textures[key] = tex;
            }
          } else {
            const worker = await canvasWorkers.request(width, height, 90000);
            worker.ctx.clearRect(0, 0, width, height);
            await renderer.draw(pimcos, worker.ctx, width, height);
            textures[key] = worker.ctx.getImageData(0, 0, width, height);
            worker.release();
          }
        }
        threeContext.setMaterialTextures(textures);

        if (starters.dev && params.has("debug-pbr")) {
          let i = 0;
          const offset = Math.min(200, Math.floor(innerWidth / Object.keys(textures).length));
          for (const key in textures) {
            const texture = textures[key];
            // console.log(key, tags[key]);
            if (texture instanceof ImageData) {
              const size = params.getString("debug-pbr-full") == key ? texture.width : offset;
              this.debugPBRTexture(key as MaterialTextureName, texture, size, offset, i);
              i++;
            }
          }
        }
      } else {
        // Remove the materials from the meshes
        threeContext.setMaterialTextures({});
      }
      this.materialRenderInProgress = false;
      // If another material render was requested, then do it now
      if (this.materialRenderNeedsUpdate) {
        this.materialRenderNeedsUpdate = false;
        await this.renderMaterialTextures();
      }
    },
    async debugPBRTexture(name: MaterialTextureName, source: ImageData, size: number, offset: number, i: number) {
      if (!("cmpTestCanvases" in window)) {
        (window as any).cmpTestCanvases = {};
      }
      const canvasKey = `${name}_canvas`;
      const contextKey = `${name}_context`;
      const canvas = (window as any).cmpTestCanvases[canvasKey]
        ? (window as any).cmpTestCanvases[canvasKey]
        : document.createElement("canvas");
      const context = (window as any).cmpTestCanvases[contextKey]
        ? (window as any).cmpTestCanvases[contextKey]
        : canvas.getContext("2d");
      if (!(window as any).cmpTestCanvases[canvasKey]) {
        canvas.width = source.width;
        canvas.height = source.height;
        document.body.appendChild(canvas);
        canvas.style.position = "absolute";
        canvas.style.top = "0";
        canvas.style.zIndex = "100";
        canvas.id = canvasKey;
        (window as any).cmpTestCanvases[canvasKey] = canvas;
        (window as any).cmpTestCanvases[contextKey] = context;
      }
      canvas.style.left = `${i * offset}px`;
      canvas.style.width = `${size}px`;
      canvas.style.height = `${size}px`;

      context.clearRect(0, 0, canvas.width, canvas.height);
      context.putImageData(source, 0, 0);
    },
    isTouchEvent(e: MouseEvent | TouchEvent): e is TouchEvent {
      return "TouchEvent" in window && e instanceof TouchEvent;
    },
    calculateFOV3D() {
      let fov = this.fieldOfView3D;
      if (this.dynamicFOV3DFunction) {
        fov = this.dynamicFOV3DFunction() / this.zoomScale;
      }
      if (this.sizingMode == "fill") {
        const canvasAspectRatio = this.canvasContainerSizeX / this.canvasContainerSizeY;
        const aspectRatioFactor = Math.max(1, this.aspectRatio / canvasAspectRatio);
        fov *= aspectRatioFactor;
      }
      return fov;
    },
    quickRender() {
      // this used for 3d contexts only
      // Set the fov to the camera before we store the value in the data to by pass reactivity during animation
      const fov = this.calculateFOV3D();
      threedee.setCameraFOV(fov);
      this.dynamicFOV3D = fov;
      // Update the frame on the main canvas to the contents of rendered 3d scene
      this.changeFrames(true);
    },
    cubicEasing(t: number): number {
      return -2 * t * t * t + 3 * t * t;
    },
  },

  mounted() {
    //Get context of mainCanvas
    this.mainCtx = <CanvasRenderingContext2D>this.mainCanvas?.getContext("2d");

    if (this.canvasContainer != null) {
      // now make sure the sizing stays in sync with the container
      this.resizeObserver = new ResizeObserver(this.resizeCanvasHandler);
      this.resizeObserver.observe(this.canvasContainer);
    }
    // Make sure the work dimensions aspect ratio is correct
    if (this.productImageDimensions[0] / this.productImageDimensions[1] != this.workWidth / this.workHeight) {
      this.updateWorkDimensions();
    }
    (window as any).printWorkCanvasDimension = () => {
      if (this) {
        console.log(this.workWidth, this.workHeight);
      } else {
        console.log("Unknown");
      }
    };
    // get the sizing of the canvases correct
    this.resizeCanvas();
    document.addEventListener("keydown", this.onArrowKeyPress);

    // Start the passive scan rendering if we are running iOS
    if (this.OS === "iOS" || this.productRenderingContext == "THREE") {
      this.passiveScan();
    }
    // If we are debugging a THREE material, listen for material-3d-update events on the document
    if (params.get("m") == "3d-material-test" && starters.dev) {
      document.addEventListener("material-3d-update" as any, (e: CustomEvent) => {
        this.changeFrames();
      });
    }

    this.initializeRegionMap();
    // Wait for the model to be loaded before initializing the 3D context
    const init3DContext = () => {
      if (this.model || params.get("m") == "3d-material-test") {
        this.init3DContext();
        CanvasWorkers.setMode(this.productRenderingContext == "2D" ? "reuse" : "no-reuse");
      } else {
        setTimeout(init3DContext, 100);
      }
    };
    init3DContext();

    // If the right params were set, include a utility function to place 3D projected meshes
    if (starters.dev && params.has("projection-effect-tool")) {
      (window as any).replacePimcoSubProjection = (
        projectionData: Partial<PimcoMaskSubstitutionProjection> & { identifier: string },
      ) => {
        if (!projectionData.identifier) {
          console.error("No identifier was provided for the projection data");
          return;
        }
        if (!window["__projAlt__"]) {
          window["__projAlt__"] = {};
        }
        window["__projAlt__"][projectionData.identifier] = projectionData;
        setTimeout(() => {
          this.changeFrames(true);
        }, 100);
      };
    }
    // Add a globally accessible method that we can call from the checkout overlay
    // to get more accurate 3D model rotation poses for the generated image
    if (this.productRenderingContext == "THREE") {
      (window as any).set3DModelPose = async (x: number, y: number, z: number) => {
        if (!threedee.initialized) return;
        threedee.setModelRotation(x, y, z);
        // Set the fov to the camera before we store the value in the data to by pass reactivity during animation
        const fov = this.calculateFOV3D();
        threedee.setCameraFOV(fov);
        this.dynamicFOV3D = fov;
        // Wait for 50ms to allow the model to update
        await new Promise((resolve) => setTimeout(resolve, 50));
      };
    }
  },
  beforeUnmount() {
    // need to stop the resize observer from observing
    if (this.resizeObserver != undefined) {
      this.resizeObserver.disconnect();
    }
    document.removeEventListener("keydown", this.onArrowKeyPress);
    // Remove the special 3d render pose capture function
    delete window["capture3DModelPose"];
    threedee.cancelAnimation();
    this.threeJSReady = false;
  },
  setup() {
    const mainCanvas: Ref<HTMLCanvasElement | null> = ref(null);
    const canvasContainer: Ref<HTMLDivElement | null> = ref(null);
    const controls3D: Ref<HTMLDivElement | null> = ref(null);

    return { mainCanvas, canvasContainer, controls3D };
  },
});
</script>

<style lang="scss" scoped>
#canvas-container {
  position: absolute;
  width: 100%;
  height: 100%;
  // top: 0;
  // left: 50%;
  // transform: translateX(-50%);
  display: flex;
  justify-content: center;
  align-items: center;
  overflow: hidden;

  @media (min-width: 1350px) {
    width: 1350px;
  }
  @media (min-width: 1688px) {
    width: 80%;
  }
  &:is(.render-context-three, .render-context-webgl) {
    width: 100%;
    height: 100%;
    canvas {
      width: 100%;
      height: 100%;
    }
  }
  &.help-lights {
    background-color: #000;
  }
}
#main-canvas {
  width: 100%;
  height: 100%;
  &.contain {
    object-fit: contain;
    width: 100% !important;
    height: 100% !important;
  }
}
.controls-3d {
  position: absolute;
  inset: 0;
  cursor: grab;
}
</style>
