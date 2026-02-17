import restrictions from "@/restrictions";
import structure, { OptionCasing } from "@/structure";
import {
  ApplicationCondition,
  Attribute,
  ComplexCompoundOption,
  ComplexOption,
  ComplexSubAttribute,
  ComplexTypeOption,
  CompoundProductDefinition,
  ConfiguratorObject,
  ConfiguratorView,
  ConfiguratorViewSet,
  FixedSizeArray,
  Model,
  Option,
  OrderCloneMutation,
  PimcoMaskSubstitutionTypeDefintion,
  Product,
  SeriesInfo,
} from "@/types";
import woocommerce from "@/woocommerce";
import smoothResize from "./smooth-resize";
import { deserializeSobj } from "@/wasm";
import uploaded from "@/storage/uploaded";
import avif from "@/avif";
import parser from "@/parser";

// String.replaceAll doersn't work in firefox for some reason
if (!String.prototype.replaceAll) {
  (String.prototype as any).replaceAll = function (find: string | RegExp, replace: string) {
    return this.replace(find instanceof RegExp ? find : new RegExp(find, "g"), replace);
  };
}

export type ObjectWithNestedProperties = {
  [keys: string]: any;
};

export type WorkerSuite<P = any, R = any> = {
  post<T = R>(payload: P, transfer?: Transferable[]): Promise<T>;
  terminate(): void;
};

// Store the boolean here on first load just incase the History API changes the URL
const initUseLocalData = location.search.includes("localdata");

