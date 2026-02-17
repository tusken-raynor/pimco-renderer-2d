import qParams from "@/params";
import { starters } from "@/store/initialize";
import structure, { OptionCasing } from "@/structure";
import {
  ComplexSubAttribute,
  ConfiguratorObject,
  GrandAddonAttribute,
  GrandClonerOption,
  GrandSubAttribute,
  Option,
  OrderCloneMutation,
  Product,
  SeriesInfo,
} from "@/types";
import utils from "@/utils";
import woocommerce from "@/woocommerce";

type ProductParameters = {
  "add-to-cart": string | number;
  quantity: string | number;
  [key: string]: string | number;
};
type CloneMutationMerge = {
  key: string;
  value: string | null;
  ref: boolean;
} & OrderCloneMutation;
type CloneDataDerivative = {
  [key: string]: CloneMutationMerge[][];
};

type DebugParameterPayload = {
  msg: string;
  handle?: string;
}
type AddToCartJSONBody = {
  products: Array<{
    id: number | string;
    variation?: number | string;
    addons?: Array<{ name: string; value: string; }>;
    quantity: number;
  }>;
}

type ThisArg = {
  woocommerceID: number | string;
  productID: string;
  model: string;
  objectIDMap: { [id: string]: ConfiguratorObject };
  series?: SeriesInfo;
  sessionID?: string;
  modMap?: { [key: string]: string };
  deviceMeta: string;
};

