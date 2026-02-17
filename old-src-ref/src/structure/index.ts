import { CertifierFunction, OptionCasing, SetterFunction } from "./OptionCasing";
export { OptionCasing } from "./OptionCasing";
import utils from "@/utils";
import woocommerce from "@/woocommerce";
import {
  Option,
  Attribute,
  Product,
  ComplexSubAttribute,
  GrandSubAttribute,
  GrandAddonAttribute,
  Model,
  ProductImageContributer,
  ComplexSubOptionData,
} from "../types";
import pimcos from "@/pimcos";

const names = ["products", "models", "attributes", "options", "leathers", "pimcos"]; // arr1
const datas: any = {};

const branches: { [id: string]: OptionCasing } = {};

const mimicIndex: { [branch: string]: OptionCasing[] } = {};

// Building the structures for the selections requires asyncronous work, so these
// object hold the data until the promises can be fulfilled

// Callbacks and data for building selections structure
const cbs = {
  res: null,
  rej: null,
  model: "",
  product: "",
  setter: null,
  certifier: null,
  clear() {
    this.res = null;
    this.rej = null;
    this.model = "";
    this.product = "";
    this.setter = null;
    this.certifier = null;
  },
};
// Callback and data for building product scafolding
const cbsP = {
  res: null,
  rej: null,
  clear() {
    this.res = null;
    this.rej = null;
  },
};

