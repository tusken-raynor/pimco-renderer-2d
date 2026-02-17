import pimcos from "@/pimcos";
import share from "@/share";
import storage from "@/storage";
import structure, { OptionCasing } from "@/structure";
import {
  ApplicationCondition,
  Attribute,
  BasicOption,
  ColorOption,
  ComplexLabelOption,
  ComplexLeatherOption,
  ComplexOption,
  ComplexSubAttribute,
  ConfiguratorObject,
  ConfiguratorView,
  GrandAddonAttribute,
  GrandAddonOption,
  GrandOption,
  GrandSubAttribute,
  LeatherDetailsPageTemplate,
  LeatherInfo,
  Light3DReference,
  Model,
  Option,
  OptionApplication,
  OptionGalleryPageTemplate,
  OrderCloneMutation,
  PageTemplate,
  ParallelAccessoryOption,
  ParallelRegionOption,
  ParallelSwatchOption,
  Product,
  ProductImageContributer,
  Products,
  ProductStageHijackParameters,
  SpecialPopupInfo,
  StandardPopupInfo,
} from "@/types";
import utils from "@/utils";
import threedee from "@/threedee";
import getters from "./getters";
import { mutationsContext, starters } from "./initialize";
import { State } from "./state";

// Handle saving data for both session storage and sharing id
export function saveData(selections: any, mode: string, product: string) {
  const formattedSelections = storage.formatSelections(selections);
  storage.saveSelections(formattedSelections);
  share.updateSessionData(mode as any, product, formattedSelections);
}

// Function for switching in new pimcos and taking out old pimcos
export function setPimcos(
  newValue: Option | null,
  contributers: Array<{ pimco: string; contributer: ProductImageContributer }>,
  state: State,
  branch: OptionCasing
) {
  if (newValue && "pimco" in newValue && newValue.pimco) {
    // Create a version of the contributers that has filtered out the
    // ones that were designated to proceed to a different layer
    const contributions = contributers.filter(
      (c) => !((newValue as any).pimco[c.pimco] == c.contributer && c.contributer.cascade === true)
    );
    // Add the contributions that are supplied by the new option
    const newContributers = pimcos.transformPimcoContribution((newValue as any).pimco || {}, branch, contributers);
    const addables = [...contributions, ...newContributers];
    // console.log(
    //   newValue.pimco,
    //   addables.map((x) => x.pimco)
    // );
    for (let i = 0; i < addables.length; i++) {
      // addables[i].contributer["x-data"].branch = branch;
      mutations.addProductImageContributer(state, addables[i] as any);
      // Now replace any of image, mask, hlimage1, or hlimage2 that are referencing casing meta values
      const addable = addables[i].contributer;
      if (addable.frames) {
        for (let j = 0; j < addable.frames.length; j++) {
          const frame = addable.frames[j];
          if (!frame) continue;
          ["image", "mask", "hlimage1", "hlimage2"].forEach((key) => {
            if (key in frame && typeof frame[key] === "string") {
              if (frame[key].startsWith("meta:::")) {
                const metaKey = frame[key].substring(7);
                const metaValue = branch.getMetaData(metaKey);
                if (metaValue !== undefined) {
                  frame[key] = metaValue;
                } else {
                  delete frame[key];
                }
              } else if (frame[key] == "::uploaded::") {
                const parsed = utils.parseMetaDataSync(branch.getMetaData("+keys") || "");
                const imgKey = parsed.keys[parsed.currentKey];
                if (imgKey) {
                  frame[key] = utils.urlFromImageKeySync(imgKey, branch.branchID);
                }
              }
            }
          });
        }
      }
    }
    return addables.map((cnst) => cnst.contributer);
  } else if (contributers.length && newValue) {
    // So this is if the contributers were added through temporary means
    // We'll keep track of this in case it causes other problems elsewhere
    for (let i = 0; i < contributers.length; i++) {
      // contributers[i].contributer["x-data"].branch = branch;
      mutations.addProductImageContributer(state, contributers[i] as any);
    }
    return contributers.map((cnst) => cnst.contributer);
  }
  return [];
}