export default {
  addToCart(
    this: ThisArg,
    productStructure: any,
    filter: (
      object:
        | ComplexSubAttribute
        | GrandSubAttribute
        | GrandAddonAttribute
        | Option
        | null,
      path?: string[]
    ) => boolean,
    derivedCloneData?: CloneDataDerivative
  ): { html: string; body?: AddToCartJSONBody; action: string } {
    let action = "https://nokona.com/cart/";
    let params: ProductParameters = {
      "add-to-cart": this.woocommerceID,
      quantity: 1,
    };
    let extraProducts: Array<{ wooid: number | string; variation?: number | string; addons?: Record<string, string>; quantity: number; name: string; }> = [];
    const devMode = starters.dev;
    let debugParams: Record<string, DebugParameterPayload> = {};
    // Add the model name to params
    const modelKey = woocommerce.getAddon(
      `addon-${this.woocommerceID}-model`,
      this.productID
    );
    if (modelKey) {
      const modelValue = woocommerce.getOption(
        this.model,
        modelKey,
        this.productID
      );
      if (modelValue) {
        params[modelKey] = modelValue;
      }
    }
    // Add the series name to params if a series was used
    if (this.series) {
      const seriesKey = woocommerce.getAddon(
        `addon-${this.woocommerceID}-series`,
        this.productID
      );
      if (seriesKey && this.series.wcvalue) {
        const seriesValue = woocommerce.getOption(
          this.series.wcvalue,
          seriesKey,
          this.productID
        );
        if (seriesValue) {
          params[seriesKey] = seriesValue;
        }
      }
    }
    // Add the woocommerce note if it was provided
    if (this.series && this.series.wcnote) {
      const addonKey = woocommerce.getAddon(
        this.series.wcnote.addon.replace("$pid$", this.woocommerceID as string),
        this.productID
      );
      if (addonKey && this.series.wcnote.value) {
        params[addonKey] = this.series.wcnote.value;
      }
    }
    // Add the session id if it was provided
    if (this.sessionID) {
      const sessionKey = woocommerce.getAddon(
        `addon-${this.woocommerceID}-configurator-session-id`,
        this.productID
      );
      if (sessionKey) {
        params[sessionKey] = this.sessionID;
      }
    }
    // Add device meta if it was provided
    if (this.deviceMeta) {
      const deviceMetaKey = woocommerce.getAddon(
        `addon-${this.woocommerceID}-session-meta`,
        this.productID
      );
      if (deviceMetaKey) {
        params[deviceMetaKey] = this.deviceMeta;
      }
    }
    // Filter the selections object down to remove any unapplicable selections
    productStructure = structure.getFilteredStructure(productStructure, "*");
    // Now traverse the selections object and add all the options to params
    structure.traverse(
      productStructure,
      (
        casing: OptionCasing | { "x-data": { id: string; disabled: boolean } }
      ) => {
        if (casing instanceof OptionCasing) {
          // Make sure the option meets all the criteria and is not restricted
          const path = [this.productID, "selections", ...casing.getPath()];
          if (
            casing.woocommerceName &&
            casing.value &&
            (!casing["x-data"]?.attributes ||
              casing["x-data"].attributes.every((x) =>
                filter(x as any, path)
              )) &&
            filter(casing.value, path) &&
            'wcvalue' in casing.value &&
            casing.value.wcvalue
          ) {
            const casingProduct = casing["x-data"]?.virtualGroup && casing.woocommerceProduct
              ? casing.woocommerceProduct
              : this.productID;
            const isMainProduct = casingProduct == this.productID;
            // Get the woocommerce addon name
            const addon = woocommerce.getAddon(
              casing.woocommerceName,
              casingProduct
            );
            if (addon) {
              if (
                // This means we are referring to an attribute on the object for the woocommerce value
                casing.value.wcvalue.startsWith("$") &&
                casing.value.wcvalue.endsWith("$")
              ) {
                const key = casing.value.wcvalue.slice(1, -1);
                if (casing.getMetaData(key)) {
                  params[addon] = casing.getMetaData(key);
                } else if (key in casing.value && (casing.value as any)[key]) {
                  params[addon] = (casing.value as any)[key];
                }
              } else {
                let mods: Record<string, string> = {};
                const branchIDs = woocommerce.getModBranchIDs(
                  casing.value.wcvalue
                );
                // Check the mod map to see if other selections are contributing modifications
                // to the woocommerce value
                for (let i = 0; i < branchIDs.length; i++) {
                  const branchID = branchIDs[i];
                  if (this.modMap) {
                    mods[branchID] = this.modMap[branchID] || "";
                  }
                }
                const value = woocommerce.getOption(
                  casing.value.wcvalue,
                  addon,
                  casingProduct,
                  mods
                );
                if (value) {
                  // If the casing product matches the main product, add the value
                  // to the main params object, otherwise add it to the extra products
                  if (isMainProduct) {
                    params[addon] = value;
                  } else {
                    utils.productDetailsFromVirtuals(casing as any, addon, value, this.objectIDMap, productStructure, extraProducts);
                  }
                } else if (devMode) {
                  let msg = `Does not map to an acceptable woocommerce value: ${casing.value.wcvalue}`;
                  if (mods.length) {
                    msg += `. Mods ${Object.entries(mods).join("; ")}`;
                  }
                  debugParams[addon] = {msg, handle: casing.branchID};
                }
              }
              // Check if option has ability to change price based on text length
              if (
                "wclength" in casing.value &&
                casing.value.wclength &&
                casing.value.text
              ) {
                const addonName = woocommerce.getAddon(
                  casing.value.wclength.wcname,
                  casingProduct
                );
                if (addonName) {
                  const range = utils.getRange(
                    casing.value.text.length,
                    casing.value.wclength.ranges
                  );
                  let mods: Record<string, string> = {};
                  const branchIDs = woocommerce.getModBranchIDs(
                    casing.value.wclength.wcvalue
                  );
                  for (let i = 0; i < branchIDs.length; i++) {
                    const branchID = branchIDs[i];
                    if (this.modMap) {
                      mods[branchID] = this.modMap[branchID] || "";
                    }
                  }
                  if (range) {
                    const value = woocommerce.getOption(
                      casing.value.wclength.wcvalue.replace("$range$", range),
                      addonName,
                      casingProduct,
                      mods
                    );
                    if (value) {
                      // If the casing product matches the main product, add the value
                      // to the main params object, otherwise add it to the extra products
                      if (isMainProduct) {
                        params[addonName] = value;
                      }
                    } else if (devMode) {
                      let msg = `Range value does not map to an acceptable woocommerce value: ${casing.value.wcvalue}`;
                      if (mods.length) {
                        msg += `. Mods ${Object.entries(mods).join("; ")}`;
                      }
                      debugParams[addonName] = {msg, handle: casing.branchID};
                    }
                  }
                } else if (devMode) {
                  debugParams[casing.value.wclength.wcname] = {
                    msg: "Has no valid woocommerce addon name",
                    handle: casing.branchID,
                  };
                }
              }
            } else if (devMode) {
              debugParams[casing.woocommerceName] = {
                msg: "Has no woocommerce addon name",
                handle: casing.branchID,
              };
            }
            // If the option also stores a text value that must be independent of the wcvalue
            if (
              "textwcname" in casing.value &&
              casing.value.textwcname &&
              casing.value.text
            ) {
              const modelKey = woocommerce.getAddon(
                casing.value.textwcname.replace(
                  "$pid$",
                  String(this.woocommerceID || "")
                ),
                this.productID
              );
              if (modelKey) {
                params[modelKey] = casing.value.text;
              }
            }
            // If the option has a text value, but is meant to recombine into extra products, check for that
            if (
              'text' in casing.value && casing.value.text &&
              'formula' in casing.value && casing.value.formula &&
              (
                'products' in casing.value && casing.value.products ||
                'procedural' in casing.value && casing.value.procedural
              )
            ) {
              const details = utils.productDetailsFromFormula(casing as any);
              extraProducts.push(...details);
            }
            // Lace color fill (super specific and I don't like it)
            if (
              casing.woocommerceName.startsWith(
                `addon-${this.woocommerceID}-lace-color-1`
              )
            ) {
              const previous = casing.previous();
              const prevOpt = previous?.value;
              if (
                previous?.woocommerceName.startsWith(
                  `addon-${this.woocommerceID}-lace-style`
                ) &&
                prevOpt &&
                prevOpt.type == "ComplexColorsOption"
              ) {
                let count = 0;
                if ("comrades" in prevOpt && prevOpt.comrades) {
                  count = prevOpt.comrades.length;
                }
                if ("source" in prevOpt && prevOpt.source) {
                  count = Infinity;
                  // too complex to fetch the source object and find number of comrades
                  // just going to assume that all the colors need filing that are
                  // available to fill when we've determined is it multi-color
                }
                if (count) {
                  let next = casing.next();
                  let i = 0;
                  while (
                    i < count &&
                    next &&
                    next.woocommerceName.startsWith(
                      `addon-${this.woocommerceID}-lace-color`
                    )
                  ) {
                    if (next.value === null) {
                      next.value = casing.value;
                    }
                    next = next.next();
                    i++;
                  }
                }
              }
            }
          } else if (
            // When the selected addon is it's own product
            casing.woocommerceProduct &&
            casing.value &&
            "boolean" in casing.value &&
            casing.value.boolean
          ) {
            params["add-to-cart"] += "," + casing.woocommerceProduct;
          }
        }
      },
      (object) =>
        object instanceof OptionCasing ||
        (object["x-data"] && !filter(object["x-data"]))
    );
    // Add the derived clone data to the params
    if (derivedCloneData) {
      const additionalSessionParamsAddonName = woocommerce.getAddon(
        `addon-${this.woocommerceID}-additional-session-parameters`,
        this.productID
      );
      const thisArg = { additionalSessionParamsAddonName, ...this };
      params = cloneOrder.apply(thisArg, [params, derivedCloneData]);
    }
    if (params["split-product"]) {
      delete params["split-product"];
      // If we are a split product, hit an ajax endpoint instead that can handle split products
      action =
        "https://nokona.com/wp-admin/admin-ajax.php?action=add_split_product";
      // This parameter name change is done because of a weird bug with woocommerce
      params["product"] = params["add-to-cart"];
      delete (params as any)["add-to-cart"];
    }
    // Generate the input html and return it
    let html = "";
    let body: AddToCartJSONBody | undefined = undefined;
    const cartMethod = (this.objectIDMap[this.productID] as Product)?.cartmethod || qParams.getString("cart-method") || "legacy";
    if (extraProducts.length || cartMethod == "new") {
      if (devMode) {
        console.log("Using new cart method", extraProducts); 
      }
      // We have extra products, so we need to construct a body object for the fetch request
      // instead of just a simple html form. This allows us to add multiple products to the cart
      // at once, along with their own addons
      body = {
        products: []
      };
      // First, loop through the main product params, and split any multi-value params into
      // distinct products to represent them
      let splitCount = 1;
      const quantities: number[] = [];
      const splitParams: Record<string, string[]> = {};
      for (const name in params) {
        const valueString = String(params[name]);
        const values = valueString.split("|||");
        splitCount = Math.max(splitCount, values.length);
        for (let i = 0; i < values.length; i++) {
          const [value, qty] = values[i].split(":::");
          quantities[i] = Math.max(parseInt(qty, 10) || 1, quantities[i] || 1);
          if (!splitParams[name]) {
            splitParams[name] = [];
          }
          splitParams[name][i] = value;
        }
      }
      for (let i = 0; i < splitCount; i++) {
        const product: any = {
          id: this.woocommerceID,
          quantity: quantities[i],
          name: this.objectIDMap[this.productID]?.name || woocommerce.getProductName(this.woocommerceID) || `Main Product ${i + 1}`
        };
        product.addons = 
          Object.keys(splitParams)
            .filter(k => k.startsWith('addon-'))
            .map(k => {
              const name = k.replace(/(addon-\d+).+(-\d+)$/, '$1$2');
              const data: any = { name, value: splitParams[k][i] || splitParams[k][0] };
              if (devMode) {
                data.ogName = k;
              }
              return data;
            });
        body.products.push(product);
      }
      // Now just add the extra products to the products list
      body.products.push(...extraProducts.map(p => {
        const product: any = { id: p.wooid, ...p };
        product.name = woocommerce.getProductName(p.wooid) || product.name;
        delete product.wooid;

        if (product.addons) {
          product.addons = Object.keys(product.addons).map(key => {
            const name = key.replace(/(addon-\d+).+(-\d+)$/, '$1$2');
            const data: any = { name, value: product.addons[key] };
            if (devMode) {
              data.ogName = key;
            }
            return data;
          });
        }
        return product;
      }));
      html += `<!--\nAdd To Cart Body: ${JSON.stringify(body, null, 2).replaceAll('--', '&#45;&#45;')}\n-->\n`;
      action = 'https://nokona.com/wp-json/custom-cart/v1/add-multiple';
    } else {
      for (const name in params) {
        if (Object.prototype.hasOwnProperty.call(params, name)) {
          const value = String(params[name]).replaceAll('"', "&quot;");
          // The woocommerce addons plugin has reformatted their addon names
          // so we need to reflect that to get items to add to cart properly
          const newName = name.replace(/(addon-\d+).+(-\d+)$/, '$1$2');
          html += `<input type="hidden" name="${newName}" data-og-name="${name}" value="${value}">`;
        }
      }
    }
    if (devMode) {
      for (const attr in debugParams) {
        if (Object.prototype.hasOwnProperty.call(debugParams, attr)) {
          const {msg, handle} = debugParams[attr];
          html += `<!-- {${attr}} ${msg} -- ${handle || '"no handle"'} -->`;
        }
      }
    }
    const result: any = { html, action };
    if (body) {
      result.body = body;
    }
    return result;
  }
};