const module = {
  recieve(data: Array<any>, name: string) {
    if (names.includes(name)) {
      (datas as any)[name] = data;
      if (hasData()) {
        if (cbs.res && cbs.model && cbs.product) {
          const wooID = woocommerce.getProduct(cbs.product);
          (cbs as any).res(buildStructure(cbs.model, cbs.setter as any, cbs.certifier as any, String(wooID)));
          cbs.clear();
        }
      }
      if (datas.products) {
        if (cbsP.res) {
          (cbsP as any).res(buildProductsStructure());
          cbsP.clear();
        }
      }
    }
  },
  products(): Promise<any> {
    // Create the base object for the selectedOptions in the store
    if (datas.products) {
      return new Promise((res, rej) => {
        res(buildProductsStructure());
      });
    } else {
      return new Promise((res, rej) => {
        setTimeout(() => {
          if (!datas.products) {
            rej(
              new Error(
                "Promise TIMEOUT! Took too long to recieve adequate data. " +
                  `Missing data for ${names.filter((name) => !datas[name]).join(", ")}.`
              )
            );
          }
        }, 20000);
        (cbsP as any).res = res;
        (cbsP as any).rej = rej;
      });
    }
  },
  build(
    model: string,
    product: string,
    setterFunction: SetterFunction,
    certifier: CertifierFunction
  ): Promise<{
    structure: any;
  }> {
    // Create the selections structure for the specific product and model selected
    if (hasData()) {
      return new Promise((res, rej) => {
        const wooID = woocommerce.getProduct(cbs.product);
        const buildResult = buildStructure(model, setterFunction, certifier, String(wooID));
        res(buildResult);
      });
    } else {
      return new Promise((res, rej) => {
        setTimeout(() => {
          if (!hasData()) {
            rej(
              new Error(
                "Promise TIMEOUT! Took too long to recieve adequate data. " +
                  `Missing data for ${names.filter((name) => !datas[name]).join(", ")}.`
              )
            );
          }
        }, 20000);
        (cbs as any).res = res;
        (cbs as any).rej = rej;
        (cbs as any).model = model;
        (cbs as any).product = product;
        (cbs as any).setter = setterFunction;
        (cbs as any).certifier = certifier;
      });
    }
  },
  // A utility function used to conveniently traverse the structure of the selections object.
  traverse(
    structureObject: object,
    callback: (casing: any, path: Array<string>, key: string) => void,
    evaluator?: (object: any, key: string, path: string[]) => boolean
  ) {
    traverseRecursion(structureObject, callback, evaluator);
  },
  branch<T extends Option | null = Option | null>(id: string | string[]): OptionCasing<T> | null {
    if (typeof id == "string" && id in branches) {
      return branches[id] as any;
    }
    id = Array.isArray(id) ? id : [id];
    id = id.join(",");
    // For fun, let's add another mode, where you can pass back
    // the first branch found with a path key that matches the id.
    const exactMatch = Object.values(branches).find((b) => {
      const path = b.getPath().join(",");
      return path == id;
    }) as any;
    if (exactMatch) {
      return exactMatch;
    }
    // If that fails, try finding a branch whose path contains the id as a segment
    const partialMatch = Object.values(branches).find((b) => {
      const path = b.getPath().join(",");
      return path.includes(id);
    }) as any;
    if (partialMatch) {
      return partialMatch;
    }
    return null;
  },
  reset(names?: Array<string>) {
    clearAllData(names);
  },
  getCurrentBranchOrder(casingGroup: { [key: string]: OptionCasing }, includeParallel = false) {
    let currCasing = Object.values(casingGroup).find((x) => x.order == 0) || null;
    if (!currCasing) {
      console.log(casingGroup);
      throw new Error(
        "Top level casing could not be found within option casing group. Please review key names within attribute option tree."
      );
    }
    const casings: OptionCasing[] = [currCasing];
    const parallelKeys: string[] = [];
    while (currCasing) {
      if (hasValidNextLayer(currCasing)) {
        // If this option has comrades, throw the comrade keys onto the parallel key queue
        if (includeParallel && hasValidParallelLayer(currCasing)) {
          parallelKeys.push(...getParallelKeys(currCasing.value!));
        }
        currCasing = casingGroup[currCasing.value!.suboptions.key] || null;
      } else if (parallelKeys.length) {
        const key = parallelKeys.shift()!;
        if (key in casingGroup) {
          // casings.push(casingGroup[key]);
          currCasing = casingGroup[key];
        }
      } else {
        currCasing = null;
      }
      if (currCasing) {
        casings.push(currCasing);
      }
    }
    return casings;
  },
  getCurrentBranchStructure(casingGroup: { [key: string]: OptionCasing }) {
    let currKey = Object.keys(casingGroup).find((x) => casingGroup[x].order == 0) || null;
    if (!currKey) {
      console.log(casingGroup);
      throw new Error(
        "Top level casing could not be found within option casing group. Please review key names within attribute option tree."
      );
    }
    const casings: { [key: string]: OptionCasing } = {
      [currKey]: casingGroup[currKey],
    };
    const parallelKeys: string[] = [];
    let i = 0;
    while (currKey) {
      const currCasing = casingGroup[currKey];
      if (hasValidNextLayer(currCasing)) {
        const key = currCasing.value!.suboptions.key;
        currKey = key in casingGroup ? key : null;
        // If this option has comrades, throw the comrade keys onto the parallel key queue
        if (hasValidParallelLayer(currCasing)) {
          parallelKeys.push(...getParallelKeys(currCasing.value!));
        }
      } else if (parallelKeys.length) {
        const key = parallelKeys.shift()!;
        currKey = key in casingGroup ? key : null;
      } else {
        currKey = null;
      }
      if (currKey) {
        casings[currKey] = casingGroup[currKey];
      }
      i++;
    }
    return casings;
  },
  getFilteredStructure(casingNest: object, currentAttribute?: string): object {
    if (casingNest instanceof OptionCasing) return casingNest;
    const newObj = {};
    if (
      casingNest &&
      Object.keys(casingNest).every((key) => key == "x-data" || casingNest[key] instanceof OptionCasing) &&
      Object.keys(casingNest).length
    ) {
      // We have a casing group, filter out the unused branches
      // Determine if the groups pimcos should be ignored based on their virtual status
      // Ignore this group if the attribute that created this group is:
      // - A virtual attribute template
      // - A virtual attribute that isn't being viewed, or it isn't a member of the current top-level attribute, and the attribute isn't a wildcard
      const ignore = // Sorry for this mess 🤮
        casingNest["x-data"]?.templated ||
        (casingNest["x-data"]?.virtual !== undefined &&
          (!casingNest["x-data"]?.viewing || casingNest["x-data"].attributes?.[0]?.id !== currentAttribute) &&
          currentAttribute !== "*");
      // console.log({ ignore });
      if (!ignore) {
        Object.assign(newObj, {
          ...module.getCurrentBranchStructure(casingNest as any),
          "x-data": casingNest["x-data"],
        });
      }
    } else if (casingNest instanceof OptionCasing || typeof casingNest != "object") {
      // Basically capture any type of value that couldn't possibly be a casing nest
      Object.assign(newObj, casingNest);
    } else {
      for (const key in casingNest) {
        if (Object.prototype.hasOwnProperty.call(casingNest, key)) {
          const subObject = casingNest[key];
          if (subObject instanceof Object && key != "x-data") {
            newObj[key] = module.getFilteredStructure(subObject, currentAttribute);
          } else {
            newObj[key] = subObject;
          }
        }
      }
    }
    return newObj;
  },
  toArray(casingNest: object, filter = false): OptionCasing[] {
    if (filter) {
      casingNest = module.getFilteredStructure(casingNest);
    }
    const arr: OptionCasing[] = [];
    module.traverse(casingNest, (casing) => arr.push(casing));
    return arr;
  },
  getObject: get,
  getDefault(optionHolder: any, altList?: string[]): Option | null {
    if (!optionHolder) {
      return null;
    }
    // This function really does all the hard work
    let value: string | number | boolean | null = null;
    let list: string[] = [];

    if (optionHolder.options) {
      if (!Array.isArray(optionHolder.options) && "default" in optionHolder.options) {
        value = optionHolder.options.default;
        list = optionHolder.options.options || [];
      }
      if (Array.isArray(optionHolder.options) && optionHolder.default !== undefined) {
        value = optionHolder.default;
        list = optionHolder.options || [];
      }
    } else if (optionHolder.suboptions) {
      if ("default" in optionHolder.suboptions) {
        value = optionHolder.suboptions.default;
        list = optionHolder.suboptions.options || [];
      }
    }

    if (altList && altList.length) {
      // If an alternative list is provided, use that instead
      list = altList;
    }

    if (typeof value === "number") {
      value = list[value] || null;
    } else if (value === true) {
      value = list[0] || null;
    }
    if (typeof value === "string" && !list.includes(value)) {
      value = null;
    }

    return get(value as string) || null;
  },
  handleVirtualAttributes<A extends Attribute = Attribute>(
    attributes: A[],
    path: string[],
    selections: Record<string, any>
  ) {
    // Iterate through each attribute and replace any templated attributes with their set of virual attributes
    const attributeHolder = utils.getNested(selections, path);
    if (!attributeHolder) return attributes;
    const newAttributes: A[] = [];
    for (let i = 0; i < attributes.length; i++) {
      const attribute = attributes[i];
      if (
        attribute.name in attributeHolder &&
        attributeHolder[attribute.name] &&
        attributeHolder[attribute.name]["x-data"].templated
      ) {
        const virtualAttributes: A[] = [];
        for (const key in attributeHolder) {
          if (key == "x-data") continue;
          const optionHolder = attributeHolder[key];
          if (optionHolder["x-data"].virtual === attribute.name) {
            const virtual = createVirtualAttribute(attribute as any, optionHolder["x-data"].virtualOrder);
            indexedInsert(virtualAttributes, virtual, optionHolder["x-data"].virtualOrder - 1);
          }
        }
        if (virtualAttributes.length > 0) {
          newAttributes.push(...virtualAttributes);
        } else {
          // Add the templated attribute so that we have a reference for the add button
          newAttributes.push(attribute);
        }
      } else {
        newAttributes.push(attribute);
      }
    }

    return newAttributes;
  },
  createVirtualBranchGroup(templatePath: string[], selections: object): string | null {
    type Group = Record<string, OptionCasing> & {
      "x-data": { templated?: boolean; virtual?: string; virtualOrder?: number };
    };
    const group = utils.getNested(selections, templatePath) as Group | null;
    if (templatePath && group && group["x-data"]?.templated) {
      const holderPath = templatePath.slice(0, -1);
      const templateName = templatePath[templatePath.length - 1];
      const holder = utils.getNested(selections, holderPath) as Record<string, Group>;
      const virtualGroup: Group = {} as any;
      const virtualOrder =
        Object.values(holder).reduce((max, item) => {
          return Math.max(max, item["x-data"]?.virtualOrder || 0);
        }, 0) + 1;
      const newName = templateName.replaceAll("$i", virtualOrder.toString());
      let lastCasing: any = null;
      for (const key in group) {
        if (key == "x-data") {
          virtualGroup["x-data"] = utils.deepObjectExtend({ virtual: templateName, virtualOrder }, group["x-data"]);
          delete virtualGroup["x-data"].templated;
        } else {
          const casing = group[key];
          const clone = casing.clone([...holderPath, newName, key]);
          if (casing["x-data"]) {
            clone["x-data"]!.virtualGroup = ["selections", ...holderPath, newName];
          }
          if (lastCasing) {
            clone.previous = () => lastCasing;
            lastCasing.next = () => clone;
          }
          virtualGroup[key] = clone;
          lastCasing = clone;
        }
      }
      holder[newName] = virtualGroup;
      return newName;
    }
    return null;
  },
  removeVirtualBranchGroup(virtualPath: string[], selections: object) {
    const xData = utils.getNested(selections, virtualPath)!["x-data"];
    if (!xData?.virtual) return;
    const virtualOrder = xData.virtualOrder;
    const template = xData.virtual;
    utils.deleteNested(selections, virtualPath);
    // Now change the name and order of any virtual attributes that came after this one
    const holderPath = virtualPath.slice(0, -1);
    const holder = utils.getNested(selections, holderPath) as Record<string, any>;
    const keys = Object.keys(holder).filter((k) => k != "x-data");
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const item = holder[key];
      if (item["x-data"]?.virtual == template && item["x-data"].virtualOrder > virtualOrder) {
        item["x-data"].virtualOrder--;
        const newName = template.replaceAll("$i", item["x-data"].virtualOrder.toString());
        holder[newName] = item;
        delete holder[key];
      }
    }
  },
  getVirtualBranchGroup<T extends Option = Option>(
    virtualPath: string[],
    selections: object
  ): Record<string, OptionCasing<T>> | null {
    const group = utils.getNested(selections, virtualPath) as Record<string, OptionCasing<T>> | null;
    return group ? utils.filterObject(group, (mem) => mem instanceof OptionCasing) : null;
  },
};

