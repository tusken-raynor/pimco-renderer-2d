import { createStore } from "vuex";
import state from "./state";
import getters from "./getters";
import mutations, { saveData } from "./mutations";
import actions from "./actions";

import { regenSessionImages, starters } from "./initialize";
import share from "@/share";
import utils from "@/utils";
import watchers from "./watchers";
import structure, { OptionCasing } from "@/structure";
import storage from "@/storage";
import params from "@/params";
import { Light3DReference, Model, Option, Product } from "@/types";
import regen from "@/regen";

const store = createStore({
  state,
  getters,
  mutations,
  actions,
});

// Summon the data
store.dispatch("fetchStartData");

// If parts are skipped, this function requests the neccesary data to fill in
function fetchNeccesaryData(page: string, previousPage?: string) {
  if (page == "patterns" || (page == "build" && previousPage != "patterns")) {
    if (starters.mode === "series") {
      store.dispatch("fetchSeriesData");
    }
    store.dispatch("fetchModelData");
  }
  if (page == "build") {
    store.dispatch("fetchConfiguratorData");
  }
}

store.watch((state) => state.configuratorPage, fetchNeccesaryData);
fetchNeccesaryData(state.configuratorPage);

window.addEventListener("resize", () => {
  // Track the javascript height for the window using the store,
  // and use it to determine the actual window height since mobile
  // safari's CSS lies to us.
  if (store.state.windowHeight !== window.innerHeight) {
    store.state.windowHeight = window.innerHeight;
  } else {
    // Need more time for difference to register,
    // probably because we're in mobile safari
    setTimeout(() => {
      store.state.windowHeight = window.innerHeight;
    }, 375);
  }
  if (store.state.windowWidth !== window.innerWidth) {
    store.state.windowWidth = window.innerWidth;
  } else {
    // Need more time for difference to register,
    // probably because we're in mobile safari
    setTimeout(() => {
      store.state.windowWidth = window.innerWidth;
    }, 375);
  }
});

// Update the session ID in the store whenever a new share session starts
share.onNewSession((sessionID) => {
  store.state.sessionID = sessionID;
});

// Resave session images if image-reset query param was set
if (regenSessionImages) {
  // Invoke the module that will regenerate the session images
  regen(store);
}

// Here we will check if any query params are meant to trigger a special popup
if (params.isString("spec-popup")) {
  const popup = params.getString("spec-popup");
  if (params.isNumber("spec-popup-delay")) {
    const delay = params.getNumber("spec-popup-delay");
    setTimeout(() => {
      store.commit("setSpecialPopup", popup);
    }, delay);
  } else {
    store.commit("setSpecialPopup", popup);
  }
}

// Have a body class indicate the current product
const setProductBodyClass = (newVal: string, oldVal?: string) => {
  if (oldVal) {
    document.body.classList.replace(
      utils.sanitize(oldVal),
      utils.sanitize(newVal)
    );
  } else {
    document.body.classList.add(utils.sanitize(newVal));
  }
};
store.watch((state) => state.currentProduct, setProductBodyClass);
setProductBodyClass(store.state.currentProduct);

// Have a body class indicate the current model
const setModelBodyClass = (newVal: Model | null) => {
  // Look at the body classList and if there is any class that
  // starts with "model-" then remove it
  Array.from(document.body.classList).forEach((className) => {
    if (className.startsWith("model-")) {
      document.body.classList.remove(className);
    }
  });
  if (newVal) {
    document.body.classList.add("model-" + utils.sanitize(newVal.name));
  }
};
store.watch((state, getters) => getters.getModel, setModelBodyClass);
setModelBodyClass(store.getters.getModel);

// Have the selected options storage get set if the value changes
store.watch(
  (state) => state.selectedOptions,
  (value) => {
    saveData(value, store.state.configuratorMode, store.state.currentProduct);
  }
);

// Save the model selections with the session when they switch model
const modelSelectionStorage = {};
store.watch(
  (state, getters) => getters.getModel,
  (value, oldValue) => {
    const selectionsObject =
      store.state.selectedOptions?.[store.state.currentProduct]?.selections;
    if (oldValue?.id && selectionsObject) {
      const selections: any = {};
      structure.traverse(selectionsObject, (casing: OptionCasing, path) => {
        utils.setNested(
          selections,
          casing.value?.id || null,
          [...path, "value"],
          true
        );
      });
      modelSelectionStorage[oldValue.id] = selections;
      storage.saveValue("modelSelectionStorage", modelSelectionStorage);
    }
  }
);
export const resetModelSelectionStorage = () => {
  for (const key in modelSelectionStorage) {
    if (Object.prototype.hasOwnProperty.call(modelSelectionStorage, key)) {
      delete modelSelectionStorage[key];
    }
  }
};

// Change the title of document based on product
const pmpSetDocTitle = (product: Product | null) => {
  if (location.hostname == "localhost" && params.has("title") && params.isString("title")) {
    document.title = params.getString("title");
  } else if (product?.doctitle) {
    document.title = product.doctitle;
  } else if (product) {
    document.title = "Show" + product.id;
  }
};
store.watch(
  (_, getters) => getters.getProduct,
  (product) => pmpSetDocTitle(product),
);
pmpSetDocTitle(store.getters.getProduct);

// Set the body overflow based on if the stadrd popup is open
const setBodyOverflow = (newVal: boolean) => {
  if (newVal) {
    document.body.style.overflow = "hidden";
  } else {
    document.body.style.overflow = "";
  }
};  
store.watch((state) => !!state.standardPopupInfo, setBodyOverflow);

// Update the price enforcer every five seconds to keep the price value fresh
setInterval(() => {
  store.state.priceEnforcer = !store.state.priceEnforcer;
}, 5000);