const mutations = mutationsContext({
  forcePropertyUpdate(state, property: keyof State) {
    (state as any)[property] = Object.assign({}, state[property]);
  },
  addObjectIDs(state, objects: Array<ConfiguratorObject>) {
    const newData: { [key: string]: ConfiguratorObject } = {};
    for (let i = 0; i < objects.length; i++) {
      const object = objects[i];
      if (object.id in state.objectIDMap || object.id in newData) {
        // console.warn(
        //   `Multiple distinct configurator objects were found sharing the ID: "${object.id}". This may cause unintentional behavior.`
        // );
      }
      newData[object.id] = object;
    }
    state.objectIDMap = Object.assign(newData, state.objectIDMap);
  },
  // Set the selectedOptions data structure in the store, built from the JSON files
  setStructure(state, data: { structure: any; scope?: string }) {
    if (data.scope) {
      if (data.scope in state.selectedOptions) {
        // Deselect everything from the previous structure if it exists so there's no artifacts
        if (state.selectedOptions[data.scope] && state.selectedOptions[data.scope].selections) {
          // Set the value of the previous selections objects to null
          structure.traverse(state.selectedOptions[data.scope].selections, (optionCasing: OptionCasing) => {
            if (optionCasing.value !== null) {
              optionCasing.value = null;
            }
          });
        }
        state.selectedOptions[data.scope].selections = data.structure;
        saveData(state.selectedOptions, state.configuratorMode, state.currentProduct);
      }
    } else {
      state.selectedOptions = data.structure;
    }
  },
  setCurrentProduct(state, value: string) {
    state.currentProduct = value;
    document.title = "Show" + state.objectIDMap[value].name.toLowerCase();
    storage.saveValue("product", value);
  },
  setCurrentModel(state, value: string | { value: string; product: string }) {
    if (value instanceof Object) {
      if (state.selectedOptions[value.product]) {
        state.selectedOptions[value.product].model = value.value;
      }
    } else {
      if (state.selectedOptions[state.currentProduct]) {
        state.selectedOptions[state.currentProduct].model = value;
      }
    }
    saveData(state.selectedOptions, state.configuratorMode, state.currentProduct);
  },
  setCurrentSeries(state, value: string | { value: string; product: string }) {
    if (value instanceof Object) {
      if (state.selectedOptions[value.product]) {
        state.selectedOptions[value.product].series = value.value;
      }
    } else {
      if (state.selectedOptions[state.currentProduct]) {
        state.selectedOptions[state.currentProduct].series = value;
      }
    }
  },
  setConfiguratorMode(state, value) {
    state.configuratorMode = value;
    storage.saveValue("mode", value);
  },
  setConfiguratorPage(state, value) {
    state.configuratorPage = value;
  },
  setCurrentAttribute(state, value: number) {
    // Make sure the index doesn't go out of bounds
    const model: Model | undefined = getters.getModel(state) as Model;
    if (model) {
      const attribute: Attribute | undefined = getters.getFilteredAttributes(state)[value] as Attribute;
      const length = model.attributes.length;
      if (value < length && value >= 0) {
        state.currentAttribute = value;
        if (starters.dev) {
          storage.saveValue("step", value);
        }
        if (attribute) {
          if (attribute.notify) {
            mutations.setStandardPopup(state, attribute.notify);
          }
          if ("viewset" in attribute && attribute.viewset !== undefined) {
            if (Array.isArray(attribute.viewset)) {
              const view = getApplicationValue(utils.unpackViewset(attribute.viewset), state);
              if (view !== null) {
                mutations.setProductView(state, view);
              }
            } else {
              mutations.setProductView(state, { view: attribute.viewset, asIndex: false });
            }
          }

          if (attribute.hijack) {
            mutations.setStageHijacker(state, attribute.hijack);
          } else {
            mutations.setStageHijacker(state, null);
          }
        }
      }
    }
  },
  incrementCurrentAttribute(state) {
    mutations.setCurrentAttribute(state, state.currentAttribute + 1);
  },
  decrementCurrentAttribute(state) {
    mutations.setCurrentAttribute(state, state.currentAttribute - 1);
  },
  manageSelectionData(
    state,
    data: {
      value: Option;
      oldValue: Option;
      contributions: {
        pimco: string;
        contributer: ProductImageContributer;
      }[];
      releaseSetter: (releaser: Function) => void;
      branch: OptionCasing;
    }
  ) {
    // Do a manual update to the selections object
    mutations.forcePropertyUpdate(state, "selectedOptions");
    // Handle option applications first because condition may be dependednt on
    // selections that are about to be restricted
    checkOptionApplication(data.value, state);
    if (data.contributions.length || (data.value && "pimco" in data.value)) {
      const contributers = setPimcos(data.value, data.contributions, state, data.branch);
      data.releaseSetter(() => {
        mutations.removeProductImageContributer(state, contributers as any);
      });
    }
    if (data.value) {
      if ("notify" in data.value && data.value.notify) {
        if ("component" in data.value.notify && data.value.notify.component == "OptionGalleryPage") {
          mutations.addInformationPage(state, data.value.notify as OptionGalleryPageTemplate);
        } else {
          mutations.setStandardPopup(state, data.value.notify as StandardPopupInfo);
        }
      }
      if ("viewset" in data.value && data.value.viewset !== undefined) {
        if (Array.isArray(data.value.viewset)) {
          const view = getApplicationValue(utils.unpackViewset(data.value.viewset), state);
          if (view !== null) {
            mutations.setProductView(state, view);
          }
        } else {
          mutations.setProductView(state, { view: data.value.viewset, asIndex: false });
        }
      }
    }
    setTimeout(() => {
      saveData(state.selectedOptions, state.configuratorMode, state.currentProduct);
    }, 40);
    // Make sure the share module knows there's been a change
    share.setSelectionUpdated(true);
    return true;
  },
  setSelectedOptionGeneric(
    state,
    data: {
      branch?: string;
      path?: Array<string>;
      value: Option | null | "default";
      interaction?: boolean;
    }
  ) {
    let optionCasing: OptionCasing | undefined;
    let value = data.value;
    if (data.branch) {
      // If a specific branch is identified, use that to get the casing
      optionCasing = structure.branch(data.branch) || undefined;
    }
    if (data.path && !optionCasing) {
      // If that didn't work, use the path
      optionCasing = utils.getNested(state.selectedOptions, data.path) as OptionCasing | undefined;
    }
    if (optionCasing) {
      // If the value is the string "default", then set the optionCasing value to it's first value
      if (value == "default") {
        if (optionCasing.defaultValue) {
          value = (state.objectIDMap[optionCasing.defaultValue] || null) as Option;
        } else {
          value = null;
        }
      }
      optionCasing.userInteraction = data.interaction === undefined ? optionCasing.userInteraction : data.interaction;
      // if (value == "default") {
      //   value =
      //     (state.objectIDMap[optionCasing.defaultValue] as Option) || null;
      // }
      optionCasing.value = value;
    } else {
      saveData(state.selectedOptions, state.configuratorMode, state.currentProduct);
    }
  },
  setSelectedOption(
    state,
    data: {
      product?: string;
      attribute: string;
      value: BasicOption | ColorOption;
    }
  ) {
    mutations.setSelectedOptionGeneric(state, {
      value: data.value,
      path: [data.product || state.currentProduct, "selections", data.attribute],
      interaction: true,
    });
  },
  setSelectedParallelOption(
    state,
    data: {
      product?: string;
      attribute: string;
      section: "region" | "accessory" | "swatch";
      value: ParallelRegionOption | ParallelAccessoryOption | ParallelSwatchOption;
    }
  ) {
    mutations.setSelectedOptionGeneric(state, {
      value: data.value,
      path: [data.product || state.currentProduct, "selections", data.attribute, data.section],
      interaction: true,
    });
  },
  setSelectedNestedOption(
    state,
    data: {
      product?: string;
      attribute: string;
      subattribute: string;
      section: string;
      value: ComplexOption | GrandOption;
    }
  ) {
    mutations.setSelectedOptionGeneric(state, {
      value: data.value,
      path: [data.product || state.currentProduct, "selections", data.attribute, data.subattribute, data.section],
      interaction: true,
    });
  },
  setSelectedNestedAddonOption(
    state,
    data: {
      product?: string;
      attribute: string;
      subattribute: string;
      addonattribute: string;
      section: string;
      value: GrandAddonOption;
    }
  ) {
    mutations.setSelectedOptionGeneric(state, {
      value: data.value,
      path: [
        data.product || state.currentProduct,
        "selections",
        data.attribute,
        data.subattribute,
        data.addonattribute,
        data.section,
      ],
      interaction: true,
    });
  },
  setOptionInteraction(
    state,
    data: {
      product?: string;
      attribute: string;
      value?: boolean;
    }
  ) {
    if (data.value === undefined) {
      data.value = true;
    }
    utils.setNested(state.selectedOptions, data.value, [
      data.product || state.currentProduct,
      "selections",
      data.attribute,
      "userInteraction",
    ]);
    saveData(state.selectedOptions, state.configuratorMode, state.currentProduct);
  },
  setNestedOptionInteraction(
    state,
    data: {
      product?: string;
      attribute: string;
      subattribute: string;
      section: string;
      value?: boolean;
    }
  ) {
    if (data.value === undefined) {
      data.value = true;
    }
    utils.setNested(state.selectedOptions, data.value, [
      data.product || state.currentProduct,
      "selections",
      data.attribute,
      data.subattribute,
      data.section,
      "userInteraction",
    ]);
    saveData(state.selectedOptions, state.configuratorMode, state.currentProduct);
  },
  setNestedAddonOptionInteraction(
    state,
    data: {
      product?: string;
      attribute: string;
      subattribute: string;
      addonattribute: string;
      section: string;
      value?: boolean;
    }
  ) {
    if (data.value === undefined) {
      data.value = true;
    }
    utils.setNested(state.selectedOptions, data.value, [
      data.product || state.currentProduct,
      "selections",
      data.attribute,
      data.subattribute,
      data.addonattribute,
      data.section,
      "userInteraction",
    ]);
    saveData(state.selectedOptions, state.configuratorMode, state.currentProduct);
  },
  // functions for information overlay
  addInformationPage(state: State, page: PageTemplate) {
    // Check the indexed popups against the index of this page
    if ("index" in page && page.index) {
      if (state.indexedPopups.has(page.index)) {
        return;
      } else {
        state.indexedPopups.add(page.index);
        storage.saveValue("indexedPopups", Array.from(state.indexedPopups));
      }
    }
    const pages = state.informationOverlayPages;
    // If the page to add has the same id as the previous page, then pop the current
    // page to just go back to the previous page
    if (
      pages[pages.length - 2] &&
      (pages[pages.length - 2].id == page.id || pages[pages.length - 2].name == page.name)
    ) {
      pages.pop();
    } else {
      pages.push(page);
      const scroller = document.querySelector("#information-overlay > .pages");
      if (scroller) {
        scroller.scrollTo({ top: 0 });
      }
    }
  },
  removeInformationPage(state, page?: PageTemplate | string) {
    const pages = state.informationOverlayPages;
    if (page === "all") {
      pages.length = 0;
      return;
    }
    if (page) {
      const removePage = pages.findIndex((p: any) => p.id == page || p.name == page || p == page);
      if (removePage > -1) {
        pages.splice(removePage, 1);
        return;
      }
    }
    pages.pop();
  },
  addOptionInformationPage(state, attributeID: string) {
    let attribute: Attribute | null = state.objectIDMap[attributeID] as any;
    const startAttr = attribute;
    if (attribute && startAttr) {
      let optionList: Array<string> | null = null;
      if ("attributes" in attribute && attribute.attributes) {
        // If has sub attributes, I guess just give us the first sub
        const sub = state.objectIDMap[attribute.attributes[0]] as
          | ComplexSubAttribute
          | GrandSubAttribute
          | GrandAddonAttribute
          | null;
        if (sub) {
          attribute = sub;
        }
      }
      if ("options" in attribute && attribute.options) {
        if ("options" in attribute.options) {
          optionList = attribute.options.options;
        } else {
          optionList = attribute.options;
        }
      }
      if (optionList && startAttr.info) {
        const options: Array<BasicOption> = optionList
          .map((id) => state.objectIDMap[id] as BasicOption)
          .filter((o) =>
            utils.standardOptionFilter(
              o,
              [
                state.currentProduct,
                "selections",
                startAttr.id,
                attribute && attribute !== startAttr ? attribute.id : undefined,
              ].filter((x) => !!x) as string[],
              getters.getRestrictions(state),
              getters.getIndexedEnablers(state)
            )
          );
        mutations.addInformationPage(state, {
          id: startAttr.id,
          name: startAttr.name,
          component: "OptionsInfoPage",
          info: startAttr.info as any,
          options,
        });
      }
    }
  },
  addLeatherGuidePage(state, data?: { buckets?: Array<string>; leathers?: Array<string> }) {
    if (state.leatherGuideInfo) {
      if (!state.tippedLeatherGuide) {
        state.tippedLeatherGuide = true;
        storage.saveValue("tippedLeatherGuide", true);
      }
      const page = Object.assign({ id: "leatherguide", component: "LeatherGuidePage" }, state.leatherGuideInfo);
      const leathers = data?.leathers || [];
      if (data && data.buckets) {
        // Now get the leathers from the buckets
        for (let i = 0; i < data.buckets.length; i++) {
          const bucket = state.objectIDMap[data.buckets[i]] as ComplexLabelOption<"bucket">;
          if (bucket.suboptions) {
            leathers.push(...bucket.suboptions.options);
          }
        }
      }
      // If there is only one leather, go straight to its details page
      if (leathers.length === 1) {
        const leather = state.objectIDMap[leathers[0]] as ComplexLeatherOption;
        if (typeof leather.info == "string") {
          mutations.addLeatherDetailsPage(state, leather.info);
          return;
        }
      }
      (page as any).leathers = leathers;
      mutations.addInformationPage(state, page);
    }
  },
  addLeatherDetailsPage(state, leatherInfoID: string | LeatherInfo) {
    const leatherInfo = typeof leatherInfoID == "string" ? state.objectIDMap[leatherInfoID] : leatherInfoID;
    if (leatherInfo) {
      const page = Object.assign(
        { component: "LeatherDetailsPage", title: "Details" },
        leatherInfo
      ) as LeatherDetailsPageTemplate;
      mutations.addInformationPage(state, page);
    }
  },
  addLeatherComparePage(state, leathers: Array<ComplexLeatherOption | string>) {
    const id = leathers
      .map((l) => {
        if (typeof l == "string") {
          return l;
        } else {
          return l.id;
        }
      })
      .sort()
      .join("-");
    const page = {
      id,
      component: "LeatherComparePage",
      name: "Leather Comparison",
      leathers,
    };
    mutations.addInformationPage(state, page as any);
  },
  setLeatherGuideTippedStatus(state, status = true) {
    if (state.tippedLeatherGuide !== status) {
      storage.saveValue("tippedLeatherGuide", status);
      state.tippedLeatherGuide = status;
    }
  },
  setLeatherGuideLeathers(state, value?: Array<{ leather: string; bucket: string }>) {
    state.leatherGuideLeathers = value || [];
  },
  setCompletionOverlayRender(state, value: boolean) {
    state.renderCompletionOverlay = value;
    if (!value) {
      state.showIncompleted = false;
    }
  },
  setIncompletionShow(state, value: boolean) {
    state.showIncompleted = value;
  },
  toggleCompletionOverlayRender(state) {
    state.renderCompletionOverlay = !state.renderCompletionOverlay;
  },
  setCheckoutOverlayRender(state, value: boolean) {
    state.renderCheckoutOverlay = value;
  },
  toggleCheckoutOverlayRender(state) {
    state.renderCheckoutOverlay = !state.renderCheckoutOverlay;
  },
  setTermsAgreement(state, data: { id: string; value: boolean }) {
    state.agreedTerms[data.id] = data.value;
  },
  // Standard popup mutators
  setStandardPopup(state, data: StandardPopupInfo) {
    setTimeout(() => {
      if ((data.index && !state.indexedPopups.has(data.index)) || !data.index) {
        if (state.standardPopupInfo === null) {
          if (data.index) {
            state.indexedPopups.add(data.index);
            storage.saveValue("indexedPopups", Array.from(state.indexedPopups));
          }
          state.standardPopupInfo = data;
        }
      }
    }, data.delay || 0);
  },
  removeStandardPopup(state) {
    state.standardPopupInfo = null;
  },
  clearIndexedPopups(state) {
    state.indexedPopups.clear();
    state.standardPopupInfo = null;
  },
  // Special popup mutators
  setSpecialPopup(state, data: SpecialPopupInfo | string) {
    if (typeof data == "string") {
      if ("specPopupData" in window) {
        const specPopupData: { [key: string]: SpecialPopupInfo } = (window as any).specPopupData;
        if (data in specPopupData) {
          state.specialPopupInfo = specPopupData[data];
        }
      }
    } else {
      state.specialPopupInfo = data;
    }
  },
  removeSpecialPopup(state) {
    state.specialPopupInfo = null;
  },
  // Size Edit Popup
  setSizeEditPopup(state, value: boolean = true) {
    state.sizeChangePopup = value;
  },
  setGoClassicPopup(state, value: boolean = true) {
    state.goClassicPopup = value;
  },
  setGoEdgeXPopup(state, value: boolean = true) {
    state.goEdgeXPopup = value;
  },
  setEditorPimcoOption(state, value: { onClose: Function; option: Option } | Option | null) {
    state.editorPimcoOption = value;
  },
  // Mutators for the product image data
  setProductView(
    state,
    value:
      | ConfiguratorView
      | { view: ConfiguratorView; asIndex: boolean }
      | { unit: "radians" | "degrees"; view: [number, number, number] } = 0
  ) {
    if (window["__lockProductView__"]) return;
    if (Array.isArray(value)) {
      state.productView = [...value];
      return;
    }
    if (typeof value == "object" && Array.isArray(value.view)) {
      // If the value is in radians, then we need to convert it to degrees
      if ("unit" in value && value.unit == "radians") {
        value.view = value.view.map((x) => (x * 180) / Math.PI) as [number, number, number];
        value.unit = "degrees";
      }
      state.productView = [...value.view];
      return;
    }
    const frame = typeof value == "object" ? value.view : value;
    const frameOrder = getters.getViewOrder(state);
    if (frameOrder) {
      const asIndex = typeof value == "object" && value["asIndex"] !== undefined ? value["asIndex"] : true;
      if (!asIndex) {
        const index = frameOrder.indexOf(frame as number);
        if (index > -1) {
          state.productView = index;
          return;
        }
      }
    }
    const viewCount = getters.getViewCount(state);
    state.productView = ((frame as number) + viewCount) % viewCount;
  },
  incrementProductView(state) {
    const views = getters.getViews(state);
    // If the product uses index based views, then the view array will be empty
    if (views.length === 0 && typeof state.productView == "number") {
      mutations.setProductView(state, state.productView + 1);
    } else {
      const orderedViews = threedee.getAngleIndicesSortedByClosest(views as any, true);
      const closest = orderedViews[0].index;
      const closestDot = orderedViews[0].dot;
      const nextClosest = orderedViews[1].index;
      const nextClosestDot = orderedViews[1].dot;
      const nextNextClosestDot = orderedViews[2].dot;
      // If the next closest is the previous index && its closer than the next next closest && alignment is less than 0.9999
      // that means we are between angles in sequence, so just go to closest instead of closest + 1
      const previousIndex = (closest - 1 + views.length) % views.length;
      const index =
        closestDot < 0.9999 && nextClosest == previousIndex && nextClosestDot > nextNextClosestDot
          ? closest
          : (closest + 1) % views.length;
      // const index = (closest + 1) % views.length;
      mutations.setProductView(state, { unit: "radians", view: views[index] as any });
    }
  },
  decrementProductView(state) {
    const views = getters.getViews(state);
    // If the product uses index based views, then the view array will be empty
    if (views.length === 0 && typeof state.productView == "number") {
      mutations.setProductView(state, state.productView - 1);
    } else {
      const orderedViews = threedee.getAngleIndicesSortedByClosest(views as any, true);
      const closest = orderedViews[0].index;
      const closestDot = orderedViews[0].dot;
      const nextClosest = orderedViews[1].index;
      const nextClosestDot = orderedViews[1].dot;
      const nextNextClosestDot = orderedViews[2].dot;
      // If the next closest is the next index && its closer than the next next closest && alignment is less than 0.9999
      // that means we are between angles in sequence, so just go to closest instead of closest - 1
      const nextIndex = (closest + 1) % views.length;
      const index =
        closestDot < 0.9999 && nextClosest == nextIndex && nextClosestDot > nextNextClosestDot
          ? closest
          : (closest - 1 + views.length) % views.length;
      // const index = (closest - 1 + views.length) % views.length;
      mutations.setProductView(state, { unit: "radians", view: views[index] as any });
    }
  },
  setCloneMetaValue(
    state,
    {
      meta,
      cloneKey,
      index,
    }: {
      meta: { key: string; value: string | null; ref: boolean };
      cloneKey: string;
      index: number;
    }
  ) {
    const cloneMeta = state.selectedOptions[state.currentProduct].cloneMeta;
    if (cloneMeta && cloneMeta[cloneKey] && index < cloneMeta[cloneKey].length) {
      const metaIndex = cloneMeta[cloneKey][index].findIndex((x) => x.key == meta.key);
      if (metaIndex > -1) {
        cloneMeta[cloneKey][index][metaIndex] = meta;
        mutations.forcePropertyUpdate(state, "selectedOptions");
      }
    }
  },
  addCloneMetaGroup(
    state,
    {
      schema,
      cloneKey,
    }: {
      schema: OrderCloneMutation[];
      cloneKey: string;
    }
  ) {
    if (!state.selectedOptions[state.currentProduct].cloneMeta) {
      state.selectedOptions[state.currentProduct].cloneMeta = {};
    }
    const cloneMeta = state.selectedOptions[state.currentProduct].cloneMeta!;
    if (!cloneMeta[cloneKey]) {
      cloneMeta[cloneKey] = [];
    }
    const list = cloneMeta[cloneKey];
    const metaGroup = schema.map((mutation) => {
      const key = "wcname" in mutation ? mutation.wcname : mutation.branch;
      const branch = structure.branch(key);
      const opt = branch?.defaultValue ? state.objectIDMap[branch.defaultValue] : (null as Option | null);
      const value = branch ? (mutation.type == "text" && opt ? (opt as any).default || "" : branch.defaultValue) : "";
      return {
        key,
        value,
        ref: mutation.source == "meta" || list.length > 0,
      };
    });
    list.push(metaGroup);
    mutations.forcePropertyUpdate(state, "selectedOptions");
  },
  removeCloneMetaGroup(
    state,
    {
      index,
      cloneKey,
    }: {
      index: number;
      cloneKey: string;
    }
  ) {
    const cloneMeta = state.selectedOptions[state.currentProduct].cloneMeta;
    if (cloneMeta && cloneMeta[cloneKey]) {
      cloneMeta[cloneKey].splice(index, 1);
      mutations.forcePropertyUpdate(state, "selectedOptions");
    }
  },
  addProductImageContributer(
    state,
    data: {
      pimco: string;
      contributer: ProductImageContributer & {
        ["x-data"]: { attributes: { id: string; disabled?: boolean }[] };
      };
    }
  ) {
    if (!(data.pimco in state.productImageContributions)) {
      state.productImageContributions[data.pimco] = [];
    }
    if (!state.productImageContributions[data.pimco].includes(data.contributer)) {
      state.productImageContributions[data.pimco].push(data.contributer);
    }
  },
  removeProductImageContributer(
    state,
    data: Array<
      ProductImageContributer & {
        ["x-data"]: { attributes: { id: string; disabled?: boolean }[] };
      }
    >
  ) {
    // So this function has been changed for it's new purpose. Now it ends up getting called to
    // remove specific new objects that were created. These new objects can only be referenced
    // because of a callback that will live on the OptionCasing, and will get called and discarded
    // and replaced for each selection
    for (const key in state.productImageContributions) {
      if (Object.prototype.hasOwnProperty.call(state.productImageContributions, key)) {
        const contributerList = state.productImageContributions[key];
        for (let i = 0; i < data.length; i++) {
          const contributer = data[i];
          const index = contributerList.indexOf(contributer);
          if (index > -1) {
            contributerList.splice(index, 1);
          }
        }
        // Delete the indexed pimco id's list if it holds no contributers
        if (!contributerList.length) {
          delete state.productImageContributions[key];
        }
      }
    }
  },
  clearProductImageContributers(state) {
    state.productImageContributions = {};
  },
  forceUpdateOrderedPimcos(state) {
    state.pimcoUpdater = !state.pimcoUpdater;
  },
  setStageHijacker(state, value: ProductStageHijackParameters | null) {
    state.stageHijacker = value;
  },
  setStageHijackerPath(state, value: string[] | null) {
    state.stageHijackerPath = value;
  },
  setProductImageDataURL(state, url: string) {
    state.productImageDataURL = url;
  },
  // Json data setters
  productsSet(state, data) {
    state.products = [...state.products, ...data];
  },
  modelsSet(state, data: Model[]) {
    state.models = [...state.models, ...data].filter((x, i, a) => a.findIndex((c) => c.id == x.id) == i);
  },
  attributesSet(state, data) {
    state.attributes = [...state.attributes, ...data];
  },
  optionsSet(state, data) {
    state.options = [...state.options, ...data];
  },
  leathersSet(state, data) {
    state.leathers = [...state.leathers, ...data];
  },
  seriesSet(state, data) {
    state.series = [...state.series, ...data];
  },
  // PIMCO stands for Product IMage COmponent
  pimcosSet(state, data) {
    state.pimcos = [...state.pimcos, ...data];
  },
  miscSet(state, data) {
    for (const key in data) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        const dataPoint = data[key];
        if (key in state) {
          (state as any)[key] = dataPoint;
        } else {
          console.warn(
            `Miscellaneous data point using the key: "${key}" was attempted to be applied ` +
              "to the Vuex state, but the state has no such property defined. Please add a " +
              "correlating property in the state for the data point to be applied."
          );
        }
      }
    }
  },
  setExistingAssets(state, data: string[]) {
    state.existingAssets = data;
  },
  buildTermsTracker(state, products: Products) {
    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      state.agreedTerms[product.id] = false;
    }
  },
  addStudioPose(state, pose: { name: string; euler: [number, number, number] }) {
    state.studioPoses.push(pose);
  },
  removeStudioPose(state, index: number) {
    if (index > -1 && index < state.studioPoses.length) {
      state.studioPoses.splice(index, 1);
    }
  },
  addStudioLight(state, light: Light3DReference & { name: string }) {
    if (state.studioLighting) {
      state.studioLighting.push(light);
      state.studioLighting = Array.from(state.studioLighting);
    } else {
      const arr: any[] = [];
      arr.push(light);
      state.studioLighting = arr;
    }
  },
  removeStudioLight(state, index: number) {
    if (!state.studioLighting) return;
    if (index > -1 && index < state.studioLighting.length) {
      state.studioLighting.splice(index, 1);
      state.studioLighting = Array.from(state.studioLighting);
    }
  },
  updateStudioLightParameter(state, data: { index: number; path: string[]; value: any }) {
    if (!state.studioLighting) return;
    if (data.index > -1 && data.index < state.studioLighting.length) {
      const light = state.studioLighting[data.index];
      utils.setNested(light, data.value, data.path, false);
      state.studioLighting = Array.from(state.studioLighting);
    }
  },
});