export default module;

if (!(window as any).getBranch) {
  (window as any).getBranch = (id: string) => {
    return branches[id];
  };
}
if (!(window as any).getBranches) {
  (window as any).getBranches = () => {
    return branches;
  };
}

function clearAllData(givenNames?: Array<string>) {
  givenNames = givenNames === undefined ? names : givenNames;
  cbs.clear();
  cbsP.clear();
  clearIndexedCasings();
  givenNames.forEach((name) => {
    if (name !== "products") {
      delete datas[name];
    }
  });
}

function buildProductsStructure() {
  const structure: any = {};
  for (let p = 0; p < datas.products.length; p++) {
    const product: Product = datas.products[p];
    structure[product.id] = {
      selections: {},
      model: "",
    };
    if (product.modes.includes("series")) {
      structure[product.id].series = "";
    }
  }
  return structure;
}

function buildStructure(modelID: string, setter: SetterFunction, certifier: CertifierFunction, wooID?: string) {
  const structure: any = { root: {} };
  const model = get(modelID);
  if (model) {
    recurseAttributes(structure, "root", model, undefined, setter, certifier, [], wooID);
  }
  return structure.root;
}

function recurseAttributes(
  attrObj: any,
  attrKey: string,
  attrHolder: Model | Attribute,
  path: Array<string> = [],
  setter: SetterFunction,
  certifier: CertifierFunction,
  attributes: Attribute[] = [],
  woocommerceID?: string
) {
  const attrObjN = attrObj[attrKey];
  if ("attributes" in attrHolder && "options" in attrHolder) {
    throw new Error(
      `Attribute: ${
        (attrHolder as any).id
      } parents both a list of attributes and a list of options. This is an illegal structure.`
    );
  } else if ("attributes" in attrHolder && attrHolder.attributes) {
    for (let a = 0; a < attrHolder.attributes.length; a++) {
      const attributeID = attrHolder.attributes[a];
      const attribute: Attribute = get(attributeID);
      if (attribute) {
        const accessKey = attribute.name;
        attrObjN[accessKey] = {};
        recurseAttributes(
          attrObjN,
          accessKey,
          attribute,
          [...path, attribute.name],
          setter,
          certifier,
          [...attributes, attribute],
          woocommerceID
        );
        attrObjN[accessKey]["x-data"] = {
          id: attribute.id,
          disabled: (attribute as any).disabled || false,
          attributes: [...attributes, attribute].map((a) => ({
            id: a.id,
            disabled: a.disabled,
          })),
        };
        if ("virtual" in attribute && attribute.virtual) {
          attrObjN[accessKey]["x-data"].templated = true;
        }
      }
    }
  } else if ("options" in attrHolder && attrHolder.options) {
    // Check if options have their own key and need to be further nested
    if (!(attrHolder.options instanceof Array)) {
      const optional = attrHolder.options && attrHolder.options.required === false;
      const wooID = "virtual" in attrHolder && attrHolder.virtual ? attrHolder.virtual.wooid.toString() : woocommerceID;
      const wcname = wooID && attrHolder.options.wcname ? attrHolder.options.wcname.replace("$pid$", wooID) : "";
      const wcproduct = "virtual" in attrHolder && attrHolder.virtual ? attrHolder.virtual.wooid.toString() : undefined;
      recurseOptions(
        attrObjN,
        attrHolder as any,
        true,
        0,
        optional,
        wcname,
        wcproduct,
        undefined,
        [...path],
        setter,
        certifier,
        attributes
      );
    } else {
      // There is only one layer of options so no need to over nest
      const _default = module.getDefault(attrHolder);
      attrObj[attrKey] = new OptionCasing(
        createBranchID(path.join()),
        _default,
        setter,
        certifier,
        0,
        attrHolder.id,
        true,
        pimcos.transformPimcoContribution_STRUCTURE_(attrHolder.pimco, attrHolder.pimco3d)
      );
      // Set the method for retieving the path
      attrObj[attrKey].getPath = () => path;
      indexCasing(attrObj[attrKey]);
      (attrObj[attrKey] as OptionCasing).addAllowedValue(attrHolder.options);
      // Set the woocommerce data if it applies
      if (woocommerceID && "wcname" in attrHolder && attrHolder.wcname) {
        attrObj[attrKey].woocommerceName = attrHolder.wcname.replace("$pid$", woocommerceID);
      }
    }
  }
}