// Add this function to the window so another module can grab it asyncronously
(window as any).getSyncBranches = (id: string) => {
  if (store.state.branchSyncEnabled) {
    return store.state.branchSync
      .map((x) => {
        if (x.branch == id) {
          return x.sync;
        } else if (x.twoway && x.sync.includes(id)) {
          return x.branch;
        }
        return null as any as string;
      })
      .filter((x) => x)
      .flat();
  }
  return [];
};

// Let's setup watchers for all the state/getter values
const watcherThis = { state: store.state, getters: store.getters };
for (const key in watchers) {
  const watcher: (value: any, oldValue: any) => void = watchers[key];
  if (key in state) {
    store.watch(
      (state) => state[key],
      (...args) => watcher.apply(watcherThis, args)
    );
  } else {
    store.watch(
      (s, getters) => getters[key],
      (...args) => watcher.apply(watcherThis, args)
    );
  }
}

// Once we have a product, check for a shareview, and lock to that
// view until 3 seonds after the objects has been loaded
if (params.has("id")) {
  store.dispatch("onDataStepComplete", {
    id: "start",
    callback: () => {
      const product: Product = store.getters.getProduct;
      if (product?.shareview !== undefined) {
        if (store.getters.getProductRenderingContext === "2D") {
          store.commit("setProductView", { view: product.shareview, asIndex: true });
        } else {
          store.commit("setProductView", { view: store.getters.getViews[product.shareview], unit: 'radians' });
        }
        // Lock the view to the shareview
        window['__lockProductView__'] = true;
      }
    },
  });
  store.dispatch("onDataStepComplete", {
    id: "objects",
    callback: () => {
      setTimeout(() => {
        delete window['__lockProductView__'];
      }, 3000);
    },
  });
}

if (starters.dev) {
  store.watch(
    (state) => state.inStudioMode,
    (value) => {
      store.state.displayStudioControls = false;
      const title = value ? "Configurator Studio" : `Show${store.state.currentProduct}`;
      const icon = value ? "studio.ico" : "show.ico";
      document.head.querySelector('link[rel="icon"]')?.setAttribute('href', `./${icon}`);
      document.title = title;
      document.body.classList.toggle("studio-mode", value);
      // Remove the settings from the session storage if we are leaving studio mode
      if (!value) {
        sessionStorage.removeItem("studioSettings");
      } else if (
        store.state.studioLighting?.length ||
        store.state.studioPoses.length
      ) {
        store.dispatch("saveStudioSettings");
      } else if (store.state.studioLighting === null) {
        const typeCounter: any = {};
        store.state.studioLighting = Array.from<Light3DReference>(store.getters.getLights3D).map((l) => {
          const num = typeCounter[l.type] || 0;
          typeCounter[l.type] = num + 1;
          const name = `${utils.camelCase2Words(l.type)} ${num + 1}`;
          return {
            ...l,
            name,
          };
        });
      }
    },
  );
  store.watch(
    (state) => state.displayStudioControls,
    (value) => document.body.classList.toggle("studio-controls", value),
  );
  if (sessionStorage.getItem("studioSettings")) {
    store.state.inStudioMode = true;
  }
}

// Watch the restrictions and enablers and check if all options that are
// selected are enabled. If not, then reset the selection
const checkSelectedOptions = utils.toThrottled((restrictions: any, enablers: any) => {
  structure.traverse(store.state.selectedOptions[store.state.currentProduct]?.selections, (casing: OptionCasing, path) => {
    if (!casing.value) return; // Skip if no value is selected
    const fullPath = [store.state.currentProduct, 'selections', ...path];
    const allowed = Array.from(casing.allowedValues).filter((x) => utils.standardOptionFilter((store.state.objectIDMap[x] as Option) || null, fullPath, restrictions, enablers));
    if (!allowed.includes(casing.value.id)) {
      // If the value is not allowed, reset it
      let defaultValue: string | null = casing.defaultValue;
      if (defaultValue && allowed.includes(defaultValue)) {
        casing.value = store.state.objectIDMap[defaultValue] as Option;
        return;
      }
      if (casing.parent) {
        const parentDefault = structure.getDefault(store.state.objectIDMap[casing.parent], allowed);
        if (parentDefault && allowed.includes(parentDefault.id)) {
          casing.value = parentDefault;
          return;
        }
      }
      // If no default value is allowed, reset to null
      casing.value = null;
    }
  });
}, 3000);
store.watch(
  (_, getters) => getters.getRestrictions,
  (restrictions) => {
    const enablers = store.getters.getIndexedEnablers;
    checkSelectedOptions(restrictions, enablers);
  }
);
store.watch(
  (_, getters) => getters.getIndexedEnablers,
  (enablers) => {
    const restrictions = store.getters.getRestrictions;
    checkSelectedOptions(restrictions, enablers);
  }
);

async function supportsAvif() {
  if (!self.createImageBitmap) return false;
  
  const avifData = 'data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAABAAABGgAAAB0AAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAIAAAACAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFDgQ0MAAAAABNjb2xybmNseAACAAIAAYAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAACVtZGF0EgAKCBgANogQEAwgMg8f8D///8WfhwB8+ErK42A=';
  
  try {
    const img = await fetch(avifData)
      .then(r => r.blob())
      .then(blob => createImageBitmap(blob));
    return img.width > 0;
  } catch {
    return false;
  }
}
supportsAvif().then((result) => {
  store.state.supportsAvif = result;
});

export default store;

(window as any).getters = store.getters;
(window as any).__store_dispatch_storeData__ = () => store.dispatch("storeData");
