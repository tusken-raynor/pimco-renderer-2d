import data from "@/data";
import restrictions from "@/restrictions";
import storage from "@/storage";
import structure, { OptionCasing } from "@/structure";
import { actionsContext, starters } from "./initialize";
import getters from "./getters";
import { Attribute, Model, Option, Product, ProductImageComponent } from "@/types";
import cart from "@/cart";
import woocommerce from "@/woocommerce";
import share from "@/share";
import { saveData } from "./mutations";
import utils from "@/utils";
import renderer from "@/renderer";
import pimcos from "@/pimcos";
import { resetModelSelectionStorage } from ".";
import CanvasWorkers from "@/renderer/canvas-workers";
import threedee from "@/threedee";
import effects from "@/effects";
import params from "@/params";

type Marker = {
  id: "start" | "models" | "objects";
  created: number;
  updated: number;
  completed: boolean;
};
// Used to make sure that async data gets applied to the store in the correct order
const dataTracker: {
  markers: { [key: string]: Marker };
  callbacks: { [key: string]: Array<Function> };
  add: (marker: Marker) => boolean;
  remove: (id: "start" | "models" | "objects") => Marker | null;
  complete: (id: "start" | "models" | "objects", value?: boolean) => boolean;
  completed: (id: "start" | "models" | "objects") => boolean;
  onComplete: (id: "start" | "models" | "objects", callback: Function) => void;
  reset: () => void;
} = {
  markers: {},
  callbacks: {},
  add(marker: Marker) {
    if (marker.id in this.markers) {
      this.markers[marker.id].completed = marker.completed;
      this.markers[marker.id].updated = marker.updated;
      return false;
    } else {
      this.markers[marker.id] = marker;
      return true;
    }
  },
  remove(id: string) {
    if (id in this.markers) {
      const marker = this.markers[id];
      delete this.markers[id];
      return marker;
    }
    return null;
  },
  complete(id: string, value: boolean = true) {
    if (id in this.markers) {
      this.markers[id].completed = value;
      if (value && this.callbacks[id] && this.callbacks[id].length) {
        while (this.callbacks[id].length) {
          const callback = this.callbacks[id].shift() as Function;
          callback();
        }
      }
      return true;
    }
    return false;
  },
  completed(id: string) {
    if (id in this.markers) {
      return this.markers[id].completed;
    }
    return false;
  },
  onComplete(id: string, callback: Function) {
    if (this.markers[id] && this.markers[id].completed) {
      callback();
    } else {
      if (!(id in this.callbacks)) {
        this.callbacks[id] = [];
      }
      this.callbacks[id].push(callback);
    }
  },
  reset() {
    for (const id in this.markers) {
      if (Object.prototype.hasOwnProperty.call(this.markers, id) && id != "start") {
        delete this.markers[id];
      }
    }
  },
};

dataTracker.onComplete("objects", () => {
  if (starters.frame !== 0) {
    starters.frame = 0;
  }
});

window["dataTracker"] = dataTracker;

