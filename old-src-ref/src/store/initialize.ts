import params from "@/params";
import share from "@/share";
import storage from "@/storage";
import utils from "@/utils";
import { ActionContext } from "vuex";
import { State } from "./state";

// Check for a custom app version number
const appVersion = params.getString("ver");
if (appVersion && appVersion.match(/^[\d\.]+$/)) {
  window['configuratorVersion'] = appVersion;
}

/* Special functions for handling data in session storage */

const storedSelections = storage.getValue("selections") || {};

/* Special functions for handling data in session storage */

/* Handle sharing session data as priority when it applies */

const sharedSessionID = share.getSharedSessionID();
let sharedMode = "";
let sharedProduct = "";
if (sharedSessionID) {
  const sharedData = share.recoverSessionData(sharedSessionID);

  if (sharedData) {
    // Manipulate any text values on the saved object if branch assignments change any text
    const branchTextAssignments: {
      [key: string]: string | true | number;
    } = utils.mapObjectKeys(
      utils.filterObject(
        params.all(),
        (val, key) => key.startsWith("brc") && key.endsWith(":text")
      ),
      (v, k) => k.replace(":text", "")
    ) as any;
    const idDShare = idSavedData(sharedData);
    for (const key in branchTextAssignments) {
      if (
        branchTextAssignments.hasOwnProperty(key) &&
        idDShare.hasOwnProperty(key)
      ) {
        const text =
          branchTextAssignments[key] === true
            ? ""
            : branchTextAssignments[key].toString();
        const casRep = idDShare[key];
        if (text && casRep.value instanceof Object) {
          casRep.value.text = text;
        }
      }
    }

    storedSelections[sharedData.product] = sharedData.selections;
    sharedMode = sharedData.mode;
    sharedProduct = sharedData.product;
    // Apply the shared selections directly to session storage since some
    // parts of the app call directly from it
    storage.saveValue("selections", storedSelections);
  }
}

const devMode =
  params.get("dev") || params.get("debug") || storage.getValue("dev") || false;
if (devMode && !storage.getValue("dev")) {
  storage.saveValue("dev", true);
}

/* TEMPORARY */
let altProduct = "";
let altModel = "";
if (!location.origin.includes("localhost")) {
  if (location.pathname.includes("team-showbelts")) {
    altProduct = "epion";
  } else if (location.pathname.includes("showbelts")) {
    altProduct = "belts";
  } else if (location.pathname.includes("showgloves")) {
    altProduct = "gloves";
  } else if (location.pathname.includes("showbats")) {
    altProduct = "bats";
  }
}
if (params.getString("embed") == "justbats") {
  altProduct = "bats";
  altModel = "modSawZZOWQ05e";
}

/* Handle sharing session data as priority when it applies */
// current product may be set by query parameter or storage
const startProduct =
  sharedProduct ||
  params.get("p") ||
  altProduct ||
  storage.getValue("product") ||
  "gloves";
// configurator super option may be set by query parameter or storage
let queryStartSeries: any = {};
if (params.isString("p") && params.has("series")) {
  queryStartSeries[params.getString("p")] = params.get("series");
} else {
  queryStartSeries = null;
}
let startSeries =
  queryStartSeries || utils.mapNested(storedSelections, "series", true) || {};
// This may need to reset since some getters use this object
// in tandem with the value in the store
export function clearStartSeries() {
  starters.series = {};
}
// current model may be set by query parameter or session storage
let queryStartModels: any = {};
if (params.isString("p") && params.get("model")) {
  queryStartModels[params.getString("p")] = params.get("model");
} else {
  queryStartModels = null;
}

let startModels =
  queryStartModels || 
  Object.keys(storedSelections).length && utils.mapNested(storedSelections, "model") || 
  (altModel && altProduct == startProduct && { [altProduct]: altModel }) || 
  {};
// This may need to reset since some getters use this object
// in tandem with the value in the store
export function clearStartModels() {
  startModels = {};
}
// Select for 3d material debugging

const debugMaterial3d = params.get('m') == '3d-material-test' && (params.getBool('dev') || params.getBool('debug'));
// configurator mode may be set by query parameter or storage
if (debugMaterial3d) {
  sharedMode = "3d-material-test";
}
let probableMode = "";
if (
  location.pathname.includes("edgex") &&
  !params.has("model") &&
  !params.has("series")
) {
  probableMode = "edgex-landing";
} else if (params.isString("p")) {
  if (params.get("series")) {
    probableMode = "series";
  } else if (params.get("model")) {
    probableMode = "blank";
  }
} else if (params.has("embed")) {
  probableMode = "blank";
}
const startMode =
  sharedMode || params.get("m") || storage.getValue("mode") || probableMode;