const utils = {
  /**
   * Takes an object and a string array and uses the array to find an embedded property
   */
  getNested(obj: ObjectWithNestedProperties, keys: Array<string>): any {
    let value = obj;
    let i = 0;
    while (value && i < keys.length) {
      value = value[keys[i]];
      i++;
    }
    return value;
  },
  /**
   * Takes an object and a string array and uses the array to set the value of an
   * embedded property. If the path doesn't exist the method will return false.
   * Pass true for the forth parameter to force the creation of a nested property
   * if it doesn't exist.
   */
  setNested(obj: ObjectWithNestedProperties, value: any, keys: Array<string>, create: boolean = false): boolean {
    let immediateObject = obj;
    let i = 0;
    while (i < keys.length) {
      if (!(immediateObject instanceof Object && keys[i] in immediateObject)) {
        if (create) {
          (immediateObject as any)[keys[i]] = keys[i + 1] && isNaN(keys[i + 1] as any) ? {} : [];
        } else {
          return false;
        }
      }
      if (keys[i] in immediateObject) {
        if (i == keys.length - 1) {
          (immediateObject as any)[keys[i]] = value;
          return true;
        } else {
          if (!((immediateObject as any)[keys[i]] instanceof Object)) {
            (immediateObject as any)[keys[i]] = keys[i + 1] && isNaN(keys[i + 1] as any) ? {} : [];
          }
          immediateObject = (immediateObject as any)[keys[i]];
        }
      }
      i++;
    }
    return false;
  },
  deleteNested(obj: object, keys: Array<string>): boolean {
    let immediateObject = obj;
    let i = 0;
    while (i < keys.length) {
      if (!(immediateObject instanceof Object && keys[i] in immediateObject)) {
        return false;
      }
      if (i == keys.length - 1) {
        delete (immediateObject as any)[keys[i]];
        return true;
      }
      immediateObject = (immediateObject as any)[keys[i]];
      i++;
    }
    return false;
  },
  /**
   *
   * @param obj Object property values must contain the same path used for mapping or an Error will be thrown
   */
  mapNested(obj: any, path: string | Array<string>, allow: boolean = false) {
    const newObj: any = {};
    if (typeof path == "string") {
      path = [path];
    }
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const sub = obj[key];
        const nestedValue = this.getNested(sub, path);
        if (nestedValue !== undefined || allow) {
          newObj[key] = nestedValue;
        }
      }
    }
    return newObj;
  },
  mapObject<V, R>(
    obj: { [key: string]: V },
    callbackfn: (value: V, key: string, index: number, object: typeof obj) => R
  ) {
    const newObj: { [key: string]: R } = {};
    let index = 0;
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        newObj[key] = callbackfn(obj[key], key, index, obj);
        index++;
      }
    }
    return newObj;
  },
  mapObjectKeys<V>(
    obj: { [key: string]: V },
    callbackfn: (value: V, key: string, index: number, object: typeof obj) => string
  ) {
    const newObj: { [key: string]: V } = {};
    let index = 0;
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        newObj[callbackfn(obj[key], key, index, obj)] = obj[key];
        index++;
      }
    }
    return newObj;
  },
  filterObject<V>(
    obj: { [key: string]: V },
    callbackfn: (value: V, key: string, index: number, object: typeof obj) => boolean
  ) {
    const newObj: { [key: string]: V } = {};
    let index = 0;
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        if (callbackfn(obj[key], key, index, obj)) {
          newObj[key] = obj[key];
          index++;
        }
      }
    }
    return newObj;
  },
  /**
   * Change a string to a URL friendly string
   */
  sanitize(subject: string) {
    return subject
      .toLowerCase()
      .replace(/[^\w]+/g, " ")
      .trim()
      .replace(/\s/g, "_");
  },
  encodeHtml(markup: string) {
    return markup
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  },
  decodeHtml(markup: string) {
    var txt = document.createElement("textarea");
    txt.innerHTML = markup;
    return txt.value;
  },
  escapeHtml(markup: string) {
    return markup.replace(/<\/?\w+.*?>/g, "");
  },
  pluralize(word: string) {
    if (word.endsWith("s")) {
      return word;
    }
    return word + "s";
  },
  camelCase2Words(str: string) {
    // Split the string into words using a regular expression
    const words = str.match(/[A-Z][a-z]+|[0-9]+|[a-z]+/g);
    if (!words) {
      return str;
    }
    // Join the words with a space and convert to lowercase
    return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(" ");
  },
  /**
   * Get a smooth scroll action supported in any browser
   */
  smoothScroll(target: ScrollPosition | Element, duration: number, container: Element | typeof window = window) {
    var pos = target instanceof Element ? getScrollPosition(target, container) : fillScrollPosition(target);

    pos.left = Math.round(pos.left);
    pos.top = Math.round(pos.top);

    duration = Math.round(duration);

    // Get the correct scroll property for the container type
    const scrollX = container instanceof Element ? "scrollLeft" : "scrollX";
    const scrollY = container instanceof Element ? "scrollTop" : "scrollY";

    if (duration < 0) {
      return Promise.reject("bad duration");
    }
    if (duration === 0) {
      container.scroll(pos.left, pos.top);
      return Promise.resolve();
    }

    var startTime = Date.now();
    var endTime = startTime + duration;

    var startLeft = (container as any)[scrollX];
    var startTop = (container as any)[scrollY];
    var distanceX = pos.left - startLeft;
    var distanceY = pos.top - startTop;

    // based on http://en.wikipedia.org/wiki/Smoothstep
    var smoothStep = function (start: number, end: number, point: number) {
      if (point <= start) {
        return 0;
      }
      if (point >= end) {
        return 1;
      }
      var x = (point - start) / (end - start); // bi-cubic interpolation
      return x * x * (3 - 2 * x);
    };

    return new Promise<void>(function (resolve, reject) {
      // This is to keep track of where the container's scrollTop is
      // supposed to be, based on what we're doing
      var previousLeft = (container as any)[scrollX];
      var previousTop = (container as any)[scrollY];

      // This is like a think function from a game loop
      var scrollFrame = function () {
        /* Let's comment this part out because it's causing Phil some pain 🎻 */
        // if (
        //   container[scrollX] != previousLeft &&
        //   (!(container instanceof Element) ||
        //     container.scrollWidth >
        //       container.scrollLeft + container.clientWidth)
        // ) {
        //   reject("interrupted");
        //   return;
        // }
        // if (
        //   container[scrollY] != previousTop &&
        //   (!(container instanceof Element) ||
        //     container.scrollHeight >
        //       container.scrollTop + container.clientHeight)
        // ) {
        //   reject("interrupted");
        //   return;
        // }

        // set the scrollTop for this frame
        var now = Date.now();
        var point = smoothStep(startTime, endTime, now);

        var frameLeft = Math.round(startLeft + distanceX * point);
        var frameTop = Math.round(startTop + distanceY * point);
        container.scroll(frameLeft, frameTop);

        // check if we're done!
        if (now >= endTime) {
          resolve();
          return;
        }

        // If we were supposed to scroll but didn't, then we
        // probably hit the limit, so consider it done; not
        // interrupted.
        if (
          (container as any)[scrollX] === previousLeft &&
          (container as any)[scrollX] !== frameLeft &&
          (container as any)[scrollY] === previousTop &&
          (container as any)[scrollY] !== frameTop
        ) {
          resolve();
          return;
        }
        previousLeft = frameLeft;
        previousTop = frameTop;

        // schedule next frame for execution
        setTimeout(scrollFrame, 0);
      };

      // boostrap the animation process
      setTimeout(scrollFrame, 0);
    });
  },
  // Used when presenting an option list as scrollable
  scrollPresent(element: HTMLElement, timeIndex = 10, delay = 0, scrollIndex = 337) {
    element.scrollTo({ left: scrollIndex });
    if (delay) {
      setTimeout(() => {
        if (element.scrollLeft > 0) {
          setTimeout(() => {
            this.smoothScroll({ left: 0, top: 0 }, 700, element);
          }, timeIndex / (element.scrollLeft / scrollIndex));
        }
      }, delay);
    } else {
      requestAnimationFrame(() => {
        if (element.scrollLeft > 0) {
          setTimeout(() => {
            this.smoothScroll({ left: 0, top: 0 }, 700, element);
          }, timeIndex / (element.scrollLeft / scrollIndex));
        }
      });
    }
  },
  // Takes any object with OptionCasing objects nested somewhere
  // within and determines if all the options are satisfied
  // 'inclusive' parameter if set to true will make the function
  // return false if it runs across a null value even if the
  // casing 'required' property is set to false
  fishCompletion(
    attributeNest: any,
    restrictions: { [key: string]: string[][] } = {},
    enablers: { [key: string]: string[][] } = {},
    inclusive: boolean = false,
    mustHaveInteracted = false,
    tag: string | false = false
  ): boolean {
    attributeNest = structure.getFilteredStructure(attributeNest);
    for (const key in attributeNest) {
      if (Object.prototype.hasOwnProperty.call(attributeNest, key)) {
        const obj = attributeNest[key];
        if (!obj) {
          continue;
        }
        // If the attribute is hidden or a template for virtual attributes, then we can ignore it
        if ((obj["x-data"] && this.hasHiddenAttribute(obj["x-data"])) || (obj["x-data"] && obj["x-data"].templated)) {
          continue;
        }
        // Continue traversing if there's no layer meta data to use, or
        // the meta data can pass us through the filter
        if (!obj["x-data"] || this.standardAttributeFilter(obj["x-data"], restrictions, enablers)) {
          // Check if we have stumbled upon an OptionCasing
          if (obj instanceof OptionCasing) {
            // if ((mustHaveInteracted as any) === "tacos") {
            //   console.log(key, obj.value?.id, obj.userInteraction);
            // }
            // Check if entire attribute branch cluster is not required
            if (obj.noRequirement && !inclusive) {
              // If the entire attribute does not need to be addressed
              if (mustHaveInteracted ? !obj.value && !obj.userInteraction : !obj.value || !obj.userInteraction) {
                return false;
              }
            }
            // Check if the value is null or hasn't been interacted with, but is required
            // If value is not null, but has an empty text property, also return false
            // if (obj.branchID === 'brcQ344988746') console.log(obj);
            if ((!obj.value || !obj.userInteraction) && obj.required) {
              return false;
            }
            // Check to see if the value has a text property, but the field is
            // required to be filled
            else if (
              obj.value &&
              (("text" in obj.value && obj.value.text == "") || !("text" in obj.value)) &&
              "required" in obj.value &&
              obj.value.required
            ) {
              return false;
            }
            // If user interaction must always be achieved, then consider any non-
            // required selections as incomplete if they haven't been interacted with
            else if (mustHaveInteracted && !obj.required && !obj.value && !obj.userInteraction) {
              return false;
            }
          }
          // Not an Option Casing? then let's jump to the next level of recursion
          // Ignore the object if it's the layer meta
          else if (obj instanceof Object && key !== "x-data") {
            // console.log("RECURSING:", key, obj, Object.keys(obj));
            if (!this.fishCompletion(obj, restrictions, enablers, inclusive, mustHaveInteracted)) {
              return false;
            }
          }
        }
      }
    }
    return true;
  },
  hasHiddenAttribute(xData: {
    id: string;
    attributes: Array<{ id: string; disabled?: boolean }>;
    disabled?: boolean;
  }): boolean {
    const mainAttribute = getConfiguratorObject<Attribute>(xData.id);
    if (mainAttribute && "hidden" in mainAttribute && mainAttribute.hidden) {
      return true;
    }
    if (xData.attributes) {
      for (const attribute of xData.attributes) {
        const attrObj = getConfiguratorObject<Attribute>(attribute.id);
        if (attrObj && "hidden" in attrObj && attrObj.hidden) {
          return true;
        }
      }
    }
    return false;
  },
  // Works just like 'fishCompletion' method, but instead of returning true if all
  // step are considered completed and false otherwise, this method return the first
  // OptionCasing it finds which is causing the incomplete step. If all steps are
  // considered complete, null is returned instead.
  findIncompleted(
    casingNest: any,
    restrictions: { [key: string]: string[][] } = {},
    enablers: { [key: string]: string[][] } = {},
    ignoreRequirements: boolean = false
  ): OptionCasing | null {
    // const brefore = casingNest;
    casingNest = structure.getFilteredStructure(casingNest);
    // console.log("CASING NEST:", casingNest, brefore);
    for (const key in casingNest) {
      if (Object.prototype.hasOwnProperty.call(casingNest, key) && key != "x-data") {
        const obj = casingNest[key];
        // If the attribute is hidden or a template for virtual attributes, then we can ignore it
        if ((obj["x-data"] && this.hasHiddenAttribute(obj["x-data"])) || (obj["x-data"] && obj["x-data"].templated)) {
          continue;
        }
        // Continue traversing if there's no layer meta data to use, or
        // the meta data can pass us through the filter
        if (!obj["x-data"] || this.standardAttributeFilter(obj["x-data"], restrictions, enablers)) {
          // Check if we have stumbled upon an OptionCasing
          if (obj instanceof OptionCasing) {
            // Check if entire attribute branch cluster is not required
            if (obj.noRequirement && !ignoreRequirements) {
              // If the entire attribute does not need to be addressed
              if (!obj.value || !obj.userInteraction) {
                return obj;
              }
            }
            // Check if the value is null or hasn't been interacted with, but is required
            // If value is not null, but has an empty text property, also return false
            else if ((!obj.value || !obj.userInteraction) && obj.required) {
              return obj;
            }
            // Check to see if the value has a text property, but the field is
            // required to be filled
            else if (
              obj.value &&
              "text" in obj.value &&
              obj.value.text == "" &&
              "required" in obj.value &&
              obj.value.required
            ) {
              return obj;
            }
          }
          // Not an Option Casing? then let's jump to the next level of recursion
          // Ignore the object if it's the layer meta
          else if (obj instanceof Object && key !== "x-data") {
            const casing = this.findIncompleted(obj, restrictions, enablers, ignoreRequirements);
            if (casing) {
              return casing;
            }
          }
        }
      }
    }
    return null;
  },
  // Can find all the upcharges of absolute values
  digOutUpcharges(
    optionHolder: any,
    restrictions: { [key: string]: Array<Array<string>> } = {},
    enablers: { [key: string]: Array<Array<string>> } = {},
    productID: string,
    modMap: { [key: string]: string },
    includeOtherProductPrices = true
  ): number {
    optionHolder = structure.getFilteredStructure(optionHolder);
    let sum = 0;
    for (const key in optionHolder) {
      if (Object.prototype.hasOwnProperty.call(optionHolder, key)) {
        const obj = optionHolder[key];
        if (obj && (!obj["x-data"] || this.standardAttributeFilter(obj["x-data"], restrictions, enablers))) {
          if (obj instanceof OptionCasing) {
            const casing: OptionCasing<Option> = obj;
            if (casing.value && (!casing.value["disabled"] || obj.value.id in enablers)) {
              // If we are to ignore pricing from other woo products, then check if
              // we are looking an option that represents a woo product
              if (
                !includeOtherProductPrices &&
                (casing.value.type == "ComplexCompoundOption" || casing.woocommerceProduct)
              ) {
                continue;
              }
              const upcharge = this.getOptionUpcharge(casing.value, casing, productID, false, modMap);
              if (typeof upcharge == "number" || !upcharge.endsWith("%")) {
                sum += this.getNumber(upcharge);
              }
            }
          } else if (obj instanceof Object && key !== "x-data") {
            sum += this.digOutUpcharges(obj, restrictions, enablers, productID, modMap, includeOtherProductPrices);
          }
        }
      }
    }
    return sum;
  },
  // Find and add up all the percentages for upcharging
  digOutPercentages(
    optionHolder: any,
    restrictions: { [key: string]: Array<Array<string>> } = {},
    enablers: { [key: string]: Array<Array<string>> } = {},
    productID: string,
    modMap: { [key: string]: string }
  ): number {
    optionHolder = structure.getFilteredStructure(optionHolder);
    let sum = 0;
    for (const key in optionHolder) {
      if (Object.prototype.hasOwnProperty.call(optionHolder, key)) {
        const obj = optionHolder[key];
        if (obj && (!obj["x-data"] || this.standardAttributeFilter(obj["x-data"], restrictions, enablers))) {
          if (obj instanceof OptionCasing) {
            if (obj.value && (!obj.value.disabled || obj.value.id in enablers)) {
              const upcharge = this.getOptionUpcharge(obj.value, obj, productID, false, modMap);
              if (typeof upcharge == "string" && upcharge.endsWith("%")) {
                sum += parseFloat(upcharge);
              }
            }
          } else if (obj instanceof Object && key !== "x-data") {
            sum += this.digOutPercentages(obj, restrictions, enablers, productID, modMap);
          }
        }
      }
    }
    return sum;
  },
  // Find and add up all the percentages for upcharging
  digOutWooProducts(
    optionHolder: any,
    restrictions: { [key: string]: Array<Array<string>> } = {},
    enablers: { [key: string]: Array<Array<string>> } = {},
    productID: string,
    modMap: { [key: string]: string },
    objectIDMap: { [key: string]: ConfiguratorObject },
    virtualOnly: boolean = false
  ): Array<{ wooid: number; name: string; price: number; quantity: number }> {
    optionHolder = structure.getFilteredStructure(optionHolder, "*");
    let products: Array<{ wooid: number; name: string; price: number; quantity: number }> = [];
    const productDetails: ReturnType<typeof this.productDetailsFromVirtuals> = [];
    for (const key in optionHolder) {
      if (Object.prototype.hasOwnProperty.call(optionHolder, key)) {
        const obj = optionHolder[key];
        if (obj && (!obj["x-data"] || this.standardAttributeFilter(obj["x-data"], restrictions, enablers))) {
          if (obj instanceof OptionCasing) {
            if (obj.value && (!obj.value.disabled || obj.value.id in enablers)) {
              // If we are to ignore pricing from other woo products, then check if
              // we are looking an option that represents a woo product
              if (
                obj.woocommerceProduct &&
                obj.woocommerceName &&
                obj.value?.["wcvalue"] &&
                (!virtualOnly || obj["x-data"]?.virtualGroup)
              ) {
                // console.log("INSIDE:", obj);
                this.productDetailsFromVirtuals(
                  obj as any,
                  obj.woocommerceName,
                  obj.value["wcvalue"],
                  objectIDMap,
                  undefined,
                  productDetails
                );
              } else if (!virtualOnly && obj.value.type == "ComplexCompoundOption") {
                const details = this.productDetailsFromFormula(obj);
                for (let i = 0; i < details.length; i++) {
                  const detail = details[i];
                  const price = woocommerce.getProductPrice(detail.wooid.toString(), detail.variation);
                  if (price) {
                    products.push({
                      wooid: Number(detail.wooid),
                      name: detail.name,
                      price: price,
                      quantity: detail.quantity,
                    });
                  }
                }
              }
            }
          } else if (obj instanceof Object && key !== "x-data") {
            const newProducts = this.digOutWooProducts(
              obj,
              restrictions,
              enablers,
              productID,
              modMap,
              objectIDMap,
              virtualOnly
            );
            products.push(...newProducts);
          }
        }
      }
    }
    for (let i = 0; i < productDetails.length; i++) {
      const detail = productDetails[i];
      let price = woocommerce.getProductPrice(detail.wooid.toString(), detail.variation);
      if (detail.addons) {
        for (const addon in detail.addons) {
          const addonValue = detail.addons[addon];
          const upcharge: string | number = woocommerce.getOptionCharge(
            addonValue,
            addon,
            detail.wooid.toString(),
            modMap
          ) as any;
          if (typeof upcharge == "number" || !upcharge.endsWith("%")) {
            const sum = this.getNumber(upcharge);
            if (sum) {
              price += sum;
            }
          }
        }
      }
      if (price) {
        products.push({
          wooid: Number(detail.wooid),
          name: detail.name,
          price: price,
          quantity: detail.quantity,
        });
      }
    }
    return products;
  },
  productDetailsFromFormula(casing: OptionCasing<ComplexCompoundOption>) {
    if (!casing.value?.text) return [];
    let result: string | any[] = casing.value.text;
    for (let i = 0; i < casing.value.formula.length; i++) {
      const formula = casing.value.formula[i];
      if (formula.type == "regexp" && typeof result === "string") {
        const regex = new RegExp(formula.pattern, formula.flags);
        result = result.match(regex) ?? formula.fallback;
      } else if (formula.type == "fixed" && Array.isArray(result)) {
        const fetchValue = (branchID: string) => structure.branch(branchID)?.value?.name || "";
        result =
          fixedRoutines[formula.name].apply({ subject: result, fetchValue }, formula.args as any) ?? formula.fallback;
      }
    }
    const finalResult = Array.isArray(result)
      ? result.map((x) => (x?.toString ? x.toString() : String(x))).sort((a, b) => a.localeCompare(b))
      : [result];

    const products: CompoundProductDefinition[] =
      "procedural" in casing.value && casing.value.procedural
        ? parser.parseTemplateSync(casing.value.procedural)
        : casing.value["products"];
    if (!("products" in casing.value)) {
      // Cache the procedurally generated products for future use
      casing.value["products"] = products;
    }
    // Now look through the products and see if any of the result values matches the keys
    const matchedProducts: Record<
      string,
      {
        wooid: number | string;
        variation?: number | string;
        addons?: Record<string, string>;
        quantity: number;
        name: string;
      }
    > = {};
    for (let i = 0; i < finalResult.length; i++) {
      const key = finalResult[i];
      const product = products.find((p) => p.key === key);
      if (product) {
        if (!matchedProducts[key]) {
          matchedProducts[key] = {
            wooid: product.wooid,
            name: key,
            quantity: 0,
          };
          if (product.woovariation) {
            matchedProducts[key].variation = product.woovariation;
          }
          if (product.addons) {
            matchedProducts[key].addons = { ...product.addons };
          }
        }
        matchedProducts[key].quantity++;
      }
    }
    return Object.values(matchedProducts);
  },
  productDetailsFromVirtuals(
    casing: OptionCasing<ComplexOption>,
    addon: string,
    value: string,
    objectIDMap: { [key: string]: ConfiguratorObject },
    productStructure?: any,
    extraProducts: Array<{
      wooid: number | string;
      variation?: number | string;
      addons?: Record<string, string>;
      quantity: number;
      name: string;
    }> = []
  ) {
    const casingProduct = casing.woocommerceProduct;
    const virtualConfig = (casing["x-data"]?.attributes || []).reduce((v, attr) => {
      const attribute = objectIDMap[attr.id] as Attribute;
      if (!v && attribute && "virtual" in attribute && attribute.virtual) {
        v = attribute.virtual;
      }
      return v;
    }, false as false | ComplexSubAttribute["virtual"]);
    if (virtualConfig) {
      const virtualGroup = casing["x-data"]!.virtualGroup!;
      const extraProductName = virtualGroup.slice(-1)[0];
      let extraProduct = extraProducts.find((x) => x.name == extraProductName);
      if (!extraProduct) {
        const quantityField = virtualConfig.quantityfield?.replaceAll("$pid$", casingProduct) || "";
        extraProduct = {
          name: extraProductName,
          wooid: casingProduct,
          quantity: this.deriveVirtualProductQuantity(casing, virtualGroup, quantityField, productStructure),
        };
        extraProducts.push(extraProduct);
      }
      if (!extraProduct.addons) {
        extraProduct.addons = {};
      }
      extraProduct.addons[addon] = value;
    }

    return extraProducts;
  },
  deriveVirtualProductQuantity(
    casing: OptionCasing<ComplexOption>,
    virtualGroup: string[],
    quantityField: string | undefined,
    productStructure?: any
  ) {
    if (quantityField) {
      let virtualGroupArray: OptionCasing<ComplexOption>[] = [];
      if (productStructure) {
        // Get the siblings of the casing by looking through the virtual group
        virtualGroupArray = Object.values(
          structure.getVirtualBranchGroup<ComplexOption>(virtualGroup, productStructure) || {}
        );
      } else {
        // Derive a siblings list from the casing itself
        let currentCasing: OptionCasing<ComplexOption> | null = casing;
        while (currentCasing) {
          virtualGroupArray.push(currentCasing);
          currentCasing = currentCasing.previous();
        }
        currentCasing = casing.next();
        while (currentCasing) {
          virtualGroupArray.push(currentCasing);
          currentCasing = currentCasing.next();
        }
      }
      return virtualGroupArray.reduce((qty, c) => {
        if (c.woocommerceName == quantityField && c.value?.["wcvalue"]) {
          const wcvalue = c.value["wcvalue"];
          const qtyValue = parseInt(wcvalue.startsWith("$") ? c.getMetaData(wcvalue.slice(1, -1)) : wcvalue);
          return isNaN(qtyValue) ? 1 : qtyValue;
        }
        return qty;
      }, 1);
    }
    return 1;
  },
  /**
   * Get a keyed object from a query string
   */
  fromQueryString(queryString: string): {
    [key: string]: boolean | number | string;
  } {
    if (queryString.startsWith("?")) {
      queryString = queryString.slice(1);
    }
    if (!queryString) {
      return {};
    }
    const obj: { [key: string]: boolean | number | string } = {};
    queryString.split("&").forEach((pairString) => {
      const pair = pairString.split("=");
      if (!pair[1]) {
        obj[pair[0]] = true;
      } else if (!isNaN(pair[1] as any)) {
        obj[pair[0]] = Number(pair[1]);
      } else {
        obj[pair[0]] = decodeURIComponent(pair[1]);
      }
    });
    return obj;
  },
  /**
   * Turn a keyed object into a query string
   */
  toQueryString(queryObj: { [key: string]: boolean | number | string }): string {
    const keys = Object.keys(queryObj);
    if (!keys.length) {
      return "";
    }
    return (
      "?" +
      keys
        .filter((key) => queryObj[key] !== false)
        .map((key) => key + (queryObj[key] !== true ? "=" + queryObj[key] : ""))
        .join("&")
    );
  },
  /**
   * Get a proper number value from a string. Very smart function
   */
  getNumber(number: string | number) {
    if (typeof number == "number") {
      return number;
    }
    const match = number.match(/(-?\d+(\.\d+)?)/);
    if (match) {
      return Number(match[0]);
    }
    return NaN;
  },
  /**
   * Format a number to be a proper dollar/cents value string
   */
  formatPrice(number: number): string {
    // Round to 2 decimal places first
    const rounded = Math.round(number * 100) / 100;
    // If it's a whole number, return without decimals
    if (!(rounded % 1)) {
      return String(rounded);
    }
    // If it has one decimal place (like 10.5), format as 10.50
    const cents = Math.round(rounded * 100) % 100;
    if (!(cents % 10)) {
      return rounded.toFixed(1) + "0";
    }
    // Otherwise return with 2 decimal places
    return String(rounded);
  },
  async copyToClipboard(str: string) {
    try {
      await navigator.clipboard.writeText(str);
    } catch {
      const el = document.createElement("textarea");
      el.value = str;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
  },
  generateHash(string: string) {
    var hash = 0,
      i,
      chr;
    for (i = 0; i < string.length; i++) {
      chr = string.charCodeAt(i);
      hash = (hash << 5) - hash + chr;
      hash |= 0; // Convert to 32bit integer
    }
    let prefix = "Q";
    if (hash < 0) {
      hash *= -1;
      prefix = "Y";
    }
    return prefix + hash;
  },
  shuffle(array: any[]) {
    let currentIndex = array.length,
      randomIndex;

    // While there remain elements to shuffle.
    while (currentIndex != 0) {
      // Pick a remaining element.
      randomIndex = Math.floor(Math.random() * currentIndex);
      currentIndex--;

      // And swap it with the current element.
      [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
    }

    return array;
  },
  isIterable(obj: any) {
    // checks for null and undefined
    if (!obj) {
      return false;
    }
    return typeof obj[Symbol.iterator] === "function";
  },
  timedLoop(callback: (index: number) => void, timeout: number, limit = Infinity, i = 0): TimedLoopControls {
    if (!limit) {
      return {
        stop: () => {},
      };
    }
    const data = {
      stop: false,
    };
    TLRecursionCall(callback, timeout, limit, i, data);
    return {
      stop() {
        data.stop = true;
      },
    };
  },
  colorDist(color1: string | Array<number>, color2: string | Array<number>) {
    var rgb1 = color1 instanceof Array ? color1 : this.getRGB(color1);
    var rgb2 = color2 instanceof Array ? color2 : this.getRGB(color2);
    return Math.sqrt(rgb1.map((n, i) => rgb2[i] - n).reduce((total, n) => total + n * n, 0)) / 441.6729559300637;
  },
  colorLuminance(color: string | Array<number>) {
    var rgb = color instanceof Array ? color : this.getRGB(color);
    var r = rgb[0] / 255;
    r = r <= 0.03928 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4);
    var g = rgb[0] / 255;
    g = g <= 0.03928 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4);
    var b = rgb[0] / 255;
    b = b <= 0.03928 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  },
  getRGB(color: string) {
    var el = document.createElement("span");
    el.style.color = color;
    document.body.append(el);
    var color = getComputedStyle(el).color;
    el.remove();
    var match = color.match(/rgba?\((.+)\)/);
    if (match) {
      return match[1].split(", ").map((n, i) => (i !== 3 ? parseInt(n) : Math.round(Number(n) * 255)));
    }
    return [];
  },
  standardOptionFilter(
    option: Option | null,
    path: Array<string>,
    indexedRestrictions: { [key: string]: string[][] },
    indexEnablers: { [key: string]: string[][] }
  ) {
    if (!option) {
      return false;
    }
    if (indexEnablers && "disabled" in option && option.disabled) {
      if (option.id in indexEnablers) {
        if (indexEnablers[option.id].length) {
          return restrictions.match(indexEnablers[option.id], path);
        }
        return true;
      }
      return false;
    }
    if (option.id in indexedRestrictions) {
      if (indexedRestrictions[option.id].length && indexedRestrictions[option.id][0].length) {
        return !restrictions.match(indexedRestrictions[option.id], path);
      }
      return false;
    }
    return true;
  },
  standardAttributeFilter(
    attribute: { id: string; disabled?: boolean } | null,
    indexedRestrictions: { [key: string]: Array<Array<string>> },
    indexEnablers: { [key: string]: string[][] }
  ) {
    if (!attribute) {
      return false;
    }
    if (indexEnablers && "disabled" in attribute && attribute.disabled && !(attribute.id in indexEnablers)) {
      return false;
    }
    if (attribute.id in indexedRestrictions) {
      return false;
    }
    return true;
  },
  getOptionUpcharge(
    option: Option | SeriesInfo,
    casing: OptionCasing,
    productID: string,
    basePrice: number | false,
    modMap?: { [key: string]: string }
  ): string | number {
    if ("wcvalue" in option && option.wcvalue && casing.woocommerceName) {
      // Generate a mod value iof we can
      let mods: Record<string, string> = {};
      const modBranches = woocommerce.getModBranchIDs(option.wcvalue);
      if (modMap && modBranches) {
        for (const branch of modBranches) {
          mods[branch] = modMap[branch] || "";
        }
      }
      let upcharge =
        woocommerce.getOptionCharge(option.wcvalue, casing.woocommerceName, productID, mods) || option.upcharge || 0;
      if (basePrice !== false && typeof upcharge == "string" && upcharge.endsWith("%")) {
        upcharge = basePrice * (parseFloat(upcharge) / 100);
        upcharge = Math.round(upcharge * 100) / 100;
      }
      // If it's a text option that supports length based price, factor that in
      if ("wclength" in option && option.wclength && option.text) {
        // Ignore whitespace
        const charCount = option.text.replace(/\s*/g, "").length;
        upcharge = Number(upcharge);
        const range = this.getRange(charCount, option.wclength.ranges);
        const value = range ? option.wclength.wcvalue.replace("$range$", range) : "";
        const modBranches = woocommerce.getModBranchIDs(option.wclength.wcvalue);
        const mods = modMap
          ? modBranches.reduce((a, brc) => {
              a[brc] = modMap[brc] || "";
              return a;
            }, {} as Record<string, string>)
          : {};
        const lenCharge = woocommerce.getOptionCharge(value, option.wclength.wcname, productID, mods);
        if (lenCharge && typeof upcharge == "number") {
          upcharge += lenCharge;
        }
      }
      return upcharge;
    }
    return option["upcharge"] || 0;
  },
  getBasePrice(object: Model | Product, productID: string) {
    if (object.type == "Model" && object.wcvalue) {
      return this.getNumber(
        woocommerce.getOptionCharge(
          object.wcvalue,
          "addon-" + woocommerce.getProduct(productID) + "-model",
          productID
        ) || 0
      );
    }
    return object.baseprice || 0;
  },
  hashString(string: string, length = 6) {
    var charset = "abcdefghijklmnopqrstuvwxyz0123456789";
    var num = string.length % charset.length;
    for (var i = 0; i < string.length; i++) {
      num += string.charCodeAt(i);
    }
    num = num % charset.length;
    var hash = "";
    for (var i = 0; i < length; i++) {
      var charCode = string.charCodeAt(Math.min(Math.round((i * string.length) / length), string.length - 1));
      var char = charset[(charCode + num) % charset.length];
      hash += char;
      num = (num + charCode + char.charCodeAt(0) + i + string.length) % charset.length;
    }
    return hash;
  },
  primativeDiff(a: any, b: any) {
    if (a === b) {
      return false;
    } else if (!(a instanceof Object) || !(b instanceof Object)) {
      return { a, b };
    }
    const diffObj: any = {};
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    const longest = Math.max(aKeys.length, bKeys.length);
    for (let i = 0; i < longest; i++) {
      const key = aKeys[i] ?? bKeys[i];
      const memberA = (a as any)[key];
      const memberB = (b as any)[key];
      if (memberA instanceof Object && memberB instanceof Object) {
        const subObj = this.primativeDiff(memberA, memberB);
        if (subObj) {
          diffObj[key] = subObj;
        }
      } else if (memberA !== memberB) {
        diffObj[key] = { a: memberA, b: memberB };
      }
    }

    if (Object.keys(diffObj).length) {
      return diffObj;
    }
    return false;
  },
  unpackViewset(
    viewset: ConfiguratorViewSet
  ): Array<{ value: ConfiguratorView; conditions: ApplicationCondition | ApplicationCondition[] | null }> {
    if (typeof viewset == "number" || (Array.isArray(viewset) && typeof viewset[0] == "number")) {
      return [
        {
          value: viewset as any,
          conditions: null,
        },
      ];
    }
    return viewset.map((view: any) => {
      return {
        value: view.view,
        conditions: view.extrarules || null,
      };
    });
  },
  getOS() {
    var userAgent = window.navigator.userAgent,
      platform = window.navigator.platform,
      macosPlatforms = ["Macintosh", "MacIntel", "MacPPC", "Mac68K"],
      windowsPlatforms = ["Win32", "Win64", "Windows", "WinCE"],
      iosPlatforms = ["iPhone", "iPad", "iPod"],
      isTouch = window.isTouch ?? this.isTouchDevice4(),
      os: any = null;

    if (macosPlatforms.indexOf(platform) !== -1) {
      os = "Mac OS";
      if (isTouch) {
        os = "iOS";
      }
    } else if (iosPlatforms.indexOf(platform) !== -1) {
      os = "iOS";
    } else if (windowsPlatforms.indexOf(platform) !== -1) {
      os = "Windows";
    } else if (/Android/.test(userAgent)) {
      os = "Android";
    } else if (!os && /Linux/.test(platform)) {
      os = "Linux";
    }

    return os;
  },
  toKebobCase(name: string) {
    return name.replace(/(\w)([A-Z])/g, "$1-$2").toLowerCase();
  },
  smoothResize: smoothResize.set,
  deriveCloneMetaField(
    mutation: OrderCloneMutation,
    number: number,
    cloneMeta: Array<{ key: string; value: any; ref: boolean }>
  ) {
    // Get the key which is either a branchID or a woocommerce addon name
    const key = mutation.source == "meta" ? mutation.wcname : mutation.branch;
    let value: any = null;
    let ref = false;
    // Fetch the value, which will either be a string or null
    if (mutation.type == "options") {
      if (number === 1) {
        const branch = structure.branch(mutation.branch) || null;
        if (branch?.value) {
          value = branch.value.id;
          ref = true;
        }
      } else {
        const meta = cloneMeta.find((m) => m.key == key);
        if (meta) {
          value = meta.value || null;
        }
      }
    } else {
      value = "";
      if (number === 1 && mutation.source == "selection") {
        const branch = structure.branch<ComplexTypeOption>(mutation.branch) || null;
        if (branch?.value && "text" in branch.value) {
          value = branch.value.text;
          ref = true;
        }
      } else {
        const meta = cloneMeta.find((m) => m.key == key);
        if (meta) {
          value = meta.value || "";
        }
      }
    }
    const combo = {
      key,
      value,
      ref,
      ...mutation,
    };
    delete (combo as any).wcname;
    delete (combo as any).branch;
    return combo;
  },
  getRange(value: number, ranges: string[]) {
    const index = ranges.map((range) => range.split("-").map(Number)).findIndex((r) => value >= r[0] && value <= r[1]);
    if (index > -1) {
      return ranges[index];
    }
    return false;
  },
  deepObjectExtend<F extends object>(firstObj: F, ...objects: object[]): F & object {
    for (let i = 0; i < objects.length; i++) {
      const object = objects[i];
      deepObjectExtend_RECURSE([], object, firstObj);
    }
    return firstObj as any;
  },
  getDataOrigin() {
    return initUseLocalData ? location.origin : "https://nokona.com";
  },
  getEnvironment() {
    return window["__APP-ENV__"] || import.meta.env.MODE || "production";
  },
  colorToRGBString(color: string | Array<number>) {
    if (color instanceof Array) {
      // Array must be of length 3 or 4. Reduce if longer, or pad with zeros
      if (color.length > 4) {
        color = color.slice(0, 4);
      }
      while (color.length < 3) {
        color.push(0);
      }
      if (color.length == 4) {
        return `rgba(${color.join(", ")})`;
      }
      return `rgb(${color.join(", ")})`;
    } else {
      const colorFormatterEl = (window as any).__colorFormatterEl || document.createElement("span");
      if (!(window as any).__colorFormatterEl) {
        (window as any).__colorFormatterEl = colorFormatterEl;
      }
      colorFormatterEl.style.color = color;
      document.body.append(colorFormatterEl);
      const rgbColor = getComputedStyle(colorFormatterEl).color;
      colorFormatterEl.remove();
      return rgbColor;
    }
  },
  isTouchDevice4() {
    var prefixes = " -webkit- -moz- -o- -ms- ".split(" ");

    var mq = function (query: string) {
      return window.matchMedia(query).matches;
    };
    var DocumentTouch = (window as any).DocumentTouch;
    if ("ontouchstart" in window || (DocumentTouch && document instanceof DocumentTouch)) {
      return true;
    }

    // include the 'heartz' as a way to have a non matching MQ to help terminate the join
    // https://git.io/vznFH
    var query = ["(", prefixes.join("touch-enabled),("), "heartz", ")"].join("");
    return mq(query);
  },
  detectBrowser() {
    // Opera 8.0+
    var isOpera =
      (!!(window as any).opr && !!(window as any).addons) ||
      !!(window as any).opera ||
      navigator.userAgent.indexOf(" OPR/") >= 0;

    // Firefox 1.0+
    var isFirefox = typeof (window as any).InstallTrigger !== "undefined";

    // Safari 3.0+ "[object HTMLElementConstructor]"
    var isSafari =
      /constructor/i.test((window as any).HTMLElement) ||
      (function (p) {
        return p.toString() === "[object SafariRemoteNotification]";
      })(!window["safari"] || (typeof (window as any).safari !== "undefined" && window["safari"].pushNotification));

    // Internet Explorer 6-11
    var isIE = /*@cc_on!@*/ false || !!(document as any).documentMode;

    // Edge 20+
    var isEdge = !isIE && !!(window as any).StyleMedia;

    // Chrome 1 - 79
    var isChrome = !!(window as any).chrome;

    // Edge (based on chromium) detection
    var isEdgeChromium = isChrome && navigator.userAgent.indexOf("Edg") != -1;

    // Blink engine detection
    var isBlink = (isChrome || isOpera) && !!window.CSS;

    // Mobile Safari detection
    var isMobileSafari = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;

    // If safari && mobile safari is false, run one more test to see if it's an iPad
    if (!isSafari && !isMobileSafari) {
      var isTouchDevice =
        "ontouchstart" in window || navigator.maxTouchPoints > 0 || (navigator as any).msMaxTouchPoints > 0;

      // Check if the browser is Safari
      var isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

      // Check if the device is an iPad based on touch support and Safari browser
      var isiPad = isTouchDevice && isSafari;

      if (isiPad) {
        isMobileSafari = true;
      }
    }

    switch (true) {
      case isEdge:
        return "Edge";
      case isEdgeChromium:
        return "Edge Chromium";
      case isMobileSafari:
        return "Safari";
      case isSafari:
        return "Safari";
      case isFirefox:
        return "Firefox";
      case isChrome:
        return "Chrome";
      case isOpera:
        return "Opera";
      case isIE:
        return "IE";
      case isBlink:
        return "Blink";
      default:
        return "Unknown";
    }
  },
  validateEmail(email: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  },
  forceInteractions(selections: any) {
    // Loop through the selections and force all OptionCasing objects to have
    // their userInteraction property set to true
    structure.traverse(selections, (obj: any) => {
      if (obj instanceof OptionCasing) {
        obj.userInteraction = true;
      }
    });
  },
  getVersion(): string {
    return window.configuratorVersion || "1.0.0";
  },
  setVersionParam(url: string): string {
    if (!url.startsWith("http") && !url.startsWith("/")) {
      return url;
    }
    return url + (url.includes("?") ? "&" : "?") + "ver=" + this.getVersion();
  },
  isWASMAvailable() {
    return !!(window as any).WebAssembly;
  },
  orderedInsert<T>(array: T[], item: T, compare: (a: T, b: T) => number): number {
    let low = 0;
    let high = array.length;
    let mid = (low + high) >> 1;
    while (low < high) {
      let rslt = compare(item, array[mid]);
      if (rslt < 0) {
        low = mid + 1;
      } else if (rslt > 0) {
        high = mid;
      } else {
        array.splice(mid + 1, 0, item);
        return mid + 1;
      }
      mid = (low + high) >> 1;
    }
    array.splice(mid, 0, item);
    return mid;
  },
  loadScript(url: string): Promise<Event> {
    if (window["__loadedScripts__"] && window["__loadedScripts__"][url]) {
      if (window["__loadedScripts__"][url] instanceof Promise) {
        return window["__loadedScripts__"][url];
      } else {
        return Promise.resolve(new Event("load"));
      }
    }
    const promise = new Promise<Event>((resolve, reject) => {
      const script = document.createElement("script");
      script.addEventListener("load", (e) => {
        window["__loadedScripts__"][url] = true;
        if (window["__loadedScriptCallbackQueued__"]?.[url]) {
          const callbacks = window["__loadedScriptCallbackQueued__"][url];
          callbacks.forEach((callback: (e?: Event) => void) => callback(e));
          delete window["__loadedScriptCallbackQueued__"][url];
        }
        resolve(e);
      });
      script.addEventListener("error", (err) => {
        window["__loadedScripts__"][url] = false;
        reject(err);
      });
      script.src = url;
      document.body.appendChild(script);
    });
    if (!window["__loadedScripts__"]) {
      window["__loadedScripts__"] = {};
    }
    window["__loadedScripts__"][url] = promise;
    return promise;
  },
  onScriptLoaded(url: string, callback: (e?: Event) => void) {
    if (window["__loadedScripts__"] && window["__loadedScripts__"][url]) {
      if (window["__loadedScripts__"][url] instanceof Promise) {
        window["__loadedScripts__"][url].then(callback);
      } else {
        callback();
      }
    } else {
      if (!window["__loadedScriptCallbackQueued__"]) {
        window["__loadedScriptCallbackQueued__"] = {};
      }
      if (!window["__loadedScriptCallbackQueued__"][url]) {
        window["__loadedScriptCallbackQueued__"][url] = [];
      }
      window["__loadedScriptCallbackQueued__"][url].push(callback);
    }
  },
  remEuclidean(dividend: number, divisor: number) {
    // Get the euclidean remainnder (always positive)
    return (dividend % divisor) + divisor * ((dividend < 0) as any);
  },
  lerp(a: number, b: number, t: number) {
    return a + (b - a) * t;
  },
  parseCssNumber(value: string): { value: number; unit: string } {
    value = value.trim();
    // Parse a css value string and return a number
    // and unit object
    if (value.endsWith("%")) {
      return {
        value: parseFloat(value.slice(0, -1)),
        unit: "%",
      };
    } else if (value.endsWith("px")) {
      return {
        value: parseFloat(value.slice(0, -2)),
        unit: "px",
      };
    } else if (value.endsWith("vw")) {
      return {
        value: (parseFloat(value.slice(0, -2)) / 100) * window.innerWidth,
        unit: "px",
      };
    } else if (value.endsWith("vh")) {
      return {
        value: (parseFloat(value.slice(0, -2)) / 100) * window.innerHeight,
        unit: "px",
      };
    } else {
      return {
        value: parseFloat(value),
        unit: "",
      };
    }
  },
  getUserDeviceParams(): Record<string, any> {
    if (window["__userDeviceParams"]) {
      return window["__userDeviceParams"];
    }
    const os = this.getOS();
    const browser = this.detectBrowser();
    const supportsWebAssembly = this.isWASMAvailable();
    const params = {
      width: window.innerWidth,
      height: window.innerHeight,
      os,
      browser,
      supportsWebAssembly,
      supportsOffscreenCanvas: !!window.OffscreenCanvas,
      supportsWebGL2: !!window.WebGL2RenderingContext,
      supportsSharedArrayBuffer: typeof SharedArrayBuffer !== "undefined",
      supportsWebGPU: !!navigator["gpu"],
    };
    window["__userDeviceParams"] = params;
    return params;
  },
  imageDataOrCanvasToBlob(
    source: ImageData | HTMLCanvasElement | OffscreenCanvas,
    type?: string,
    quality?: number,
    format: number = 0
  ): Promise<Blob> {
    let canvas: HTMLCanvasElement | OffscreenCanvas;
    if ("data" in source) {
      // const three = window['THREE'];
      const luminanceFormat = 1024; //three.LuminanceFormat;
      if (format == luminanceFormat) {
        // Make sure the data is actaully an ImageData
        const data = new Uint8ClampedArray(source.width * source.height * 4);
        for (let i = 0; i < source.data.length; i++) {
          const index = i * 4;
          data[index] = source.data[i];
          data[index + 1] = source.data[i];
          data[index + 2] = source.data[i];
          data[index + 3] = 255;
        }
        source = new ImageData(data, source.width, source.height);
      }
      // Create a temporary canvas to draw the ImageData
      canvas = document.createElement("canvas");
      canvas.width = source.width;
      canvas.height = source.height;

      const ctx = canvas.getContext("2d")!;

      // Put the ImageData onto the canvas
      ctx.putImageData(source, 0, 0);
    } else {
      canvas = source;
    }

    // Convert the canvas to a Blob
    const blobPromise =
      canvas instanceof OffscreenCanvas
        ? canvas.convertToBlob({ type, quality })
        : new Promise<Blob | null>((r) => canvas.toBlob(r, type, quality));
    return new Promise((resolve, reject) => {
      blobPromise.then((blob) => {
        if (blob) {
          resolve(blob); // Return the Blob URL
        } else {
          reject(new Error("Blob conversion failed."));
        }
      });
    });
  },
  imageDataOrCanvasToBuffer(
    source: ImageData | HTMLCanvasElement | OffscreenCanvas,
    type?: string,
    quality?: any,
    format: number = 0
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      this.imageDataOrCanvasToBlob(source, type, quality, format).then((blob) => {
        // Convert the Blob to a Buffer
        const reader = new FileReader();
        reader.onload = () => {
          const buffer = Buffer.from(reader.result as ArrayBuffer);
          resolve(buffer);
        };
        reader.onerror = () => {
          reject(new Error("Blob conversion failed."));
        };
        reader.readAsArrayBuffer(blob);
      });
    });
  },
  imageDataOrCanvasToBlobURL(
    source: ImageData | HTMLCanvasElement | OffscreenCanvas,
    type?: string,
    quality?: any,
    format: number = 0
  ): Promise<string> {
    return this.imageDataOrCanvasToBlob(source, type, quality, format).then((blob) => URL.createObjectURL(blob));
  },
  async imageDataOrCanvasToDataURL(
    source: ImageData | HTMLCanvasElement | OffscreenCanvas,
    type?: string,
    quality?: any
  ): Promise<string> {
    if (type == "image/avif" || type == "avif") {
      // Turn the source into ImageData if it isn't already
      if (source instanceof OffscreenCanvas || source instanceof HTMLCanvasElement) {
        source = source.getContext("2d")!.getImageData(0, 0, source.width, source.height);
      }
      const buffer = await avif.encode(source, { quality: Math.round((quality ?? 1) * 100) });
      // Now convert to data URL
      const base64 = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.readAsDataURL(new Blob([buffer]));
      });
      return `data:image/avif;base64,${base64}`;
    }
    if ("toDataURL" in source) {
      return source.toDataURL(type, quality);
    } else if (source instanceof OffscreenCanvas) {
      const blob = await source.convertToBlob({ type, quality });
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          resolve(reader.result as string);
        };
        reader.onerror = () => {
          reject(new Error("Blob conversion failed."));
        };
        reader.readAsDataURL(blob);
      });
    }
    const canvas = document.createElement("canvas");
    canvas.width = source.width;
    canvas.height = source.height;
    const ctx = canvas.getContext("2d")!;
    if (source instanceof ImageData) {
      ctx.putImageData(source, 0, 0);
    } else {
      ctx.drawImage(source, 0, 0);
    }
    return canvas.toDataURL(type, quality);
  },
  isTextWithinBoundsAsync(
    text: string,
    maxWidth: string,
    font: string | PimcoMaskSubstitutionTypeDefintion,
    ownerTag?: string
  ) {
    return isTextWithinBounds(text, maxWidth, font, true, ownerTag) as Promise<boolean>;
  },
  isTextWithinBounds(
    text: string,
    maxWidth: string,
    font: string | PimcoMaskSubstitutionTypeDefintion,
    ownerTag?: string
  ) {
    return isTextWithinBounds(text, maxWidth, font, false, ownerTag) as boolean;
  },
  createWorkerSuite<P = any, R = any>(worker: Worker): WorkerSuite<P, R> {
    let postID = 0;
    let callbacks: Map<number, { resolve: (...args: any[]) => void; reject: (...args: any[]) => void }> = new Map();
    worker.addEventListener("message", (event) => {
      const { $id, payload, error } = event.data;
      if (!callbacks.has($id)) {
        return;
      }
      const { resolve, reject } = callbacks.get($id)!;
      callbacks.delete($id);
      if (error) {
        reject(error);
      } else {
        resolve(payload);
      }
    });
    worker.addEventListener("error", (event) => {
      console.error("Worker error:", event);
    });
    worker.addEventListener("messagerror", (event) => {
      console.error("Worker message error:", event);
    });
    return {
      post(payload: any, transfer: Transferable[] = []) {
        postID++;
        return new Promise<any>((resolve, reject) => {
          callbacks.set(postID, { resolve, reject });
          worker.postMessage({ payload, $id: postID }, transfer);
        });
      },
      terminate() {
        worker.terminate();
      },
    };
  },
  toThrottled<T, A extends any[], R>(callback: (this: T, ...args: A) => R, delay: number): (...args: A) => Promise<R> {
    let lastCalled = Date.now();
    let timerId: any = -1;
    const throttled = function (this: T, ...args: A) {
      return new Promise<R>((res) => {
        // Clear the timer if it's set, this way
        // we will only call the callback on the
        // most recent request
        if (timerId !== -1) {
          clearTimeout(timerId);
        }
        const now = Date.now();
        const diff = delay - (now - lastCalled);
        if (diff <= 0) {
          // The delay has passed, just call the callback
          lastCalled = now;
          timerId = -1;
          res(callback.apply(this, args));
        } else {
          // We still have more time to wait
          timerId = setTimeout(() => {
            lastCalled = Date.now();
            timerId = -1;
            res(callback.apply(this, args));
          }, diff);
        }
      });
    };
    return throttled;
  },
  getScrollAlpha(element: Element) {
    const x =
      element.scrollWidth > element.clientWidth ? element.scrollLeft / (element.scrollWidth - element.clientWidth) : 0;

    const y =
      element.scrollHeight > element.clientHeight
        ? element.scrollTop / (element.scrollHeight - element.clientHeight)
        : 0;

    return { x: Math.min(Math.max(x, 0), 1), y: Math.min(Math.max(y, 0), 1) };
  },
  packBitsToString(values: Record<string, number>, structure: Record<string, number>) {
    const MAX_CHUNK_BITS = 6; // Process bits in chunks.
    const MAX_BIT_MASK = (1 << MAX_CHUNK_BITS) - 1;
    const NEW_BASE = 32;
    let packedParts: string[] = []; // To hold each encoded character.
    let currentChunk = 0; // Current 5-bit chunk as a .
    let currentShift = 0; // Current bit position within the chunk.

    for (const [key, bits] of Object.entries(structure)) {
      const maxVal = (1 << bits) - 1; // Maximum value that fits in the specified bits.
      if (values[key] > maxVal) {
        throw new Error(`Value for ${key} exceeds the maximum allowed for ${bits} bits.`);
      }

      let value = values[key];

      // Shift the bits on the 'currentChunk' by the 'bits' value and place the 'value' on the end
      currentChunk = currentChunk << bits;
      currentChunk |= value;
      currentShift += bits;

      while (currentShift >= MAX_CHUNK_BITS) {
        const maskShift = currentShift - MAX_CHUNK_BITS;
        const mask = MAX_BIT_MASK << maskShift;
        const invertedMask = (1 << maskShift) - 1;
        const packMe = (currentChunk & mask) >> maskShift;
        currentChunk &= invertedMask;
        currentShift = maskShift;
        // Push the new packable bits onto 'packedParts'
        packedParts.push(base64Encode(Number(packMe)));
      }
    }

    if (currentShift > 0) {
      const finalShift = MAX_CHUNK_BITS - currentShift;
      currentChunk = currentChunk << finalShift;
      packedParts.push(currentChunk.toString(NEW_BASE));
    }

    return packedParts.join("");
  },
  unpackBitsFromString(encoded: string, structure: Record<string, number>) {
    const MAX_CHUNK_BITS = 6; // Process bits in chunks.
    const packedParts = Array.from(encoded);
    const result: Record<string, number> = {};
    let bitStream = 0;
    let bitCount = 0;
    for (const [key, bits] of Object.entries(structure)) {
      // The number of bits we need is 'bits', so if the 'bitCount' isn't
      // high enough, we need to shift an encoded character and add it to
      // the bit stream, until we do have enough characters
      while (bitCount < bits) {
        // Pull the next encoded character, decode it and add it to the bit stream
        const char = packedParts.shift() || "0";
        const numValue = base64Decode(char);
        if (isNaN(numValue)) {
          throw new Error(`Invalid encoded character: ${char} at position ${encoded.length - packedParts.length}`);
        }
        const value = numValue;
        bitCount += MAX_CHUNK_BITS;
        bitStream = bitStream << MAX_CHUNK_BITS;
        bitStream |= value;
      }
      // Now create a mask to extract the desired bits
      const maskShift = bitCount - bits;
      const mask = ((1 << bits) - 1) << maskShift;
      const desiredValue = (bitStream & mask) >> maskShift;
      // Remove the extracted bits from the stream
      bitStream &= (1 << maskShift) - 1;
      bitCount = maskShift;
      // Add the value to the result
      result[key] = Number(desiredValue);
    }

    return result;
  },
  isSelectable(object: { type: string; id: string }) {
    const unselectableTypes = ["ComplexSwatchLabelOption"];
    return !unselectableTypes.includes(object.type);
  },
  async parseMetaData(metadata: string) {
    if (metadata) {
      // Meta data is formatted as CurrentKey:OtherKey1,OtherKey2,...
      const [currentKeyIndex, ...keys] =
        metadata
          .split(":")
          .map((item) =>
            item
              .trim()
              .split(",")
              .map((x) => x.trim())
          )
          .flat() || [];
      const useableKeys = await Promise.all(
        keys.map((key) => {
          return key.startsWith("file|") ? Promise.resolve(true) : uploaded.hasBlob(key);
        })
      );
      return {
        currentKey: Number(currentKeyIndex || -1),
        keys: keys.filter((_, i) => useableKeys[i]) || [],
      };
    }
    return {
      currentKey: -1,
      keys: [],
    };
  },
  parseMetaDataSync(metadata: string) {
    if (metadata) {
      // Meta data is formatted as CurrentKey:OtherKey1,OtherKey2,...
      const [currentKeyIndex, ...keys] =
        metadata
          .split(":")
          .map((item) =>
            item
              .trim()
              .split(",")
              .map((x) => x.trim())
          )
          .flat() || [];
      return {
        currentKey: Number(currentKeyIndex || -1),
        keys: keys.filter(Boolean),
      };
    }
    return {
      currentKey: -1,
      keys: [],
    };
  },
  imageKeyToFilename(key: string): string {
    if (!key) {
      return "";
    }
    if (key.startsWith("file|")) {
      key = key.split("|")[1];
    }
    return `${
      location.origin == "https://nokona.com" ? "" : "https://nokona.com"
    }/wp-content/uploads/configurator-images/custom-uploads/ccu-${key}.webp`;
  },
  async urlFromImageKey(key: string, registrar: string): Promise<string> {
    if (!key) {
      return "";
    }
    if (key.startsWith("file|")) {
      return this.imageKeyToFilename(key);
    }
    const url = await uploaded.getBlobUrl(key, registrar);
    if (url) {
      return url;
    }
    return "";
  },
  urlFromImageKeySync(key: string, registrar: string): string {
    if (!key) {
      return "";
    }
    if (key.startsWith("file|")) {
      return this.imageKeyToFilename(key);
    }
    const url = uploaded.getBlobUrlSync(key, registrar);
    if (url) {
      return url;
    }
    return "";
  },
};
export default utils;