function cloneOrder(
  this: ThisArg & { additionalSessionParamsAddonName: string },
  params: ProductParameters,
  derivedMutations: CloneDataDerivative
) {
  const cloneBranches = Object.keys(derivedMutations)
    .map((k) => structure.branch<GrandClonerOption>(k.split("-")[0])!)
    .filter((b) => b);
  // Create a new object reference
  params = { ...params };
  const formatedMutations: CloneMutationMerge[][] = [];
  // This is our flag which marks if we actually have ourselves a split product
  let splitProduct = false;
  // Loop through the derived mutations and create a structure whose
  // values can readily be applied to a parameters object
  for (const key in derivedMutations) {
    if (Object.prototype.hasOwnProperty.call(derivedMutations, key)) {
      const mutationSet = derivedMutations[key];
      for (let i = 0; i < mutationSet.length; i++) {
        const mutations = mutationSet[i];
        if (!formatedMutations[i]) {
          formatedMutations[i] = [...mutations];
        } else {
          formatedMutations[i].push(...mutations);
        }
      }
    }
  }
  // Now loop through the formatted mutations and apply the the values
  // in a 'split product' format to the params object
  for (let i = 0; i < formatedMutations.length; i++) {
    const mutations = formatedMutations[i];
    let sessionParams = "";
    for (let j = 0; j < mutations.length; j++) {
      const mutation = mutations[j];
      let wooName = getWooAddonName.apply(this, [mutation]);
      // Get the text value or generic the woocommerce value
      let value =
        mutation.type == "text"
          ? mutation.value
          : mutation.value
          ? ((this.objectIDMap[mutation.value] as Option)?.['wcvalue'] || '')
          : "";
      if (wooName && typeof value == "string") {
        // Get the non-generic woo addon name
        wooName = woocommerce.getAddon(wooName, this.productID);
        // Generate the woo mod
        let mods: Record<string, string> = {};
        const branchIDs = woocommerce.getModBranchIDs(value);
        for (let i = 0; i < branchIDs.length; i++) {
          const branchID = branchIDs[i];
          if (this.modMap) {
            mods[branchID] = this.modMap[branchID] || "";
          }
        }
        // Get the non-generic woo option value if its not text type
        value =
          mutation.type == "text"
            ? value
            : woocommerce.getOption(value, wooName, this.productID, mods);
        if (!(wooName in params)) {
          // If the parameter doesn't exist yet, add it to the object
          params[wooName] = value;
        } else if (!mutation.ref) {
          // If a parameter value exists on the object, append the additional
          // value using the 'split-product' format, which separates values
          // with 5 colons
          params[wooName] += "|||" + value;
          // Since we've made it to the point in the code, we know for sure that
          // we're working with a split product, so mark it as such
          splitProduct = true;
        }
        // If we are working with a split product, then include an extra product
        // addon which specifies query paramters that can be used to addition
        // to the session ID to create unique links for each product within the
        // team purchase
        if (i && mutation.key.startsWith("brc") && mutation.value !== null) {
          sessionParams += "&";
          sessionParams +=
            mutation.type == "text" ? mutation.key + ":text" : mutation.key;
          sessionParams += "=" + mutation.value;
        } else if (!i && formatedMutations.length > 1 && !sessionParams) {
          sessionParams += "N / A";
        }
      }
    }
    if (sessionParams && this.additionalSessionParamsAddonName) {
      if (sessionParams != "N / A") {
        sessionParams +=
          "&" +
          cloneBranches.map((casing) => `${casing.branchID}=null`).join("&");
      }
      if (!(this.additionalSessionParamsAddonName in params)) {
        params[this.additionalSessionParamsAddonName] = sessionParams;
      } else {
        params[this.additionalSessionParamsAddonName] +=
          "|||" + sessionParams;
      }
    }
  }
  // Mark it as a split product before we return
  if (splitProduct) {
    params["split-product"] = "1";
  }
  return params;
}

function getWooAddonName(
  this: ThisArg,
  mutation: CloneMutationMerge
): string | false {
  const branch = structure.branch(mutation.key)
  if (branch) {
    return branch.woocommerceName;
  }
  return mutation.key.replaceAll("$pid$", this.woocommerceID + "");
}