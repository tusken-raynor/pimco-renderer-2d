import {
  Attribute,
  ComplexInitialsOption,
  ComplexTypeOption,
  GrandClonerOption,
  Light3DReference,
  MaterialTextureName,
  Mesh3DReference,
  Mesh3DVariables,
  Model,
  Option,
  OrderCloneMutation,
  Pimco3DMaterialCollection,
  Product,
  ProductImageComponent,
  ProductImageContributer,
  SeriesInfo,
} from "@/types";
import { gettersContext, starters } from "./initialize";
import utils from "@/utils";
import structure, { OptionCasing } from "@/structure";
import woocommerce from "@/woocommerce";
import pimcos from "@/pimcos";
import actions from "./actions";
import { evalApplicationConditions, setPimcos } from "./mutations";
import params from "@/params";
import formulas from "@/formulas";
import { pldToLight3DReference } from "@/threedee";

// Getters are defined outside the store declaration so that getter
// methods can be called between other getters for simpler code
const getters = gettersContext({
  getProduct(state) {
    return state.objectIDMap[state.currentProduct];
  },
  getProductName(state) {
    const prod = state.objectIDMap[state.currentProduct];
    if (prod) {
      if (prod.name.endsWith("s")) {
        return prod.name.slice(0, -1);
      } else {
        return prod.name;
      }
    }
    return "";
  },
  getAttribute(state) {
    const filteredAttributes = getters.getFilteredAttributes(state);
    if (filteredAttributes.length) {
      return filteredAttributes[state.currentAttribute] || null;
    }
    const model: Model = getters.getModel(state) as Model;
    if (model) {
      return state.objectIDMap[model.attributes[state.currentAttribute]] || null;
    }
    return null;
  },
  getModel(state) {
    const modelID = getters.getModelID(state);
    if (modelID) {
      const model = state.objectIDMap[modelID];
      if (model) {
        return model;
      }
    }
    return null;
  },
  getViewCount(state) {
    const model: Model = getters.getModel(state);
    if (model && model.frames !== undefined) {
      if (Array.isArray(model.frames)) {
        return model.frames.length;
      } else {
        return model.frames;
      }
    }
    const product: Product = state.objectIDMap[state.currentProduct] as Product;
    if (product && product.frames !== undefined) {
      if (Array.isArray(product.frames)) {
        return product.frames.length;
      } else {
        return product.frames;
      }
    }
    return 1;
  },
  getViewOrder(state) {
    const model: Model = getters.getModel(state);
    if (model && model.frameorder !== undefined) {
      return model.frameorder;
    }
    const product: Product = state.objectIDMap[state.currentProduct] as Product;
    if (product && product.frameorder !== undefined) {
      return product.frameorder;
    }
    return null;
  },
  getViews(state) {
    const model: Model = getters.getModel(state);
    if (model && model.frames !== undefined) {
      if (Array.isArray(model.frames)) {
        // Convert to radians
        return model.frames.map((f) => f.map((x) => (x * Math.PI) / 180));
      }
    }
    const product: Product = state.objectIDMap[state.currentProduct] as Product;
    if (product && product.frames !== undefined) {
      if (Array.isArray(product.frames)) {
        // Convert to radians
        return product.frames.map((f) => f.map((x) => (x * Math.PI) / 180));
      }
    }
    return [];
  },
  getProductView(state) {
    const renderContext = getters.getProductRenderingContext(state);
    const frameOrder = getters.getViewOrder(state);
    if (frameOrder && renderContext == "2D" && typeof state.productView == "number") {
      return frameOrder[state.productView] || 0;
    }
    if (Array.isArray(state.productView)) {
      // convert to radians
      return state.productView.map((x) => (x * Math.PI) / 180);
    }
    return state.productView;
  },
  getViewInterfaceType(state) {
    let interfaceType = "default";
    const model: Model = getters.getModel(state);
    if (model && model.interface) {
      interfaceType = model.interface;
    } else {
      const product: Product = state.objectIDMap[state.currentProduct] as Product;
      if (product && product.interface) {
        interfaceType = product.interface;
      }
    }
    if (params.isString("interface")) {
      interfaceType = params.getString("interface");
    }
    return interfaceType;
  },
  getSessionPoses3d(state) {
    const model: Model = getters.getModel(state);
    if (model && model.sessionposes3d) {
      return model.sessionposes3d;
    }
    const product: Product = state.objectIDMap[state.currentProduct] as Product;
    if (product && product.sessionposes3d) {
      return product.sessionposes3d;
    }
    return null;
  },
  getMaterialSize(state) {
    let max = [Infinity, Infinity];
    if (params.isString("gr:max-material-size")) {
      max = params
        .getString("gr:max-material-size")
        .split(",")
        .map((x) => Number((!isNaN(x as any) && x) || Infinity));
    }
    let size = [1024, 1024];
    const model: Model = getters.getModel(state);
    if (model && model.materialsize) {
      size = model.materialsize;
    }
    const product: Product = state.objectIDMap[state.currentProduct] as Product;
    if (product && product.materialsize) {
      size = product.materialsize;
    }
    return [Math.min(size[0], max[0]), Math.min(size[1], max[1])];
  },
  getProductImageSizingMode(state) {
    const product: Product = state.objectIDMap[state.currentProduct] as Product;
    if (product) {
      if (product.dimensions == "fill") {
        return "fill";
      }
    }
    return "fixed";
  },
  getProductAspectRatio(state) {
    const product: Product = state.objectIDMap[state.currentProduct] as Product;
    if (product) {
      if (product.aspectratio) {
        return product.aspectratio;
      }
      if (Array.isArray(product.dimensions)) {
        return product.dimensions[0] / product.dimensions[1];
      }
    }
    return 1;
  },
  getFilteredAttributes(state) {
    const model: Model = getters.getModel(state);
    if (model) {
      const attributes = model.attributes.map<Attribute>((x) => state.objectIDMap[x] as any).filter((x) => x);
      return attributes.filter((x) =>
        utils.standardAttributeFilter(x, getters.getRestrictions(state), getters.getIndexedEnablers(state)),
      );
    }
    return [];
  },
  getModelID(state) {
    if (state.selectedOptions && state.selectedOptions[state.currentProduct]) {
      const modelID = state.selectedOptions[state.currentProduct].model;
      return modelID;
    } else if (starters.models && starters.models[state.currentProduct]) {
      const modelID = starters.models[state.currentProduct];
      return modelID;
    }
    return "";
  },
  getSeries(state) {
    const seriesID = getters.getSeriesID(state);
    if (seriesID) {
      const series = state.objectIDMap[seriesID];
      if (series) {
        return series;
      }
    }
    return null;
  },
  getSeriesID(state) {
    if (state.selectedOptions && state.selectedOptions[state.currentProduct]) {
      const seriesID = state.selectedOptions[state.currentProduct].series;
      return seriesID;
    } else if (starters.series && starters.series[state.currentProduct]) {
      const seriesID = starters.series[state.currentProduct];
      return seriesID;
    }
    return "";
  },
  getProductBackground(state) {
    const model: Model = getters.getModel(state);
    if (model && model.background) {
      return model.background;
    }
    const product: Product = state.objectIDMap[state.currentProduct] as Product;
    if (product && product.background) {
      return product.background;
    }
    return "";
  },
  getProductCompletion(state) {
    return utils.fishCompletion(
      state.selectedOptions[state.currentProduct],
      getters.getRestrictions(state),
      getters.getIndexedEnablers(state),
    );
  },
  getProductCompletionMinimal(state) {
    const isCompleted = utils.fishCompletion(
      state.selectedOptions[state.currentProduct],
      getters.getRestrictions(state),
      getters.getIndexedEnablers(state),
      true,
      false,
    );
    if (!("fishCompletion" in window)) {
      (window as any).fishCompletion = () => {
        return utils.fishCompletion(
          state.selectedOptions[state.currentProduct],
          getters.getRestrictions(state),
          getters.getIndexedEnablers(state),
          true,
          false,
        );
      };
    }
    return isCompleted;
  },
  getProductCompletionBlocker(state) {
    if (state.selectedOptions[state.currentProduct]) {
      const stepGroups = state.selectedOptions[state.currentProduct].selections;
      // structure.traverse(stepGroups, (casing: OptionCasing, path) => {
      //   if (!utils.fishCompletion())
      // })
      // for (const key in stepGroups) {
      //   if (Object.prototype.hasOwnProperty.call(stepGroups, key)) {
      //     const group = structure.getFilteredStructure(stepGroups[key]);
      //     if (!utils.fishCompletion(group)) {

      //     }
      //   }
      // }
      return utils.findIncompleted(stepGroups, getters.getRestrictions(state), getters.getIndexedEnablers(state));
    }
    return null;
  },
  getShareURL(state) {
    return location.origin + location.pathname + "?id=" + state.sessionID;
  },
  getEncodedShareURL(state) {
    return encodeURIComponent(getters.getShareURL(state));
  },
  getShortShareURL(state) {
    return location.host + location.pathname + "?id=" + state.sessionID;
  },
  getBasePrice(state) {
    let mrBasePrice = 0;
    // Try to get the base price from the model
    if (
      state.selectedOptions[state.currentProduct]?.model &&
      state.objectIDMap[state.selectedOptions[state.currentProduct].model]
    ) {
      const model = state.objectIDMap[state.selectedOptions[state.currentProduct].model] as Model;
      const baseprice = utils.getBasePrice(model, state.currentProduct);
      if (baseprice) {
        mrBasePrice += baseprice;
      }
    }

    // Try to get it from the product now
    mrBasePrice += woocommerce.getProductPrice(state.currentProduct);

    return mrBasePrice;
  },
  getPrice(state, includeOtherProductPrices = true) {
    state.priceEnforcer;
    let baseprice = getters.getBasePrice(state);
    const series = getters.getSeries(state);
    // Factor in the series price too
    if (series) {
      baseprice += utils.getNumber(
        utils.getOptionUpcharge(
          series,
          {
            woocommerceName: "addon-" + woocommerce.getProduct(state.currentProduct) + "-series",
          } as OptionCasing,
          state.currentProduct,
          baseprice,
        ),
      );
    }
    if (state.selectedOptions && state.currentProduct) {
      return (
        utils.digOutUpcharges(
          state.selectedOptions[state.currentProduct]?.selections,
          getters.getRestrictions(state),
          getters.getIndexedEnablers(state),
          state.currentProduct,
          getters.getWoocommerceMods(state),
          includeOtherProductPrices !== false,
        ) + baseprice
      );
    }
    return baseprice;
  },
  getPercentages(state) {
    if (state.selectedOptions && state.currentProduct) {
      const p = utils.digOutPercentages(
        state.selectedOptions[state.currentProduct]?.selections,
        getters.getRestrictions(state),
        getters.getIndexedEnablers(state),
        state.currentProduct,
        getters.getWoocommerceMods(state),
      );
      return p;
    }
    return 0;
  },
  getTotalPrice(state, includeOtherProductPrices = true) {
    const baseprice = getters.getBasePrice(state);
    const price = getters.getPrice(state, includeOtherProductPrices !== false);
    const percentages = getters.getPercentages(state);

    let virtualPricing = 0;
    if (includeOtherProductPrices !== false) {
      const virtualProducts = utils.digOutWooProducts(
        state.selectedOptions[state.currentProduct]?.selections,
        getters.getRestrictions(state),
        getters.getIndexedEnablers(state),
        state.currentProduct,
        getters.getWoocommerceMods(state),
        state.objectIDMap,
        true,
      );
      virtualPricing = virtualProducts.reduce((a, x) => a + x.price, 0);
    }

    const total = price + (percentages / 100) * baseprice + virtualPricing;
    return Math.round(total * 100) / 100;
  },
  getWooPrices(state, gets) {
    // Get the price of the base product X quantity + any additional woo products selected
    const additionalProducts = utils.digOutWooProducts(
      state.selectedOptions[state.currentProduct]?.selections,
      getters.getRestrictions(state),
      getters.getIndexedEnablers(state),
      state.currentProduct,
      getters.getWoocommerceMods(state),
      state.objectIDMap,
    );
    return [
      {
        wooid: woocommerce.getProduct(state.currentProduct),
        name: getters.getProductName(state),
        price: getters.getTotalPrice(state, false),
        quantity: gets.getLikelyQuantity,
      },
      ...additionalProducts,
    ];
  },
  getLikelyQuantity(state, gets) {
    if (state.selectedOptions && state.currentProduct) {
      const quantities: number[] = [];
      structure.traverse(state.selectedOptions[state.currentProduct]?.selections, (casing: OptionCasing) => {
        const usingMainProduct =
          !casing.woocommerceProduct || casing.woocommerceProduct == woocommerce.getProduct(state.currentProduct);
        if (usingMainProduct && casing.value && "wcvalue" in casing.value && casing.value.wcvalue) {
          // Check if any quantity directives are embedded in the wcvalue
          const valueString = casing.value.wcvalue.startsWith("$")
            ? casing.value[casing.value.wcvalue.slice(1, -1)] ||
              casing.getMetaData(casing.value.wcvalue.slice(1, -1)) ||
              ""
            : casing.value.wcvalue;
          const values = valueString.split("|||");
          for (let i = 0; i < values.length; i++) {
            const [_, qty] = values[i].split(":::");
            quantities[i] = Math.max(
              parseInt(qty, 10) || gets.getDefaultQuantity,
              quantities[i] || gets.getDefaultQuantity,
            );
          }
        }
      });
      return quantities.reduce((a, b) => a + b, 0);
    }
    return 1;
  },
  getDefaultQuantity(state, gets) {
    const model = gets.getModel;
    if (model && typeof model.defaultquantity === "number") {
      return model.defaultquantity;
    }
    const product = state.objectIDMap[state.currentProduct] as Product;
    if (product && typeof product.defaultquantity === "number") {
      return product.defaultquantity;
    }
    return 1;
  },
  getMobileWidth(state) {
    const product = state.objectIDMap[state.currentProduct] as Product;
    if (product && product.mobilewidth) {
      return product.mobilewidth;
    }
    return 500;
  },
  getGlobalStateIndex(state) {
    const index = {
      options: {} as { [id: string]: OptionCasing[] },
    };

    if (state.selectedOptions[state.currentProduct]?.selections) {
      const struct = state.selectedOptions[state.currentProduct].selections;
      structure.traverse(struct, (casing: OptionCasing) => {
        if (casing.value) {
          // Add casing to the option selections index
          if (!index.options[casing.value.id]) {
            index.options[casing.value.id] = [];
          }
          index.options[casing.value.id].push(casing);
        }
      });
    }

    return index;
  },
  getRestrictions(state): { [key: string]: Array<Array<string>> } {
    const obj: { [key: string]: Array<Array<string>> } = {};
    const filteredStruct = structure.getFilteredStructure(
      state.selectedOptions[state.currentProduct]?.selections || {},
    );
    structure.traverse(filteredStruct, (casing: OptionCasing) => {
      if (casing.value && "restrict" in casing.value && casing.value.restrict) {
        const restrictions = casing.value.restrict instanceof Array ? casing.value.restrict : [casing.value.restrict];
        for (let i = 0; i < restrictions.length; i++) {
          const restriction = restrictions[i];
          // Check to see if the restriction id valid based off it's extra rules
          if (restriction instanceof Object && restriction.extrarules) {
            if (!evalApplicationConditions(restriction.extrarules, state)) {
              continue;
            }
          }
          const idv: string = (restriction as any).id || restriction;
          const ids = Array.isArray(idv) ? idv : [idv];
          for (let j = 0; j < ids.length; j++) {
            const id = ids[j];
            let noEmpty = true;
            if (!obj[id]) {
              obj[id] = [];
            }
            if (restriction instanceof Object) {
              obj[id].push(restriction.path);
            } else if (noEmpty) {
              noEmpty = false;
              obj[id].push([]);
            }
          }
        }
      }
    });
    return obj;
  },
  getEnablers(state): Array<string> {
    if (state.selectedOptions[state.currentProduct]) {
      return Object.keys(getters.getIndexedEnablers(state));
    }
    return [];
  },
  getIndexedEnablers(state): { [key: string]: string[][] } {
    const filteredStruct = structure.getFilteredStructure(
      state.selectedOptions[state.currentProduct]?.selections || {},
    );
    const obj: { [key: string]: string[][] } = {};
    structure.traverse(filteredStruct, (casing: OptionCasing) => {
      if (casing.value && "enable" in casing.value && casing.value.enable) {
        const enablers = casing.value.enable instanceof Array ? casing.value.enable : [casing.value.enable];
        for (let i = 0; i < enablers.length; i++) {
          const enabler = enablers[i];
          if (enabler instanceof Object) {
            const ids = enabler.id instanceof Array ? enabler.id : [enabler.id];
            // Make sure the object we are enabling exists and is disabled
            for (let i = 0; i < ids.length; i++) {
              const id = ids[i];
              if ((state.objectIDMap[id] as any)?.disabled) {
                if (enabler.extrarules) {
                  if (!evalApplicationConditions(enabler.extrarules, state)) {
                    continue;
                  }
                }
                if (!(id in obj)) {
                  obj[id] = [];
                }
                if (enabler.path) {
                  obj[id].push(enabler.path);
                }
              }
            }
          } else if (!(enabler in obj) && (state.objectIDMap[enabler] as any)?.disabled) {
            obj[enabler] = [];
          }
        }
      }
    });
    return obj;
  },
  getModelClasses(state) {
    const classes: { [key: string]: Array<string> } = {};
    const product: Product = state.objectIDMap[state.currentProduct] as Product;
    if (product) {
      const models = product.models.map((id) => state.objectIDMap[id] as Model).filter((o) => o);
      for (let i = 0; i < models.length; i++) {
        const model = models[i];
        for (const key in model.classes) {
          if (Object.prototype.hasOwnProperty.call(model.classes, key)) {
            const klass = model.classes[key];
            if (!(key in classes)) {
              classes[key] = [];
            }
            if (klass instanceof Array) {
              classes[key].push(...klass.filter((n) => !classes[key].includes(n)));
            } else if (!classes[key].includes(klass)) {
              classes[key].push(klass);
            }
          }
        }
      }
    }
    return classes;
  },
  getFillerPimcos(state) {
    const model: Model = getters.getModel(state);
    const series: SeriesInfo = getters.getSeries(state);
    const fillers = model?.pimcofiller ? [...model.pimcofiller] : [];
    if (series && series.pimcofiller) {
      fillers.push(...series.pimcofiller);
    }
    const contributions: {
      [key: string]: Array<ProductImageContributer>;
    } = {};
    // Transform the data into contributions
    for (let i = 0; i < fillers.length; i++) {
      const filler = fillers[i];
      if (filler instanceof Object) {
        // This scenario should be generic color contributers only
        const options = (filler.option instanceof Array ? filler.option : [filler.option]).map(
          (id) => state.objectIDMap[id],
        ) as Array<Option>;
        for (let i = 0; i < options.length; i++) {
          const option = options[i];
          if (option && "pimco" in option && option.pimco && "USECASCADING" in option.pimco) {
            const contributer = option.pimco.USECASCADING;
            const pimcos: any = filler.pimco instanceof Array ? filler.pimco : [filler.pimco];
            for (let i = 0; i < pimcos.length; i++) {
              const pimco = pimcos[i];
              if (!(pimco in contributions)) {
                contributions[pimco] = [];
              }
              if (contributer) {
                // If a priority is specified treat the pimco like it's not a filler
                const clone = filler.priority === undefined ? { filler: true } : { priority: filler.priority };
                contributions[pimco].push(Object.assign(clone, contributer));
              }
            }
          }
        }
      } else {
        const option = state.objectIDMap[filler] as Option;
        if (option && "pimco" in option && option.pimco) {
          if ("USECASCADING" in option.pimco) {
            // This is a generic color contributer and this scenario should never happen
          } else {
            const pimcoIDs = Object.keys(option.pimco);
            for (let i = 0; i < pimcoIDs.length; i++) {
              const pimco = pimcoIDs[i];
              if (!(pimco in contributions)) {
                contributions[pimco] = [];
              }
              if (option.pimco[pimco]) {
                contributions[pimco].push(Object.assign({ filler: true }, option.pimco[pimco]));
              }
            }
          }
        }
      }
    }
    return contributions;
  },
  getOrderedPimcos(state) {
    if (state.pimcoUpdater) {
      // Do literally nothing. We just needs to trigger a reactivity update
    }
    // Run the contributions through the filter
    const filteredContributions = pimcos.filterContributions(
      getters.getPimcoContributers(state),
      getters.getRestrictions(state),
      getters.getIndexedEnablers(state),
    );
    const currentView = getters.getProductView(state);
    // Compile all the pimco contributions into a nice list of pimcos
    const lePimcos = pimcos.compilePimcoContributions(
      state.pimcos,
      filteredContributions,
      getters.getFillerPimcos(state),
      getters.getModel(state),
      currentView,
      getters.getMobileWidth(state),
      state.existingAssets,
    );
    if (starters.dev) {
      if (params.has("pimco-limit")) {
        const limit = params.get("pimco-limit");
        if (typeof limit == "number") {
          return lePimcos.slice(0, limit);
        } else if (typeof limit == "string") {
          // See if its a range
          const range = limit.split("-").map((x) => Number(x));
          if (range.length == 2) {
            return lePimcos.slice(range[0], range[1]);
          }
        }
      }
      if (params.has("pimco-disable")) {
        const pimcoIDs = params.getString("pimco-disable").split(",");
        return lePimcos.filter((x) => !pimcoIDs.includes(x.id));
      }
    }
    return lePimcos;
  },
  getCheckoutConfirmations(state) {
    const confirmations: string[] = [
      "I understand and agree to the <a href='https://nokona.com/warranty-returns/' target='_blank'>terms of service.</a>",
    ];
    if (state.selectedOptions[state.currentProduct]) {
      structure.traverse(state.selectedOptions[state.currentProduct].selections, (casing: OptionCasing) => {
        if (casing.value && "atcheckout" in casing.value && casing.value.atcheckout) {
          confirmations.push(casing.value.atcheckout);
        }
      });
    }
    return confirmations;
  },
  getPreConfigData(state) {
    const product: Product = state.objectIDMap[state.currentProduct] as any;

    if (product?.startpage?.data) {
      if (typeof product.startpage.data == "string") {
        if (!state.preConfigData[product.id]) {
          // This is a little unorthadox, but it allows for the most efficiency
          actions.fetchPreConfigData({ state } as any, {
            url: product.startpage.data,
            product: product.id,
          });
        }
        return state.preConfigData[product.id] || null;
      }
      return product.startpage.data;
    }
    return null;
  },
  getIndexedCloneMutations(state) {
    const unfilteredCasings = structure.toArray(state.selectedOptions);
    const casings = unfilteredCasings.filter(
      (c) => c.value?.type == "GrandClonerOption",
    ) as OptionCasing<GrandClonerOption>[];
    const branchMap = utils.mapObjectKeys(unfilteredCasings as any, (v: OptionCasing) => v.branchID);
    const mutationMap: { [key: string]: OrderCloneMutation[] } = {};
    for (let i = 0; i < casings.length; i++) {
      const casing = casings[i];
      const key = casing.branchID + "-" + casing.value!.id;
      mutationMap[key] = casing.value!.mutations.filter(
        (x) =>
          // This looks really complicated, so let me explain
          // The mutation need to reference a branch, next the branch
          // has to exist within the structure. After that the branch
          // needs to have a not-null value. If the mutation type is
          // not 'text' OR the value has text on it or is required no
          // matter what, then we let it pass :)
          !("branch" in x) ||
          (x.branch in branchMap &&
            branchMap[x.branch]?.value &&
            (x.type != "text" ||
              ("text" in branchMap[x.branch].value! &&
                ((branchMap[x.branch].value as ComplexTypeOption).required ||
                  (!(branchMap[x.branch].value as ComplexTypeOption).required &&
                    (branchMap[x.branch].value as ComplexTypeOption).text))))),
      );
    }
    return mutationMap;
  },
  getDerivedCloneFieldData(state) {
    const cloneMeta = state.selectedOptions[state.currentProduct].cloneMeta || {};
    const mutationMap: { [key: string]: OrderCloneMutation[] } = getters.getIndexedCloneMutations(state);
    return utils.mapObject(mutationMap, (mutations, key) => {
      const branch = structure.branch(key.split("-")[0]);
      // console.log("cheese", mutationMap, branch);
      // if (branch?.branchID == "brcQ718725439") {
      //   console.log(
      //     branch.value,
      //     !branch.required && "text" in branch.value! && branch.value.text
      //   );
      // }
      if (
        branch?.value //&&
        // (branch.required ||
        //   (!branch.required && "text" in branch.value && branch.value.text))
      ) {
        let metaSets = cloneMeta[key] ? [...cloneMeta[key]] : [];
        const firstMetaSet: {
          key: string;
          value: any;
          ref: boolean;
        }[] = metaSets[0];
        if (!firstMetaSet) {
          // Push on a first meta set
          metaSets.unshift(mutations.map((m) => utils.deriveCloneMetaField(m, 1, [])).filter((x) => x) as any);
        } else {
          metaSets = metaSets.map(
            (metaSet, i) => mutations.map((m) => utils.deriveCloneMetaField(m, i + 1, metaSet)).filter((x) => x) as any,
          );
        }
        // Replace the $pid$ marker with the actual woo commerce product id
        // const wooid = woocommerce.getProduct(state.currentProduct) as string;
        // for (let i = 0; i < metaSets.length; i++) {
        //   const metaSet = metaSets[i];
        //   for (let j = 0; j < metaSet.length; j++) {
        //     const meta = metaSet[j];
        //     meta.key = meta.key.replace("$pid$", wooid);
        //   }
        // }
        return metaSets.filter((x) => x.length);
      }
      return [];
    });
  },
  getWoocommerceMods(state) {
    const modMap: { [key: string]: string } = {};
    if (state.selectedOptions[state.currentProduct]) {
      structure.traverse(state.selectedOptions[state.currentProduct].selections, (casing: OptionCasing) => {
        if (casing.value && "wcmod" in casing.value && casing.value.wcmod) {
          modMap[casing.branchID] = casing.value.wcmod;
        }
      });
    }
    return modMap;
  },
  getPimcoContributers(state): {
    [key: string]: Array<
      ProductImageContributer & {
        ["x-data"]: { attributes: { id: string; disabled?: boolean }[] };
      }
    >;
  } {
    const currentAttributeId = getters.getAttribute(state)?.id;
    const filteredStruct = structure.getFilteredStructure(
      state.selectedOptions[state.currentProduct]?.selections || {},
      currentAttributeId,
    );
    const obj: {
      [key: string]: Array<
        ProductImageContributer & {
          ["x-data"]: { attributes: { id: string; disabled?: boolean }[] };
        }
      >;
    } = {};

    structure.traverse(filteredStruct, (casing: OptionCasing) => {
      // Look for pimcos on the attributes that don't cascade, as they will not be embedded into the options
      const attributes = casing["x-data"]?.attributes || [];
      for (let i = 0; i < attributes.length; i++) {
        const attributeData = attributes[i];
        if (attributeData["disabled"]) continue;
        const attribute = state.objectIDMap[attributeData.id] as Attribute;
        if (attribute && "pimco" in attribute && attribute.pimco) {
          for (const id in attribute.pimco) {
            const contributer = attribute.pimco[id];
            if (contributer.cascade === false) {
              if (!(id in obj)) {
                obj[id] = [];
              }
              obj[id].push(
                Object.assign({ "x-data": casing["x-data"] }, utils.deepObjectExtend({}, contributer)) as any,
              );
            }
          }
        }
      }
      // Get live text compound contributers
      if (casing.value && casing.value.type == "ComplexInitialsOption" && casing.value.text) {
        const modelPatternName: string = getters.getModel(state)?.imgname || "";
        const contributers = deriveTextCompoundContributers(casing.value.text, casing.value, modelPatternName);
        for (const id in contributers) {
          if (Object.prototype.hasOwnProperty.call(contributers, id)) {
            const contributer = contributers[id];
            if (!(id in obj)) {
              obj[id] = [];
            }
            obj[id].push(Object.assign({ "x-data": casing["x-data"] }, contributer) as any);
          }
        }
      }
      // Build live text pimcos
      if (casing.value && "text" in casing.value && casing.value.text && casing.value.pimco) {
        for (const id in casing.value.pimco) {
          if (Object.prototype.hasOwnProperty.call(casing.value.pimco, id)) {
            const contributer = casing.value.pimco[id];
            if (contributer.frames) {
              if (!(id in obj)) {
                obj[id] = [];
              }
              const nester = {};
              for (let i = 0; i < contributer.frames.length; i++) {
                const frame = contributer.frames[i];
                if (frame) {
                  utils.setNested(nester, casing.value.text, ["frames", i + "", "mask", "content"], true);
                }
              }
              obj[id].push(utils.deepObjectExtend({ "x-data": casing["x-data"] }, contributer, nester) as any);
            }
          }
        }
      }
      // Find all the other pimcos
      const contributers = casing.pimcoContributions.map(({ pimco, contributer: c }) => {
        return {
          pimco,
          contributer: Object.assign({ "x-data": casing["x-data"] }, c),
        };
      });
      setPimcos(casing.value, contributers, { productImageContributions: obj } as any, casing);
    });
    return obj;
  },
  getDisableHijacking(state) {
    let disabled = false;
    if (state.stageHijackerPath) {
      const obj = utils.getNested(state.selectedOptions, state.stageHijackerPath);
      if (obj) {
        structure.traverse(obj, (casing: OptionCasing) => {
          if (casing.value?.["dohijack"] === false) {
            disabled = true;
          }
        });
      }
    }
    return disabled;
  },
  getDeviceMeta(state): string {
    const userDeviceParams = utils.getUserDeviceParams();
    return Object.entries(userDeviceParams)
      .map(([key, value]) => `${key}=${value.toString()}`)
      .join(",");
  },
  getStartOverMode(state) {
    if (params.getString("embed")) {
      return "editor";
    }
    const model: Model = getters.getModel(state);
    if (model && model.startover !== undefined) {
      return model.startover;
    }
    const product: Product = state.objectIDMap[state.currentProduct] as Product;
    if (product && product.startover !== undefined) {
      return product.startover;
    }
    return "default";
  },
  getProductRenderingContext(state) {
    if (params.get("m") == "3d-material-test" && starters.dev) {
      return "THREE";
    }
    return (state.objectIDMap[state.currentProduct] as Product)?.rendercontext?.toUpperCase() || "2D";
  },
  getMeshes3D(state) {
    const productRenderingContext = getters.getProductRenderingContext(state);
    if (productRenderingContext == "2D") return [];
    const meshes: Mesh3DReference[] = [];
    const variables: Mesh3DVariables[] = [];
    const model: Model = getters.getModel(state);
    if (model && model.mesh3d) {
      meshes.push(model.mesh3d);
    }
    const attributes: Attribute[] = getters.getFilteredAttributes(state);
    for (let i = 0; i < attributes.length; i++) {
      const attribute = attributes[i];
      if ("meshes3d" in attribute && attribute.meshes3d) {
        for (let j = 0; j < attribute.meshes3d.length; j++) {
          const meshRefOrVars = attribute.meshes3d[j];
          if (isMesh3DVariables(meshRefOrVars)) {
            utils.orderedInsert(variables, meshRefOrVars, (a, b) => (b.priority || 0) - (a.priority || 0));
          } else {
            // If the mesh ref is an object, clone it so we don't modify the original
            meshes.push(typeof meshRefOrVars == "string" ? meshRefOrVars : { ...meshRefOrVars });
          }
        }
      }
    }
    structure.traverse(state.selectedOptions[state.currentProduct]?.selections || {}, (casing: OptionCasing) => {
      if (casing.value && "meshes3d" in casing.value && casing.value.meshes3d) {
        for (let j = 0; j < casing.value.meshes3d.length; j++) {
          const meshRefOrVars = casing.value.meshes3d[j];
          if (isMesh3DVariables(meshRefOrVars)) {
            utils.orderedInsert(variables, meshRefOrVars, (a, b) => (b.priority || 0) - (a.priority || 0));
          } else {
            // If the mesh ref is an object, clone it so we don't modify the original
            meshes.push(typeof meshRefOrVars == "string" ? meshRefOrVars : { ...meshRefOrVars });
          }
        }
      }
    });

    const vars = Object.assign({}, ...variables.map((x) => x.variables));
    // Loop through the meshes and apply the variables
    for (let i = 0; i < meshes.length; i++) {
      let mesh = meshes[i];
      if (typeof mesh == "string") {
        mesh = applyMeshVars(mesh, vars);
        // While we are in here, we might as well apply the version param
        meshes[i] = utils.setVersionParam(mesh);
      } else {
        mesh.path = applyMeshVars(mesh.path, vars);
        // While we are in here, we might as well apply the version param
        mesh.path = utils.setVersionParam(mesh.path);
      }
    }

    return meshes;
  },
  getLights3D(state) {
    if (state.inStudioMode && state.studioLighting) {
      return state.studioLighting;
    }
    const lights: Light3DReference[] = [];
    let model: Model;
    if (params.isString("lights-3d")) {
      // We can now place alternate lights in the scene through
      // encoded lights destriptor strings of length 23
      const lightsData: any[] = [];
      // Check to see if the decoded data has been cached
      if ("__decodedUrlLightsData__" in window && Array.isArray(window["__decodedUrlLightsData__"])) {
        lightsData.push(...window["__decodedUrlLightsData__"]);
      } else {
        const lightsDescriptor = params.getString("lights-3d");
        const bitSchema = {
          color1: 16,
          color2: 16,
          posx: 16,
          posy: 16,
          posz: 16,
          dirx: 16,
          diry: 16,
          dirz: 16,
          strength: 4,
          type: 2,
          shadow: 1,
        };
        for (let i = 0; i < lightsDescriptor.length; i += 23) {
          const lightDescriptor = lightsDescriptor.substring(i, i + 23);
          const lightData = pldToLight3DReference(utils.unpackBitsFromString(lightDescriptor, bitSchema) as any);
          lightsData.push(lightData);
        }
        // Cache the light data on the window object
        window["__decodedUrlLightsData__"] = lightsData;
      }
      lights.push(...lightsData);
    } else if ((model = getters.getModel(state)) && model.lights3d) {
      lights.push(...model.lights3d);
    }
    // If there is no ambient light, add a default one
    if (!lights.find((l) => l.type == "AmbientLight")) {
      lights.push({
        type: "AmbientLight",
        color: 0xffffff,
        intensity: 0.5,
      });
    }
    // If there is no other kind of light, add a default directional light
    if (!lights.find((l) => l.type != "AmbientLight")) {
      lights.push({
        type: "DirectionalLight",
        color: 0xffffff,
        intensity: 0.5,
        position: [-1, 5, 4],
      });
    }
    return lights;
  },
  getMaterialPimcos3D(state) {
    const product: Product = state.objectIDMap[state.currentProduct] as Product;
    if (product?.rendercontext !== "THREE") {
      return {};
    }
    const model: Model = getters.getModel(state);
    if (!model) {
      return {};
    }
    const components: Record<string, Pimco3DMaterialCollection> = {};
    structure.traverse(state.selectedOptions[state.currentProduct]?.selections || {}, (casing: OptionCasing) => {
      // Collect live text pimcos
      if (casing.value && "text" in casing.value && casing.value.text && casing.value.pimco3d) {
        for (const id in casing.value.pimco3d) {
          if (Object.prototype.hasOwnProperty.call(casing.value.pimco3d, id)) {
            if (id == "USECASCADING") {
              continue;
            }
            const contributer = casing.value.pimco3d[id];
            for (const key in contributer) {
              let compList = components[id]?.[key];
              if (!compList) {
                compList = [];
                utils.setNested(components, compList, [id, key], true);
              }
              let text = casing.value.text;
              const contribution: any = {
                mask: { content: text, "x-data": casing["x-data"] },
              };
              if (contributer[key].priority) {
                contribution.priority = contributer[key].priority;
              }
              utils.orderedInsert(compList, contribution, (a, b) => (b.priority || 0) - (a.priority || 0));
            }
          }
        }
      }
      // Collect the pimcos inherited from attributes through the pimcoContributions
      for (let i = 0; i < casing.pimcoContributions.length; i++) {
        const contribution = casing.pimcoContributions[i];
        if (contribution.pimco == "USECASCADING") continue;
        if (!components[contribution.pimco]) {
          components[contribution.pimco] = {};
        }
        for (const key in contribution.contributer) {
          const pimco = contribution.contributer[key];
          if (!components[contribution.pimco][key]) {
            components[contribution.pimco][key] = [];
          }
          // components[contribution.pimco][key].push(pimco);
          utils.orderedInsert(
            components[contribution.pimco][key],
            pimco,
            (a, b) => (b.priority || 0) - (a.priority || 0),
          );
        }
      }
      // Collect the pimcos from currently selected options
      const extractFromSelection = (property: "pimco3d" | "pimco") => {
        // Valid pimco keys
        const validKeys = ["albedo", "orm", "normal", "env", "roughness", "metallic", "ao", "emissive"];
        if (casing.value && property in casing.value && casing.value[property]) {
          const pimco3d = casing.value[property];
          // console.log(pimco3d, casing.pimcoContributions);
          const ids = Object.keys(pimco3d);
          for (let i = 0; i < ids.length; i++) {
            const pimID = ids[i];
            let pimcoCollection = pimco3d[pimID];
            const cascadeStatuses: Record<string, Record<string, boolean | "hollow">> = {};
            let pimcoIDs = [pimID];
            if (pimID == "USECASCADING") {
              pimcoIDs.length = 0;
              // This may be a generic color pimco, which might not have a pimco3d collection
              // If it doesn't, transform it to one and assume the data belongs to the albedo
              if (!Object.keys(pimcoCollection).some((key) => validKeys.includes(key))) {
                pimcoCollection = { albedo: pimcoCollection as any };
              }
              for (let i = 0; i < casing.pimcoContributions.length; i++) {
                const contribution = casing.pimcoContributions[i];
                if (contribution.pimco != "USECASCADING") {
                  pimcoIDs.push(contribution.pimco);
                  for (const key in contribution.contributer) {
                    const name = key as MaterialTextureName;
                    const pimco = contribution.contributer[name] as ProductImageContributer;
                    if (pimco.cascade !== undefined) {
                      if (!cascadeStatuses[contribution.pimco]) {
                        cascadeStatuses[contribution.pimco] = {};
                      }
                      cascadeStatuses[contribution.pimco][name] = pimco.cascade;
                    }
                  }
                }
              }
            }
            for (let j = 0; j < pimcoIDs.length; j++) {
              const pimcoID = pimcoIDs[j];
              if (!components[pimcoID]) {
                components[pimcoID] = {};
              }
              for (const key in pimcoCollection) {
                const pimco = pimcoCollection[key];
                if (!components[pimcoID][key]) {
                  components[pimcoID][key] = [];
                }
                const cascadeStatus = cascadeStatuses[pimcoID]?.[key];
                if (cascadeStatus === false) {
                  continue;
                }
                // components[pimcoID][key].push(pimco);
                utils.orderedInsert(components[pimcoID][key], pimco, (a, b) => (b.priority || 0) - (a.priority || 0));
              }
            }
          }
        }
      };
      extractFromSelection("pimco3d");
      extractFromSelection("pimco");
    });
    // Loop through the components and look for formulas
    for (const id in components) {
      const pimcoSet = components[id];
      for (const key in pimcoSet) {
        const pimcos = pimcoSet[key];
        for (let i = 0; i < pimcos.length; i++) {
          const pimco = pimcos[i] as ProductImageComponent;
          if (pimco.mask instanceof Object) {
            if (pimco.mask.content?.startsWith("formula::")) {
              pimcos[i] = utils.deepObjectExtend({}, pimco, { mask: { content: getters[pimco.mask.content](state) } });
            }
            if (pimco.mask.type?.fontfamily?.includes("formula::")) {
              const formulaName = pimco.mask.type.fontfamily.match(/formula::[\w-_]+/)?.[0];
              if (formulaName) {
                pimcos[i] = utils.deepObjectExtend({}, pimco, {
                  mask: {
                    type: { fontfamily: pimco.mask.type.fontfamily.replace(formulaName, getters[formulaName](state)) },
                  },
                });
              }
            }
          }
        }
      }
    }
    return pimcos.compileMaterialPimcos3D(state.pimcos, components, model, getters.getMobileWidth(state));
  },
  // Add the formulas into the getters
  ...formulas,
});