window["deserializeSobj"] = deserializeSobj;

function isTextWithinBounds(
  text: string,
  maxWidth: string,
  font: string | PimcoMaskSubstitutionTypeDefintion,
  asPromise?: boolean,
  ownerTag?: string
): boolean | Promise<boolean> {
  let relativeTextMeasureService =
    window["__relativeTextMeasureService"] ||
    (document.getElementById("relative-text-measure-service") as HTMLElement | null);
  // Initialize the service if it hasn't been already
  text = text.replace(/[\s\n\r\t]/g, "&nbsp;");
  if (!relativeTextMeasureService) {
    relativeTextMeasureService = document.createElement("span");
    relativeTextMeasureService.id = "relative-text-measure-service";
    relativeTextMeasureService.style.position = "absolute";
    relativeTextMeasureService.style.visibility = "hidden";
    relativeTextMeasureService.style.whiteSpace = "nowrap";
    relativeTextMeasureService.style.width = "auto";
    relativeTextMeasureService.style.height = "auto";
    relativeTextMeasureService.style.top = "-9999px";
    relativeTextMeasureService.style.left = "-9999px";
    relativeTextMeasureService.style.setProperty("font-size", "100px", "important");
    document.body.appendChild(relativeTextMeasureService);
  }
  if (typeof font == "string") {
    relativeTextMeasureService.style.font = font;
  } else if (typeof font == "object") {
    relativeTextMeasureService.style.fontFamily = font.fontfamily || "";
    relativeTextMeasureService.style.fontWeight = font.fontweight?.toString() || "";
    relativeTextMeasureService.style.lineHeight = font.lineheight?.toString() || "";
    relativeTextMeasureService.style.letterSpacing = font.letterspacing?.toString() || "";
  }
  relativeTextMeasureService.dataset.tag = ownerTag || "";
  // Set the text
  relativeTextMeasureService.innerHTML = text;
  if (asPromise) {
    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        // Measure the text
        const rect = relativeTextMeasureService.getBoundingClientRect();
        // Check if the text is within bounds
        const maxWidthNum = parseFloat(maxWidth.replace("em", "")) * 100;
        // Return a boolean to indicate if the text is within bounds
        resolve(rect.width <= maxWidthNum);
      });
    });
  } else {
    // Measure the text
    const rect = relativeTextMeasureService.getBoundingClientRect();
    // Check if the text is within bounds
    const maxWidthNum = parseFloat(maxWidth.replace("em", "")) * 100;
    // Return a boolean to indicate if the text is within bounds
    return rect.width <= maxWidthNum;
  }
}
// Select the text of a given element
function selectText(node: HTMLElement) {
  if ((document.body as any).createTextRange) {
    const range = (document.body as any).createTextRange();
    range.moveToElementText(node);
    range.select();
  } else if (window.getSelection) {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(node);
    if (selection) {
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }
}
// Clear any text selection on the DOM
function clearSelection() {
  if (window.getSelection) {
    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
    }
  } else if ((document as any).selection && (document as any).selection.empty) {
    (document as any).selection.empty();
  }
}
type TimedLoopControls = {
  stop: Function;
};
function TLRecursionCall(callback: (index: number) => void, timeout: number, limit: number, i: number, data: any) {
  if (data.stop) {
    return;
  }
  callback(i);
  if (i + 1 < limit) {
    setTimeout(() => TLRecursionCall(callback, timeout, limit, i + 1, data), timeout);
  }
}