function recurseOptions(
  attrObj: any,
  optionHolder: ComplexSubAttribute | GrandSubAttribute | GrandAddonAttribute | Option,
  setDefaults = true,
  level: number = 0,
  optional: boolean = false,
  wcname: string = "",
  wcproduct: string | undefined,
  pimcoContributers: Array<{
    pimco: string;
    contributer: ProductImageContributer;
  }> = [],
  path: Array<string>,
  setter: SetterFunction,
  certifier: CertifierFunction,
  attributes: Attribute[] = [],
  lastCasing: OptionCasing | null = null,
  previousDefaultsOptions: Array<string> | null = null
) {
  // Make sure the optionHolder has pimco and is designated as a pimco contributer
  if (
    "pimco" in optionHolder ||
    ("pimco3d" in optionHolder && (optionHolder["options"] || optionHolder["suboptions"])?.pimcocontributer)
  ) {
    const additionalContributers = pimcos.transformPimcoContribution_STRUCTURE_(
      optionHolder.pimco,
      optionHolder.pimco3d
    );
    if (additionalContributers.length) {
      // Add the additional pimcoContributers if more exist and are unique
      // pimcoContributers.push(...additionalContributers);
      for (let i = 0; i < additionalContributers.length; i++) {
        const contributer = additionalContributers[i];
        if (!pimcoContributers.find((c) => c.pimco == contributer.pimco)) {
          pimcoContributers.push(contributer);
        }
      }
    }
  }
  // Track the options list where the defaults came from so that proper deauts always get set
  let currentDefaultOptions: Array<string> | null = null;
  if (optionHolder && "suboptions" in optionHolder && optionHolder.suboptions) {
    // If its an option holding suboptions
    if (!optionHolder.suboptions.options) {
      // Restore the array as empty because api doesn't always restore empty array
      optionHolder.suboptions.options = [];
    }
    const key = optionHolder.suboptions.key;
    const options = Array.from(optionHolder.suboptions.options);
    if (!optionHolder.suboptions.ignore) {
      if (attrObj[key] === undefined) {
        const branchID = createBranchID([...path, key].join());
        const dflt = module.getDefault(optionHolder);
        attrObj[key] = new OptionCasing(
          branchID,
          dflt,
          setter,
          certifier,
          level,
          optionHolder.id,
          optionHolder.suboptions?.store
        );
        indexCasing(attrObj[key]);
        // Set the x-data for the casing
        attrObj[key]["x-data"] = {
          id: attrObj[key].parent,
          disabled: false,
          attributes: attributes.map((a) => ({
            id: a.id,
            disabled: a.disabled,
          })),
        };
        // Set the methods getting siblings
        if (lastCasing) {
          lastCasing.next = () => attrObj[key];
          attrObj[key].previous = () => lastCasing;
        }
        // Set the method for retieving path
        attrObj[key].getPath = () => [...path, key];
      }
      (attrObj[key] as OptionCasing).addAllowedValue(optionHolder.suboptions.options);

      // Add the pimcoContributers if this option represents the value for the region
      // Do this before the default value gets set so that the contributers are applied
      /* REMEMBER THAT CONTRIBUTERS LISTED ON AN OPTION DON'T GET LISTED AS */
      /* PIMCO CONTRIBUTERS ON THE OPTION CASING THAT IS CREATED FOR THAT */
      /* OPTION. I KNOW IT'S COMPLICATED BUT YOU KEEP FORGETTING IT, SO HERE */
      /* IS A REMINDER. */
      if (optionHolder.suboptions.pimcocontributer && pimcoContributers) {
        pimcoContributers = pimcoContributers
          .filter((value) => value.contributer.cascade !== false)
          .map((value) => {
            if (value.contributer.cascade !== "hollow") {
              return value;
            } else {
              return {
                pimco: value.pimco,
                contributer: {
                  cascade: true,
                  priority: value.contributer.priority,
                },
              };
            }
          });
        attrObj[key].addPimcoContributions(pimcoContributers);
      }
      // Logic to set the default value
      if (setDefaults) {
        const _default = module.getDefault(optionHolder) as any;
        if (
          attrObj[key].value === null &&
          _default &&
          (!previousDefaultsOptions || previousDefaultsOptions.includes(_default.id))
        ) {
          attrObj[key].setDefault(_default, true, attrObj[key].branchID);
          currentDefaultOptions = _default.suboptions?.options || null;
        }
        if (_default) {
          // Move the default to the front of the array
          options.splice(options.indexOf(_default.id), 1);
          options.unshift(_default.id);
        } else {
          setDefaults = false;
        }
      }
      // Designate unrequired options
      if (optionHolder.suboptions.required === false || optional) {
        attrObj[key].required = false;
      }
      if (optional) {
        attrObj[key].noRequirement = true;
      }
      // Apply woocommerce name if it can be built
      if (wcname) {
        if (optionHolder.suboptions.wcscope) {
          attrObj[key].woocommerceName = wcname.replace("$scope$", optionHolder.suboptions.wcscope);
        } else if (!wcname.includes("$scope$")) {
          attrObj[key].woocommerceName = wcname;
        }
      }
    }
    /* Special case for multicolor selector */
    if (optionHolder.type == "ComplexColorsOption" && "comrades" in optionHolder && optionHolder.comrades.length) {
      if (lastCasing) {
        lastCasing.addAllowedValue(optionHolder.comrades);
      }
      for (let c = 0; c < optionHolder.comrades.length; c++) {
        const id = optionHolder.comrades[c];
        const item = get(id);
        recurseOptions(
          attrObj,
          item,
          setDefaults,
          level + c + 1,
          optional,
          wcname,
          wcproduct,
          [],
          path,
          setter,
          certifier,
          attributes,
          attrObj[key],
          previousDefaultsOptions
        );
      }
    }
    /* Special case for multicolor selector */
    for (let oo = 0; oo < options.length; oo++) {
      let nextOptionHolder = get(options[oo]);
      recurseOptions(
        attrObj,
        nextOptionHolder,
        setDefaults,
        level + 1,
        optional,
        wcname,
        wcproduct,
        [...pimcoContributers],
        path,
        setter,
        certifier,
        attributes,
        attrObj[key],
        currentDefaultOptions
      );
    }
    // The woocommerce product may have been set by argument, so check for that
    if (wcproduct && attrObj[key].woocommerceProduct === "") {
      attrObj[key].woocommerceProduct = wcproduct;
    }
  } else if (optionHolder && "options" in optionHolder && optionHolder.options) {
    const key = optionHolder.options.key;
    // If its an attribute holding suboptions
    if (!optionHolder.options.options) {
      // Restore the array as empty because api doesn't always restore empty array
      optionHolder.options.options = [];
    }
    const options = Array.from(optionHolder.options.options);
    if (!optionHolder.options.ignore) {
      const _default = module.getDefault(optionHolder) as any;
      attrObj[key] = new OptionCasing(
        createBranchID([...path, key].join()),
        null,
        setter,
        certifier,
        level,
        optionHolder.id,
        optionHolder.options?.store
      );
      indexCasing(attrObj[key]);
      (attrObj[key] as OptionCasing).addAllowedValue(optionHolder.options.options);
      // Set the x-data for the casing
      attrObj[key]["x-data"] = {
        id: attrObj[key].parent,
        disabled: false,
        attributes: attributes.map((a) => ({ id: a.id, disabled: a.disabled })),
      };
      // Set the methods getting siblings
      if (lastCasing) {
        lastCasing.next = () => attrObj[key];
        attrObj[key].previous = () => lastCasing;
      }
      // Set the method for retieving path
      attrObj[key].getPath = () => [...path, key];
      // Designate unrequired options
      if (optionHolder.options.required === false || optional) {
        attrObj[key].required = false;
      }
      if (optional) {
        attrObj[key].noRequirement = true;
      }
      if (_default) {
        // Move the default to the front of the array
        options.splice(options.indexOf(_default.id), 1);
        options.unshift(_default.id);
      } else {
        setDefaults = false;
      }
      // Apply woocommerce name if it can be built
      if (wcname) {
        if (optionHolder.options.wcscope) {
          attrObj[key].woocommerceName = wcname.replace("$scope$", optionHolder.options.wcscope);
        } else if (!wcname.includes("$scope$")) {
          attrObj[key].woocommerceName = wcname;
        }
      }
      // Add the pimcoContributers if this option represents the value for the region
      // Must be set before the default
      if (optionHolder.options.pimcocontributer && pimcoContributers) {
        pimcoContributers = pimcoContributers
          .filter((value) => value.contributer.cascade !== false)
          .map((value) => {
            if (value.contributer.cascade !== "hollow") {
              return value;
            } else {
              return {
                pimco: value.pimco,
                contributer: {
                  cascade: true,
                  priority: value.contributer.priority,
                },
              };
            }
          });
        attrObj[key].addPimcoContributions(pimcoContributers);
      }
      if (_default && (!previousDefaultsOptions || previousDefaultsOptions.includes(_default.id))) {
        attrObj[key].setDefault(_default, true);
        currentDefaultOptions = _default.suboptions?.options || null;
      }
    }
    let hasPositive = false;
    for (let oo = 0; oo < options.length; oo++) {
      let nextOptionHolder: Option = get(options[oo]);
      if (nextOptionHolder && nextOptionHolder.type == "GrandAddonOption" && nextOptionHolder.boolean) {
        hasPositive = true;
      }
      recurseOptions(
        attrObj,
        nextOptionHolder,
        setDefaults,
        level + 1,
        optional,
        wcname,
        wcproduct,
        [...pimcoContributers],
        path,
        setter,
        certifier,
        attributes,
        attrObj[key],
        currentDefaultOptions
      );
    }
    // If a wcproduct(woocommerce product id) is defined and one of the
    // options is defined as a 'yes' option, then specify the product id
    // on the option casing so that it can be added to cart as a
    // seperate product
    if (
      !optionHolder.options.ignore &&
      hasPositive &&
      optionHolder.type == "GrandAddonAttribute" &&
      optionHolder.options.wcproduct
    ) {
      attrObj[key].woocommerceProduct = optionHolder.options.wcproduct;
    } else if (wcproduct) {
      // The woocommerce product may have been set by argument, so check for that
      attrObj[key].woocommerceProduct = wcproduct;
    }
  }
}