export default getters;

function deriveTextCompoundContributers(
  chars: string,
  option: ComplexInitialsOption | null,
  modelPatternName: string,
): { [pimco: string]: ProductImageContributer } {
  if (
    chars.length &&
    option?.pimcodata &&
    option.pimcodata.regionmap &&
    option.pimcodata.framenames &&
    option.pimcodata.imagepath &&
    modelPatternName
  ) {
    const scheme =
      option.pimcodata.imagepath + "$pattern$_$frame$_number_$comp$_$region$".replace("$pattern$", modelPatternName);
    let regionmap = option.pimcodata.regionmap;
    const framenames = option.pimcodata.framenames;
    if (option.mode == "numeric") {
      const regionmaps = regionmap instanceof Array ? regionmap : [regionmap];
      // Get the first and second numbers
      const firstChar = chars.substr(0, 1);
      const secondChar = chars.substr(1, 1);
      const imgComps = [firstChar];
      // If there's another number
      if (secondChar && Array.isArray(regionmap) && regionmap.length > 1) {
        imgComps[0] += "-l";
        imgComps.push(secondChar + "-r");
      }
      const contributers: { [pimco: string]: ProductImageContributer } = {};
      for (let i = 0; i < regionmaps.length; i++) {
        const regionmap = regionmaps[i];
        const name = imgComps[i];
        if (name) {
          Object.assign(
            contributers,
            utils.mapObject(regionmap, (region: string, key, ri) => {
              return {
                frames: framenames.map((fname) => {
                  if (fname === null) {
                    return null;
                  }
                  const currentScheme = scheme.replace("$frame$", fname);
                  return {
                    image: currentScheme.replace("$comp$", name).replace("$region$", "base") + ".avif",
                    mask: currentScheme.replace("$comp$", "mask_" + name).replace("$region$", region) + ".avif",
                    hlimage1: currentScheme.replace("$comp$", name).replace("$region$", "highlight") + ".avif",
                    order: 5 + ri * 0.1,
                  };
                }),
              };
            }),
          );
        }
      }
      return contributers;
    } else {
      regionmap = regionmap instanceof Array ? regionmap[0] : regionmap;
      // If we are accepting alpha characters
      const name = chars.length > 1 ? "xx" : "x";
      return utils.mapObject(regionmap, (region: string) => {
        return {
          frames: framenames.map((fname) => {
            if (fname === null) {
              return null;
            }
            const currentScheme = scheme.replace("$frame$", fname);
            return {
              image: currentScheme.replace("$comp$", name).replace("$region$", "base") + ".avif",
              mask: currentScheme.replace("$comp$", "mask_" + name).replace("$region$", region) + ".avif",
              hlimage1: currentScheme.replace("$comp$", name).replace("$region$", "highlight") + ".avif",
              order: 5,
            };
          }),
        };
      });
    }
  }
  return {};
}

function isMesh3DVariables(value: any): value is Mesh3DVariables {
  return typeof value == "object" && "type" in value && value.type == "Mesh3DVariables";
}

function applyMeshVars(meshpath: string, vars: Mesh3DVariables["variables"]): string {
  const matches = meshpath.match(/\$[a-zA-Z0-9_\-]+\$/g);
  if (matches) {
    for (let j = 0; j < matches.length; j++) {
      const match = matches[j];
      const key = match.slice(1, -1);
      if (key in vars) {
        meshpath = meshpath.replace(match, vars[key] + "");
      }
    }
  }
  return meshpath;
}