function deepObjectExtend_RECURSE(path: string[], objOrVal: any, firstObj: object) {
  if (objOrVal instanceof Object) {
    for (const key in objOrVal) {
      if (Object.prototype.hasOwnProperty.call(objOrVal, key)) {
        const val = objOrVal[key];
        deepObjectExtend_RECURSE([...path, key], val, firstObj);
      }
    }
  } else {
    utils.setNested(firstObj, objOrVal, path, true);
  }
}

interface ScrollPosition {
  left: number;
  top: number;
}

function getScrollPosition(element: Element, container: Element | typeof window) {
  const eRect = element.getBoundingClientRect();
  if (container instanceof Element) {
    const cRect = container.getBoundingClientRect();
    return {
      left: eRect.left - cRect.left + container.scrollLeft,
      top: eRect.top - cRect.top + container.scrollTop,
    };
  } else {
    return {
      left: eRect.left + container.scrollX,
      top: eRect.top + container.scrollY,
    };
  }
}
function fillScrollPosition(value: ScrollPosition) {
  if (!("left" in value)) {
    return Object.assign({ left: 0 }, value);
  } else if (!("top" in value)) {
    return Object.assign({ top: 0 }, value);
  } else {
    return value;
  }
}

function getConfiguratorObject<T extends ConfiguratorObject = ConfiguratorObject>(id: string): T | null {
  if ("getObjectIDMap" in window) {
    const objectIDMap = (window as any).getObjectIDMap();
    return (objectIDMap[id] as any) || null;
  } else {
    console.warn("Object ID map not available yet for global access.");
  }
  return null;
}