/**
 *
 * @param id
 */
function get(id: string | null) {
  const arr = [
    ...(utils.isIterable((datas as any).products) ? (datas as any).products : []),
    ...(utils.isIterable((datas as any).models) ? (datas as any).models : []),
    ...(utils.isIterable((datas as any).attributes) ? (datas as any).attributes : []),
    ...(utils.isIterable((datas as any).options) ? (datas as any).options : []),
    ...(utils.isIterable((datas as any).pimcos) ? (datas as any).pimcos : []),
  ];
  return arr.find((item) => item.id == id);
}

function hasData(): boolean {
  return (
    (datas as any).products &&
    (datas as any).models &&
    (datas as any).attributes &&
    (datas as any).options &&
    (datas as any).leathers &&
    (datas as any).pimcos
  );
}

function traverseRecursion(
  structureObject: any,
  callback: (casing: any, path: Array<string>, key: string) => void,
  check?: (object: any, key: string, path: string[]) => boolean,
  path: string[] = [],
  key = ""
) {
  if (check && check(structureObject, key, [...path])) {
    callback(structureObject, [...path], key);
  } else if (!check && structureObject instanceof OptionCasing) {
    callback(structureObject, [...path], key);
  } else if (
    !check &&
    structureObject &&
    Object.keys(structureObject).every((k) => k == "x-data" || structureObject[k] instanceof OptionCasing) &&
    Object.keys(structureObject).length
  ) {
    const casings = module.getCurrentBranchOrder(structureObject, true);
    for (let i = 0; i < casings.length; i++) {
      const casing = casings[i];
      const casingKey = casing.getPath().slice(-1)[0];
      callback(casing, [...path, casingKey], casingKey);
    }
  } else if (structureObject instanceof Object) {
    for (const key in structureObject) {
      if (Object.prototype.hasOwnProperty.call(structureObject, key)) {
        const subObject = structureObject[key];
        if (subObject) {
          traverseRecursion(subObject, callback, check, [...path, key], key);
        }
      }
    }
  }
}