const actions = actionsContext({
  setCurrentAttribute({ commit, dispatch, state, getters }, value: number) {
    // These versions exist to ansychronously switch between attributes to allow time for the transition animation
    if (state.currentAttribute !== value && !state.attrTransitionBusy) {
      // If we've reached the end, attempt to open the checkout overlay
      if (value >= getters.getFilteredAttributes.length) {
        dispatch("proceedToCheckout");
      } else {
        state.attrTransitionBusy = true;
        setTimeout(() => {
          commit("setCurrentAttribute", value);
          setTimeout(() => {
            state.attrTransitionBusy = false;
          }, state.attrTransitionWait);
        }, state.attrTransitionWait);
      }
    }
  },
  incrementCurrentAttribute({ dispatch, state }) {
    // These versions exist to ansychronously switch between attributes to allow time for the transition animation
    dispatch("setCurrentAttribute", state.currentAttribute + 1);
  },
  decrementCurrentAttribute({ dispatch, state }) {
    // These versions exist to ansychronously switch between attributes to allow time for the transition animation
    dispatch("setCurrentAttribute", state.currentAttribute - 1);
  },
  setAttributes(
    { commit, dispatch, state, getters },
    value: {
      attribute: number | string;
      subAttribute: number | string | string[];
      subAttributeDelay?: number;
    }
  ) {
    if (state.attrTransitionBusy) return;
    const attributeIndex: number =
      typeof value.attribute === "string"
        ? getters.getFilteredAttributes.findIndex((attr: Attribute) => attr.id === value.attribute)
        : value.attribute;
    const subKey = typeof value.subAttribute === "number" ? "index" : "id";
    const subSelector =
      value.subAttribute instanceof Array
        ? value.subAttribute.map((sub) => `[data-sub-attr-entry-${subKey}="${sub}"]`).join(",")
        : `[data-sub-attr-entry-${subKey}="${value.subAttribute}"]`;
    // Handle setting the current attribute and sub attribute using the store
    // Its a little hacky because we rely on the DOM, but its so damn smooth
    if (state.currentAttribute !== attributeIndex) {
      // If we've reached the end, attempt to open the checkout overlay
      if (attributeIndex >= getters.getFilteredAttributes.length) {
        dispatch("proceedToCheckout");
      } else {
        state.attrTransitionBusy = true;
        setTimeout(async () => {
          commit("setCurrentAttribute", attributeIndex);
          setTimeout(() => {
            state.attrTransitionBusy = false;
          }, state.attrTransitionWait);
          if ("subAttributeDelay" in value) {
            await new Promise((resolve) => setTimeout(resolve, value.subAttributeDelay));
          }
          // Loop and check on each frame if the sub attribute element has been clicked
          // Check for 60 frames (1 second) before giving up
          let subAttributeEl: HTMLElement | null = null;
          let viewCount = 0;
          while (
            !(
              subAttributeEl &&
              subAttributeEl.hasAttribute("data-sub-attr-entry-current") &&
              subAttributeEl.isConnected
            ) &&
            viewCount < 60
          ) {
            subAttributeEl = document.querySelector<HTMLElement>(subSelector);
            if (subAttributeEl) {
              subAttributeEl.click();
            }
            await new Promise((resolve) => requestAnimationFrame(resolve));
            viewCount++;
          }
        }, state.attrTransitionWait);
      }
    } else {
      // In this case we are already on the correct attribute, so we just need to set the sub attribute
      const subAttributeEl = document.querySelector<HTMLElement>(subSelector);
      if (subAttributeEl) {
        subAttributeEl.click();
      }
    }
  },
  proceedToCheckout({ commit, getters }, prompt = true) {
    // Throw up the completion overlay showing incomplete steps if some remain
    if (!getters.getProductCompletionMinimal) {
      if (prompt) {
        // Throw a notification to let the user know the are
        // other steps that need to be finished
        commit("setSpecialPopup", {
          title: "Unfinished Business",
          message:
            "There are required attributes that have not been addressed. " +
            "Do you want to see which steps remain unfilled?",
          confirm: {
            label: "show me",
            callback: () => {
              commit("setCompletionOverlayRender", true);
              commit("setIncompletionShow", true);
            },
          },
        });
      } else {
        commit("setCompletionOverlayRender", true);
        commit("setIncompletionShow", true);
      }
    } else {
      // If everything passed the completeness test, proceed to checkout
      commit("setCheckoutOverlayRender", true);
    }
  },
  fetchStartData(context) {
    // Fetch the data for the start page
    data.fetchStartData().then((products) => {
      context.commit("addObjectIDs", products);
      context.commit("productsSet", products);
      structure.recieve(products, "products");
    });
    dataTracker.add({
      id: "start",
      created: Date.now(),
      updated: Date.now(),
      completed: false,
    });
    // woocommerce.onDataLoaded(() => {
    //   console.log('cheeser');

    // });
    structure.products().then((structure) => {
      context.commit("setStructure", { structure });
      dataTracker.complete("start");
    });
    data.fetch(location.pathname + "config/misc.json").then((response) => {
      if (response) {
        context.commit("miscSet", response.data);
      }
    });
  },
  fetchSeriesData(context) {
    // Fetch data fopr a specifically selected series
    data.fetchSeriesList(context.state.currentProduct).then((series) => {
      context.commit("addObjectIDs", series);
      context.commit("seriesSet", series);
      dataTracker.onComplete("start", () => {
        Object.keys(starters.series).forEach((key) => {
          const seriesID = starters.series[key];
          context.commit("setCurrentSeries", { product: key, value: seriesID });
        });
      });
    });
  },
  fetchModelData(context) {
    // Fetch data ffor the patterns page
    dataTracker.add({
      id: "models",
      created: Date.now(),
      updated: Date.now(),
      completed: false,
    });
    data.fetchModelData(context.state.currentProduct).then((models) => {
      context.commit("addObjectIDs", models);
      context.commit("modelsSet", models);
      structure.recieve(context.state.models, "models");
      dataTracker.onComplete("start", () => {
        const currentModels = utils.mapNested(context.state.selectedOptions, "model");
        Object.keys(currentModels).forEach((key) => {
          const modelID = currentModels[key] || starters.models[key];
          context.commit("setCurrentModel", { product: key, value: modelID });
        });
        woocommerce.onDataLoaded(() => {
          dataTracker.complete("models");
        });
      });
    });
  },
  fetchConfiguratorData(context) {
    // Fetch the data for build part of the process based off of model and possible series selection
    const modelID = context.getters.getModelID;
    dataTracker.add({
      id: "objects",
      created: Date.now(),
      updated: Date.now(),
      completed: false,
    });
    data.fetchConfiguratorData(modelID, context.getters.getSeriesID).then((data) => {
      // Check for an existing assets list, and throw it on the state if it exists
      if ("existingAssets" in data && data.existingAssets?.length) {
        context.commit("setExistingAssets", data.existingAssets);
        delete data.existingAssets;
      }
      for (const key in data) {
        if (Object.prototype.hasOwnProperty.call(data, key)) {
          const dataList = data[key as "attributes" | "options" | "leathers" | "pimcos"];
          context.commit("addObjectIDs", dataList);
          context.commit(key + "Set", dataList);
          // Now build the selections structure based of the data recieved
          structure.recieve((context.state as any)[key], key);
        }
      }
    });
    context.dispatch("buildStructure");
  },
  buildStructure(context) {
    const modelID = getters.getModelID(context.state);
    // Define a callable to apply any options saved in storage once the structure is loaded
    const storedModelSelections = storage.getValue("modelSelectionStorage");
    const storedSelections = storage.getValue("selections");
    const applySavedOptions = () => {
      if (storedModelSelections && storedModelSelections[modelID]) {
        storage.evaluateSelections(
          {
            [context.state.currentProduct]: {
              selections: storedModelSelections[modelID],
            },
          },
          context.state.selectedOptions,
          context.state.objectIDMap as any
        );
      }
      if (storedSelections) {
        storage.evaluateSelections(storedSelections, context.state.selectedOptions, context.state.objectIDMap as any);
      }
      // Set the frame to the default incase any selections changed it.
      context.commit("setProductView", starters.frame);
      dataTracker.complete("objects");
      // Enable branch value syncing
      context.state.branchSyncEnabled = true;
    };
    // Now build the structure
    structure
      .build(
        modelID,
        context.state.currentProduct,
        (value, oldValue, contributions, releaseSetter, branch) => {
          // We are not calling the mutation via the context because we cannot
          // get a return value that way. All this work here should be synchronous
          // so context shouldn't matter
          context.commit("manageSelectionData", {
            value,
            oldValue,
            contributions,
            releaseSetter,
            branch,
          });
          return true;
        },
        (option: Option | null, path: Array<string>) => {
          return restrictions.certifyValueIsntRestricted(getters.getRestrictions(context.state), option, path);
        }
      )
      .then((struct) => {
        dataTracker.onComplete("models", () => {
          context.commit("setStructure", {
            structure: struct,
            scope: context.state.currentProduct,
          });
          // Now that the structure is ready, apply any selections saved in the session storage
          setTimeout(() => {
            applySavedOptions();
            // Then apply any selections set by query parameters
            for (const key in starters.branchAssignments) {
              if (starters.branchAssignments.hasOwnProperty(key)) {
                if (key.includes(":")) {
                  // Set a 'meta' value on the option
                  let path = key.split(":");
                  const branchID = path[0];
                  path = path.splice(1);
                  const casing = structure.branch(branchID);
                  if (path.length == 1 && path[0] == "text") {
                    // Make sure the value is string and remove any script tags that may be in the value
                    const text =
                      (starters.branchAssignments as any)[key] === true
                        ? ""
                        : starters.branchAssignments[key].toString();
                    let value = text.replace(/<\/?script[^>]*>/g, "");
                    if (casing && casing.value) {
                      utils.setNested(casing, value, ["value", ...path], true);
                    }
                  } else if (path.length == 1 && (path[0] == "userInteraction" || path[0] == "interaction")) {
                    // Make sure the value is boolean
                    const value =
                      starters.branchAssignments[key] == "false" ? false : !!starters.branchAssignments[key];
                    if (casing) {
                      casing.userInteraction = value;
                    }
                  }
                } else {
                  // Set the option on the branch
                  const casing = structure.branch(key);
                  const value = starters.branchAssignments[key];
                  const option = value == "null" ? null : (context.state.objectIDMap[value] as Option);
                  if (casing && (option || option === null)) {
                    casing.value = option;
                  }
                }
              }
            }
          }, 50);
        });
      });
  },
  buildEntireNewStructure(context) {
    structure
      .products()
      .catch(console.error)
      .then((structure) => {
        context.commit("setStructure", { structure });
      });
  },
  clearData(context, objectNames?: Array<"models" | "attributes" | "options" | "leathers" | "pimcos">) {
    // Clear all the data that applies specifically to what series, or model may have been selected
    objectNames = objectNames === undefined ? ["models", "attributes", "options", "leathers", "pimcos"] : objectNames;
    for (let n = 0; n < objectNames.length; n++) {
      const name = objectNames[n];
      for (let i = 0; i < context.state[name].length; i++) {
        const id = context.state[name][i].id;
        delete context.state.objectIDMap[id];
      }
      context.state[name].length = 0;
    }
    // Don't forget to clear the pimco contributers
    context.commit("clearProductImageContributers");
  },
  switchProduct({ commit }, id: string) {
    commit("setCurrentProduct", id);
    commit("setConfiguratorPage", "start");
    commit("setConfiguratorMode", "");
    share.newSession();
  },
  cleanSlate({ dispatch, commit, state, getters }) {
    // Change values in the store and correlating modules to prep for a restart of the build process
    // Grab the start over mode
    const startoverMode: "default" | "editor" = getters.getStartOverMode;
    if (startoverMode === "editor") {
      // Traverse the structure and reset all the values
      structure.traverse(state.selectedOptions, (casing: OptionCasing) => {
        if (casing.value) {
          // Remove any text from the casing value
          if ("text" in casing.value) {
            casing.value.text = "";
          }
          casing.value = casing.defaultValue ? (state.objectIDMap[casing.defaultValue] as Option) : null;
          casing.userInteraction = false;
          // Remove any text from the new casing value
          if (casing.value && "text" in casing.value) {
            casing.value.text = "";
          }
        }
      });
      // Now save the new selections into the session storage
      saveData(state.selectedOptions, state.configuratorMode, state.currentProduct);
      commit("clearProductImageContributers");
      commit("setCurrentAttribute", 0);
      share.newSession();
      commit("clearIndexedPopups");
      // If we are in a 3d rendering context, we need to reset the model orientation
      console.log(getters.getProductRenderingContext);
      if (getters.getProductRenderingContext !== "2D") {
        commit("setProductView", getters.getViews[0]);
      }
    } else {
      commit("setCurrentAttribute", 0);
      structure.reset();
      starters.models = {};
      starters.series = {};
      share.newSession();
      dataTracker.reset();
      dispatch("clearData");
      commit("setCurrentModel", "");
      storage.deleteValue("model");
      commit("setCurrentSeries", "");
      storage.deleteValue("series");
      commit("setConfiguratorMode", "");
      storage.deleteValue("mode");
      commit("clearIndexedPopups");
      storage.deleteValue("selections");
      resetModelSelectionStorage();
      storage.deleteValue("modelSelectionStorage");
      commit("setStructure", { structure: {}, scope: state.currentProduct });
      requestAnimationFrame(() => commit("setConfiguratorPage", "start"));
    }
  },
  switchModelData(context) {
    context.dispatch("clearData", ["attributes", "options", "leathers", "pimcos"]);
    // Clear restrictions
    context.state.restrictions = {};
    structure.reset(["attributes", "options", "leathers", "pimcos"]);
    context.commit("setCurrentAttribute", 0);
  },
  storeData({ state }) {
    saveData(state.selectedOptions, state.configuratorMode, state.currentProduct);
  },
  async generateProductImages(context, payload) {
    const urlsOrBlobs: Array<string | Blob> = [];
    const type = payload.type || "png";
    const dataURLArgs = [`image/${type}`, type != "png" ? payload.quality || 0.6 : undefined] as const;
    const startTime = Date.now();
    if (starters.dev) {
      console.log("Generating images", startTime);
    }
    if (context.getters.getProductRenderingContext === "2D") {
      const canvas = document.createElement("canvas");
      const dimensions = context.getters.getProduct.dimensions;
      canvas.width = payload.size || 1000;
      canvas.height = (canvas.width / dimensions[0]) * dimensions[1];
      const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;

      const frameData: Array<Array<ProductImageComponent>> = [];
      // Grab the pimco data
      const filteredPimcoContributions = pimcos.filterContributions(
        // Taint the state for this getter call because we don't want this function to know what attribute is current
        getters.getPimcoContributers(Object.assign({}, context.state, { currentAttribute: -100 })),
        context.getters.getRestrictions,
        context.getters.getIndexedEnablers
      );
      let len = payload.number || context.getters.getViewCount || 3;
      for (let i = 0; i < len; i++) {
        const index =
          context.getters.getViewOrder && i in context.getters.getViewOrder ? context.getters.getViewOrder[i] : i;
        const pimcoslist = pimcos.compilePimcoContributions(
          context.state.pimcos,
          filteredPimcoContributions,
          context.getters.getFillerPimcos,
          context.getters.getModel,
          index,
          context.getters.getMobileWidth,
          context.state.existingAssets
        );
        // console.log(pimcoslist, index);
        frameData.push(pimcoslist);
      }
      const preloadImages = params.getBool("async-preload");
      // Now Render and Fetch the frames
      for (let i = 0; i < frameData.length; i++) {
        const pimcos = frameData[i];
        const nextPimcos = frameData[i + 1];
        const renderPromise = renderer.draw(pimcos, ctx, canvas.width, canvas.height);
        // Preload the images for the next frame while the current frame is rendering
        if (nextPimcos && preloadImages) {
          renderer.preloadImages(nextPimcos);
        }
        await renderPromise;
        if (type == "jpeg") {
          // Add a white background to the image
          ctx.globalCompositeOperation = "multiply";
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        if (starters.dev) {
          console.log(`Frame #${i + 1} rendered`, Date.now() - startTime);
        }
        if (payload.asBlobs) {
          const blob = await new Promise<Blob>((res, rej) =>
            canvas.toBlob((b) => {
              b ? res(b) : rej(new Error("Failed to convert canvas to blob"));
            }, ...dataURLArgs)
          );
          urlsOrBlobs.push(blob);
        } else {
          urlsOrBlobs.push(await utils.imageDataOrCanvasToDataURL(canvas, ...dataURLArgs));
        }
      }
    } else {
      const dimensions = context.getters.getProduct.dimensions;
      const aspectRatio = context.getters.getProductAspectRatio;
      const width = params.isNumber("regen-width") ? params.getNumber("regen-width") : window.isTouch ? 1000 : 8000;
      const height =
        typeof dimensions == "string" ? Math.round(width / aspectRatio) : (width / dimensions[0]) * dimensions[1];
      const worker = await CanvasWorkers.request(width, height, params.has("image-reset") ? 40000 : undefined);

      const originalModelRotation = threedee.getModelRotation();
      const originalFOV = threedee.getCameraFOV();

      // Don't worry about re-rendering the textures, they should already be done
      // Loop through the views for the product, apply them to the 3d model
      let views = context.getters.getViews;
      let viewFOVs = params.has("view-fov") ? params.getString("view-fov").split(",").map(Number) : null;
      let viewAspectRatios = params.has("view-ar") ? params.getString("view-ar").split(",").map(Number) : null;
      if (payload.number) {
        views = views.slice(0, payload.number);
      }
      for (let i = 0; i < views.length; i++) {
        const view: [number, number, number] = views[i];
        let fov = viewFOVs?.[i];
        if (fov) {
          if (fov == -1) {
            fov = originalFOV;
          }
          context.dispatch("setFOV3DModel", fov);
        }
        await new Promise((callback) => context.dispatch("pose3DModel", { view, callback }));
        worker.width = width;
        // A custom aspect ration may have been set for the view
        let targetHeight = height;
        if (viewAspectRatios && typeof viewAspectRatios[i] == "number" && viewAspectRatios[i] > 0) {
          targetHeight = Math.round(width / viewAspectRatios[i]);
        }
        worker.height = targetHeight;
        // Render the 3D model to the target canvas
        threedee.render(worker.ctx);
        if (starters.dev) {
          console.log(`Frame #${i + 1} rendered`, Date.now() - startTime);
        }
        if (!params.has("image-reset")) {
          const resizeWidth = params.isNumber("image-reset") ? params.getNumber("image-reset") : payload.size || 1000;
          await effects.processRenderedImage(worker.ctx).crop().execute();
          // We need to bring the image back to the main thread to calculate the
          // padding for framing :(
          const padding = Math.round(worker.width * 0.1);
          const paddedWidth = Math.max(padding * 2 + worker.width, 1000);
          const paddedHeight = Math.max(padding * 2 + worker.height, 1000);
          await effects
            .processRenderedImage(worker.ctx)
            .frame(paddedWidth, paddedHeight)
            .resize(resizeWidth, -1)
            .execute();
        }
        if (type == "jpeg") {
          // Add a white background to the image
          worker.ctx.globalCompositeOperation = "multiply";
          worker.ctx.fillStyle = "#ffffff";
          worker.ctx.fillRect(0, 0, worker.width, worker.height);
        }
        if (starters.dev) {
          console.log(`Frame #${i + 1} post-processed`, Date.now() - startTime);
        }
        if (payload.asBlobs) {
          const blob = await utils.imageDataOrCanvasToBlob(worker.cvs, ...dataURLArgs);
          urlsOrBlobs.push(blob);
        } else {
          // Push the data URL to the urls array
          urlsOrBlobs.push(await utils.imageDataOrCanvasToDataURL(worker.cvs, ...dataURLArgs));
        }
      }
      // Terminate the canvas worker
      worker.release();
      // Reset the model rotation
      await new Promise((callback) => context.dispatch("pose3DModel", { view: originalModelRotation, callback }));
      // Reset the camera FOV
      context.dispatch("setFOV3DModel", originalFOV);
    }
    if (starters.dev) {
      console.log(`All frames rendered`, Date.now() - startTime);
    }
    if (payload.callback) {
      payload.callback(urlsOrBlobs);
    }
  },
  async pose3DModel({}, payload) {
    let view = payload.view;
    if ("set3DModelPose" in window) {
      await (window as any).set3DModelPose(view[0], view[1], view[2]);
      if (payload.callback) {
        payload.callback();
      }
    } else {
      threedee.setModelRotation(view[0], view[1], view[2]);
      if (payload.callback) {
        payload.callback();
      }
    }
  },
  setFOV3DModel({}, fov) {
    threedee.setCameraFOV(fov);
  },
  saveSessionData(
    { dispatch },
    payload: {
      callback?: (context: { name: string; success: boolean; data?: any }) => void;
      number?: number;
      dataURLs?: string[];
      saveImages?: boolean;
    } = {}
  ) {
    if (payload.number === undefined) {
      payload.number = 1;
    }
    share.sendSessionData().then((success) => {
      if (payload.callback) {
        payload.callback({ name: "sessionData", success });
      }
      if (payload.saveImages !== false) {
        dispatch("saveSessionImages", payload);
      }
    });
  },
  async saveSessionImages(
    context,
    payload: {
      callback?: (context: { name: string; success: boolean; data?: any }) => void;
      number?: number;
      dataURLs?: string[];
    } = {}
  ) {
    if (!context.getters.getProduct) {
      return;
    }
    // Let's generate some thumbnails real quick
    const dataURLs: Array<string | Blob> = [];
    // Attempt to download Jimp
    let hasJimp = "Jimp" in window;
    // Only download Jimp if we have already rendered images that need to be resized
    if (!hasJimp && payload.dataURLs?.length) {
      await utils.loadScript("/showgloves/jimp.min.js").catch(console.error);
      hasJimp = "Jimp" in window;
    }
    if (!hasJimp) {
      (window as any).Jimp = null;
    }
    // If Jimp was or already has been successfully downloaded, and dataURLs
    // have been provided for us. Just use jimp to resize them instead of
    // Generating the same images again at a smaller size
    if (hasJimp && (window as any).Jimp && payload.dataURLs?.length) {
      const Jimp: any = (window as any).Jimp;
      let background = 0xffffffff;
      // if (context.getters.getProductBackground?.color) {
      //   background = cssColor2RGBAInt(context.getters.getProductBackground.color);
      // }
      for (let i = 0; i < payload.dataURLs.length; i++) {
        dataURLs[i] = "";
        const dataURL = payload.dataURLs[i];
        // Convert the base64 data url to an image buffer
        const buffer = Buffer.from(dataURL.replace(/data:image\/png;base64,/, ""), "base64");
        // Read the buffer into Jimp, do some resizing and stuff, and
        // add it to the dataURLs array
        let image = await Jimp.read(buffer).catch(console.error);
        // If the aspect ratio is too wide, set the height so that the aspect ratio is 1.9
        if (image.bitmap.width / image.bitmap.height > 1.8) {
          const height = Math.ceil(image.bitmap.width / 1.8);
          // Create a new image with the new height
          const newImage = new Jimp(image.bitmap.width, height, background);
          // Composite the original image onto the new image
          newImage.composite(image, 0, Math.floor((height - image.bitmap.height) / 2));
          image = newImage;
        }
        const buff = await image
          .resize(500, Jimp.AUTO)
          .background(background)
          .quality(60)
          .getBufferAsync(Jimp.MIME_JPEG)
          .catch(console.error);
        const blob = new Blob([buff], { type: "image/jpeg" });
        dataURLs[i] = blob;
      }
    } else {
      // If Jimp is not available, or the dataURLs are not provided, generate the images
      // at the smaller size
      const urls = await new Promise<Array<string | Blob>>((callback) => {
        context.dispatch("generateProductImages", {
          size: context.getters.getProductRenderingContext === "2D" ? 500 : undefined,
          number: payload.number,
          callback,
          type: "jpeg",
          asBlobs: true,
        });
      });
      dataURLs.push(...urls);
    }
    const startTime = Date.now();
    share.sendSessionImage(dataURLs).then((successes) => {
      if (starters.dev) {
        console.log(`Images saving wait time`, Date.now() - startTime);
      }
      // Call an event on the window indicating that the images have been saved
      const event = new CustomEvent("images-saved", {
        detail: { success: successes },
      });
      window.dispatchEvent(event);

      if (payload.callback) {
        payload.callback({ name: "sessionImages", success: true, data: { images: dataURLs } });
      }
    });
  },
  // This method actually just returns html of all the input data for a cart form
  addToCart(context, callback: (formHTML: string, formAction: string, formBody: any) => void) {
    // Get all the meta info not found in the selections structure
    const product: Product | null = context.getters.getProduct as Product | null;
    const model: Model | null = context.getters.getModel as Model | null;
    const wooID = woocommerce.getProduct(product?.id || "");
    const wooNote = context.getters.getSeries || undefined;
    if (wooID && product && model) {
      // Create the filter function
      const filterFunction = (obj: any, path?: Array<string>) => {
        let accept = false;
        if (!obj) {
          accept = false;
        } else if (path || (obj.type && obj.type.includes("Option"))) {
          accept = utils.standardOptionFilter(
            obj,
            path || [],
            context.getters.getRestrictions,
            context.getters.getIndexedEnablers
          );
        } else {
          accept = utils.standardAttributeFilter(
            obj,
            context.getters.getRestrictions,
            context.getters.getIndexedEnablers
          );
        }
        return accept;
      };
      context.state.globalAddToCartState = false;
      // Send the meta info and the selections structure to the cart module
      const { html, action, body } = cart.addToCart.apply(
        {
          woocommerceID: wooID,
          productID: product.id,
          model: model.wcvalue,
          objectIDMap: context.state.objectIDMap,
          series: wooNote,
          sessionID: context.state.sessionID,
          modMap: context.getters.getWoocommerceMods,
          deviceMeta: context.getters.getDeviceMeta,
        },
        [context.state.selectedOptions[product.id], filterFunction, context.getters.getDerivedCloneFieldData]
      );
      callback(html, action, body);
      context.state.globalAddToCartState = true;
    }
  },
  onDataStepComplete(context, payload: { id: "start" | "models" | "objects"; callback: Function }) {
    dataTracker.onComplete(payload.id, payload.callback);
  },
  fetchPreConfigData(context, payload: { url: string; product: string }) {
    data
      .fetchContentDataFile(payload.url)
      .catch(console.error)
      .then((data) => {
        context.state.preConfigData[payload.product] = data;
      });
  },
  saveStudioSettings(context) {
    const settings = {
      l: context.state.studioLighting,
      p: context.state.studioPoses,
    };
    sessionStorage.setItem("studioSettings", JSON.stringify(settings));
  },
  loadStudioSettings(context, payload?: any) {
    if (payload) {
      context.state.studioLighting = payload.l;
      context.state.studioPoses = payload.p;
      return;
    }
    const settings = sessionStorage.getItem("studioSettings");
    if (settings) {
      const parsed = JSON.parse(settings);
      context.state.studioLighting = parsed.l;
      context.state.studioPoses = parsed.p;
    }
  },
  studioSettingsToFile(context, filename = "studio-settings.json") {
    const settings = {
      l: context.state.studioLighting,
      p: context.state.studioPoses,
    };
    const blob = new Blob([JSON.stringify(settings)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },
});

export default actions;