// Handle applying other applications using the 'apply' property
function checkOptionApplication(option: Option, state: State) {
  if (option && "apply" in option && option.apply) {
    runOptionApplications(option.apply, state, option);
  }
}
function runOptionApplications(
  optionApplications: OptionApplication | Array<OptionApplication>,
  state: State,
  source: Option
) {
  let applications = optionApplications;
  if (!(applications instanceof Array)) {
    applications = [applications];
  }
  for (let i = 0; i < applications.length; i++) {
    let oa = applications[i];
    if (oa.once && !oa.id) {
      oa = Object.assign({ id: source.id + "-$finish$", oa });
    }
    runOptionApplication(oa as any, state);
  }
}
function runOptionApplication(
  opApp: (OptionApplication & { once: undefined; id: undefined }) | (OptionApplication & { once: true; id: string }),
  state: State
) {
  let option: Option | null = null;
  let branchID = opApp.path;
  if (opApp.option == "csoeNc7nro1sTl") {
  }
  if (!(typeof branchID == "string" && branchID.startsWith("brc"))) {
    if (!(branchID instanceof Array)) {
      branchID = [branchID];
    }
    // Path was an actually path array, so turn into a branch ID
    branchID = "brc" + utils.generateHash(branchID.join());
  }
  // The branchID should be an actual branch ID now
  const branch = structure.branch(branchID);
  if (branch) {
    // Get the correct type of option
    if (opApp.option == "default") {
      const prevBranch = branch.previous();
      if (prevBranch?.value) {
        const dflt = structure.getDefault(prevBranch.value);
        if (dflt) {
          option = dflt;
        }
      } else {
        option = branch.defaultValue ? (state.objectIDMap[branch.defaultValue] as any) : null;
      }
    } else if (opApp.option == "random") {
      const prevBranch = branch.previous();
      if (prevBranch?.value && "suboptions" in prevBranch.value && prevBranch.value.suboptions?.options) {
        let list = prevBranch.value.suboptions.options;
        if (opApp.filter) {
          list = list.filter((x) => !opApp.filter!.includes(x));
        }
        const randomID = list[Math.floor(Math.random() * list.length)];
        option = (state.objectIDMap[randomID] as any) || null;
      } else {
        const randomID = Array.from(branch.allowedValues)[Math.floor(Math.random() * branch.allowedValues.size)];
        option = (state.objectIDMap[randomID] as any) || null;
      }
    } else if (opApp.option) {
      option = state.objectIDMap[opApp.option] as Option;
    }

    // So if the id is generated, finish building it
    if (opApp.id && opApp.id.endsWith("$finish$")) {
      opApp.id = opApp.id.replace("$finish$", branchID);
    }
    if (opApp.once && state.optionApplicationTracker.includes(opApp.id)) {
      // The only force strong enough to stop.... force
      return;
    } else if (opApp.force) {
      // Nothing else can stop this from happening except possible conditions
    } else if (branch.value && branch.userInteraction) {
      // It already has a value and has received user interaction, bail
      return;
    }
    if (opApp.once) {
      // Index the specific application if it's only supposed to happen once
      state.optionApplicationTracker.push(opApp.id);
      storage.saveValue("opAppTracker", state.optionApplicationTracker);
    }
    // Check if we have any conditions, they are all met
    if (!(!opApp.condition || evalApplicationConditions(opApp.condition, state))) {
      return;
    }
    // Well, we made it here. Let's do this thing
    if (opApp.delay) {
      // Wait a bit if a delay was requested
      setTimeout(() => {
        mutations.setSelectedOptionGeneric(state, {
          branch: branchID as string,
          value: option,
        });
      }, opApp.delay);
    } else {
      mutations.setSelectedOptionGeneric(state, {
        branch: branchID,
        value: option,
      });
    }
  }
}
export function getApplicationValue<T>(
  options: Array<{ value: T; conditions: ApplicationCondition | ApplicationCondition[] | null }>,
  state: State
): T | null {
  for (let i = 0; i < options.length; i++) {
    const option = options[i];
    if (option.conditions) {
      if (evalApplicationConditions(option.conditions, state)) {
        return option.value;
      }
    } else {
      return option.value;
    }
  }
  return null;
}
export function evalApplicationConditions(conditions: ApplicationCondition | ApplicationCondition[], state: State) {
  conditions = conditions instanceof Array ? conditions : [conditions];
  for (let i = 0; i < conditions.length; i++) {
    const condition = conditions[i];
    if (!evalApplicationCondition(condition, state)) {
      return false;
    }
  }
  return true;
}
function evalApplicationCondition(condition: ApplicationCondition, state: State) {
  if ("value" in condition && "branch" in condition && "comparison" in condition) {
    const branch = structure.branch(condition.branch);
    const value =
      condition.value == null
        ? null
        : condition.value instanceof Array
        ? condition.value.map((x) => state.objectIDMap[x])
        : state.objectIDMap[condition.value];
    if (branch && value !== undefined) {
      if (condition.comparison == "VALUE IS") {
        return branch.value && value && "id" in value ? branch.value.id === value.id : branch.value === value;
      } else if (condition.comparison == "VALUE IS NOT") {
        return branch.value && value && "id" in value ? branch.value.id !== value.id : branch.value !== value;
      } else if (condition.comparison == "VALUE IN" && value instanceof Array) {
        return value.some((v) => {
          return branch.value && v ? branch.value.id === v.id : branch.value === v;
        });
      } else if (condition.comparison == "VALUE NOT IN" && value instanceof Array) {
        return value.every((v) => {
          return branch.value && v ? branch.value.id !== v.id : branch.value !== v;
        });
      }
    }
  }
  return false;
}

(window as any).addInformationPage = mutations.addInformationPage;

export default mutations;