function siblingPrototype(parent: { [key: string]: OptionCasing }, num: number) {
  return (
    Object.keys(parent)
      .map((k) => parent[k])
      .find((oc) => oc.order === num) || null
  );
}

function createBranchID(pathstring: string) {
  return "brc" + utils.generateHash(pathstring);
}

function indexCasing(casing: OptionCasing) {
  branches[casing.branchID] = casing;
}

function clearIndexedCasings() {
  for (const id in branches) {
    if (branches.hasOwnProperty(id)) {
      delete branches[id];
    }
  }
  for (const id in mimicIndex) {
    if (mimicIndex.hasOwnProperty(id)) {
      delete mimicIndex[id];
    }
  }
}

function hasValidNextLayer(casing: OptionCasing): casing is OptionCasing<Option & { suboptions: ComplexSubOptionData }>;
function hasValidNextLayer(option: Option): option is Option & { suboptions: ComplexSubOptionData };

function hasValidNextLayer(object: OptionCasing | Option) {
  if (object instanceof OptionCasing) {
    if (!object.value) {
      return false;
    }
    object = object.value;
  }
  // Make sure the casing value is set and has data for next layer
  if ("suboptions" in object && object.suboptions) {
    // Before we return the value, check the text value and rules
    if ("interupt" in object && object.interupt && !object.text) {
      return false;
    }
    return true;
  }
  return false;
}