const BASE_64_ENCODING_TABLE = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_~".split(
  ""
) as any as FixedSizeArray<string, 64>;
const BASE_64_DECODING_TABLE = BASE_64_ENCODING_TABLE.reduce((acc, val, i) => {
  acc[val] = i;
  return acc;
}, {} as Record<string, number>);

function base64Encode(num: number) {
  if (num < 0) {
    throw new Error("Cannot encode negative numbers.");
  }
  let encoding = "";
  while (num > 0) {
    encoding = BASE_64_ENCODING_TABLE[num & 63] + encoding;
    num = num >> 6;
  }
  return encoding || "0";
}
function base64Decode(encoding: string) {
  let num = 0;
  for (let i = 0; i < encoding.length; i++) {
    if (!(encoding[i] in BASE_64_DECODING_TABLE)) {
      throw new Error("Invalid base64 encoding.");
    }
    num = (num << 6) | BASE_64_DECODING_TABLE[encoding[i]];
  }
  return num;
}

const fixedRoutines = {
  remap(this: { subject: Array<string | number>; fetchValue: (b: string) => string }, expresssion: string) {
    return this.subject.map((x) => {
      let result = expresssion.replaceAll("$1", x + "");
      const [match, branchID] = result.match(/\$value:(brc\w\d+)/) || [];
      if (match && branchID) {
        result = result.replaceAll(match, this.fetchValue(branchID));
      }
      return result;
    });
  },
};