// remove query string from url
if (location.search) {
  let timeout = 50;
  let newUrl = '';
  const urlPreservation = params.get("url-preserve", "up");
  if (urlPreservation === true) {
    // Preserve the entire URL by doing nothing
  } else if (typeof urlPreservation == "string") {
    // Only preserve the parameters included in the comma separated list
    const preserved = new Set([...urlPreservation.split(","), "url-preserve", "up"]);
    newUrl = location.href.replace(
      location.search,
      utils.toQueryString(utils.filterObject(params.all(), (_, key) => preserved.has(key)))
    );
  } else if (params.has("repath")) {
    const repath = params.getString("repath");
    let url = new URL(repath, repath.startsWith("http") ? undefined : location.origin);
    // Only allow for the pathname to be replaced
    url = new URL(url.pathname, location.origin);
    newUrl = url.href.replace(url.search, "");
  } else {
    newUrl = location.href.replace(location.search, "");
  }
  if (newUrl) {
    setTimeout(() => {
      history.replaceState(
        {},
        "replace-search",
        newUrl
      );
    }, timeout);
  }
}

// Determine the first page
let startPage = "start";
if (startMode == "color") {
  startPage = "colorplay";
} else if (startMode == "blank") {
  if (startModels[startProduct]) {
    startPage = "build";
  } else {
    startPage = "patterns";
  }
} else if (startMode == "edgex") {
  if (sharedSessionID) {
    startPage = "build";
  } else {
    startPage = "patterns";
  }
} else if (startMode == "series" && startSeries[startProduct]) {
  if (startModels[startProduct]) {
    startPage = "build";
  } else {
    startPage = "patterns";
  }
} else if (startMode == "3d-material-test") {
  startPage = "build";
}

// Save any important value to the session storage
if (startProduct) {
  storage.saveValue("product", startProduct);
}
if (startMode) {
  storage.saveValue("mode", startMode);
}

// Collect the branch assignment parameters
const branchAssignments: {
  [key: string]: string;
} = utils.filterObject(params.all(), (val, key) =>
  key.startsWith("brc")
) as any;

// Get the stored indexedPopups
const startIndexedPopups = storage.getValue("indexedPopups") || [];

// Was the leather guide already tipped?
const lgWasTipped = storage.getValue("tippedLeatherGuide") || false;

// What attribute step were they on?
const attributeStep = params.get("step") || storage.getValue("step") || 0;

// Load start frame from query parameters if it was included
const startFrame = params.isNumber("frame") ? params.getNumber("frame") : 0;

// Default value for expanding the product stage
const startExpandProductStage = !!params.get("image-expand");

// Grab the option application tracker array from storage if it exists
const optionApplicationTracker: string[] =
  storage.getValue("opAppTracker") || [];

// Stored value for cloneMeta
const cloneMeta = storage.getValue("cloneMeta") || {};

// Store all the initials values in an object and just export that
export const starters = {
  product: startProduct,
  series: startSeries,
  models: startModels,
  mode: startMode,
  page: startPage,
  branchAssignments,
  indexedPopups: startIndexedPopups,
  lgWasTipped,
  step: attributeStep,
  frame: startFrame,
  startExpandProductStage,
  dev: devMode,
  optionApplicationTracker,
  cloneMeta,
};

// Var for saving images again to server on startup
export const regenSessionImages = params.get("image-reset");

function idSavedData(selections: object, path: string[] = []) {
  const branches: {
    [key: string]: {
      value: string | { id: string; text?: string };
    };
  } = {};
  for (const key in selections) {
    if (Object.prototype.hasOwnProperty.call(selections, key)) {
      const child = selections[key];
      if (child instanceof Object) {
        if ("value" in child && "userInteraction" in child) {
          const pathstring = [
            ...path.slice(path.indexOf("selections") + 2),
            key,
          ].join();
          const id = "brc" + utils.generateHash(pathstring);
          branches[id] = child;
        } else {
          Object.assign(branches, idSavedData(child, [...path, key]));
        }
      }
    }
  }
  return branches;
}

// Set all the userInteractinos to true if the force-interactions query parameter is set
if (params.get("force-interactions")) {
  setTimeout(() => {
    if ('forceInteractions' in window) {
      (window as any).forceInteractions();
    }
  }, 1000);
}


/**
 * THESE FUNCTIONS SET THE TYPE CONTEXT FOR THE STORE MODULES
 */
export function gettersContext<
  G extends {
    [key: string]: (state: State, getters: any) => any;
  }
>(getters: G): G {
  return getters;
}
export function mutationsContext<
  M extends {
    [key: string]: (state: State, payload?: any) => void;
  }
>(mutations: M): M {
  return mutations;
}
export function actionsContext<
  A extends {
    [key: string]: (context: ActionContext<State, any>, payload?: any) => void;
  }
>(actions: A): A {
  return actions;
}
export function watchersContext<
  W extends {
    [key: string]: (
      this: { state: State; getters: { [key: string]: any } },
      newVal: any,
      oldVal: any
    ) => void;
  }
>(obj: W): W {
  return obj;
}