function hasValidParallelLayer(
  casing: OptionCasing
): casing is OptionCasing<Option & ({ comrades: string[] } | { source: string })> {
  // Make sure the option has comrades of some kind
  if (casing.value) {
    if ("comrades" in casing.value) {
      return true;
    }
    if ("source" in casing.value) {
      return true;
    }
  }
  return false;
}

function getParallelKeys(option: Option & { suboptions: ComplexSubOptionData }) {
  if ("comrades" in option && option.comrades.length) {
    return option.comrades
      .map((x) => get(x))
      .filter((x) => x)
      .map((x: { suboptions: ComplexSubOptionData }) => x.suboptions.key);
  }
  if ("source" in option) {
    const source = get(option.source);
    if (source) {
      const comrades = [
        source,
        ...source.comrades.map((x: string) => get(x)).filter((x: Option) => x && x.id != option.id),
      ];
      return comrades.map((x: { suboptions: ComplexSubOptionData }) => x.suboptions.key);
    }
  }
  return [];
}

function createVirtualAttribute(template: Attribute & { virtual: { addlabel?: string } }, order: number): Attribute {
  const newData: Partial<Attribute> = {
    virtual: false,
    name: template.name.replaceAll("$i", order.toString()),
    addVirtualLabel: template.virtual.addlabel,
    vtemplate: template.name,
  } as any;
  if ("nickname" in template && template.nickname) {
    newData.nickname = template.nickname.replaceAll("$i", order.toString());
  }
  return utils.deepObjectExtend({} as any as Attribute, template, newData);
}

function indexedInsert<T = any>(array: T[], item: T, index: number) {
  if (array.length > index) {
    array.splice(index, 0, item);
  } else {
    array.push(item);
  }
}
