import data from "@/data";
import state from "@/store/state";

let ID_MAP: { [key: string]: string | number } = null as any;
let ADDON_MAPS: any = null;
let PRICE_MAP: { [key: string]: { price: number; regularPrice: number; name: string; variations?: { [key: string]: { price: number; regularPrice: number } } } } = null as any;
const callbacks: Array<Function> = [];

const PREFETCHED_ADDON_NAMES: Record<string, string[]> = {};

data.fetchWoocommerceData().then((data) => {
  ADDON_MAPS = data.addonMaps;
  ID_MAP = data.idMap;
  PRICE_MAP = data.priceMap || {};
  while (callbacks.length) {
    const callback = callbacks.shift();
    if (callback) {
      callback();
    }
  }
});

type WooOptionData = {
  charge?: number;
};

export default {
  dataLoaded() {
    return Boolean(ID_MAP && ADDON_MAPS && PRICE_MAP);
  },
  onDataLoaded(callback: Function) {
    if (ID_MAP && ADDON_MAPS && PRICE_MAP) {
      callback();
    } else {
      callbacks.push(callback);
    }
  },
  getProduct(id: string) {
    if (ADDON_MAPS && id in ADDON_MAPS || PRICE_MAP && id in PRICE_MAP) {
      return id;
    }
    if (ID_MAP) {
      return ID_MAP[id];
    }
    // Try and grab if from the Vue state
    if (state.currentProduct) {
      const product = state.products.find((p) => p.id === id);
      if (product && product.wooid) {
        return product.wooid;
      }
    }
    return "";
  },
  getProductPrice(id: string, variation?: string | number) {
    if (PRICE_MAP && ID_MAP) {
      const productId = this.getProduct(id);
      if (productId && productId in PRICE_MAP) {
        if (variation && PRICE_MAP[productId].variations && variation in PRICE_MAP[productId].variations) {
          return PRICE_MAP[productId].variations[variation].price || 0;
        }
        return PRICE_MAP[productId].price;
      }
    }
    // Try and grab if from the Vue state
    if (state.currentProduct) {
      const product = state.products.find((p) => p.id === id);
      if (product && product.wooid && product.baseprice !== undefined) {
        return product.baseprice;
      }
    }
    return 0;
  },
  getAddon(name: string, product: string) {
    if (ADDON_MAPS && ID_MAP) {
      const productID = product in ADDON_MAPS ? product : ID_MAP[product].toString();
      if (!name) {
        return "";
      }
      if (name.includes("$pid$")) {
        name = name.replaceAll("$pid$", productID);
      }
      // Attempt to get the addon names from the prefetch
      let names: string[] = [];
      if (productID in PREFETCHED_ADDON_NAMES) {
        names = PREFETCHED_ADDON_NAMES[productID];
      } else {
        const content = ADDON_MAPS?.[productID || ''];
        if (content) {
          names = Object.keys(content).sort((a, b) => {
            const lengthDiff = a.length - b.length;
            if (lengthDiff === 0) {
              return a.localeCompare(b);
            }
            return lengthDiff;
          });
          PREFETCHED_ADDON_NAMES[productID] = names;
        }
      }
      return names.find((n) => n.startsWith(name)) || "";
    }
    return "";
  },
  getOption(name: string, addon: string, product: string, mods: Record<string, string> = {}) {
    if (!ADDON_MAPS || !ID_MAP || !name || !addon) {
      return "";
    }
    const productID = product in ADDON_MAPS ? product : ID_MAP[product].toString();
    // Attempt to use a mod if it's available
    if (Object.values(mods).length) {
      name = applyModsToValue(name, mods);
    }
    if (addon.includes("$pid$")) {
      addon = addon.replaceAll("$pid$", productID);
    }
    const prod: any = ADDON_MAPS?.[productID || ''] || {};
    if (!(addon in prod)) {
      addon = this.getAddon(addon, productID);
    }
    const options: { [key: string]: WooOptionData } = prod[addon];
    if (options) {
      return (
        Object.keys(options)
          .sort((a, b) => a.length - b.length)
          .find((n) => n.startsWith(name)) || ""
      );
    }
    return "";
  },
  getOptionCharge(
    name: string,
    addon: string,
    product: string,
    mods: Record<string, string> = {}
  ) {
    if (!ADDON_MAPS || !ID_MAP || !name || !addon) {
      return 0;
    }
    const productID = product in ADDON_MAPS ? product : ID_MAP[product].toString();
    // Attempt to use a mod if it's available
    if (Object.values(mods).length) {
      name = applyModsToValue(name, mods);
    }
    if (addon.includes("$pid$")) {
      addon = addon.replaceAll("$pid$", productID);
    }
    const prod: any = ADDON_MAPS?.[productID || ''] || {};
    if (!(addon in prod)) {
      addon = this.getAddon(addon, productID);
    }
    const options: { [key: string]: WooOptionData } = prod[addon];
    if (options) {
      const keys = Object.keys(options);
      const index = keys
        .sort((a, b) => a.length - b.length)
        .findIndex((n) => n.startsWith(name));
      if (index > -1) {
        return options[keys[index]].charge || 0;
      }
    }
    return 0;
  },
  getModBranchIDs(wcvalue: string) {
    if (wcvalue.includes("$mod:brc")) {
      return Array.from(wcvalue.match(/\$mod:brc.+?\$/g) || []).map(x => x.slice(5, -1));
    }
    return [];
  },
  getProductName(id: string | number) {
    if (PRICE_MAP && ID_MAP) {
      const productId = this.getProduct(id.toString());
      if (productId && productId in PRICE_MAP) {
        return PRICE_MAP[productId].name || "";
      }
    }
    return "";
  }
};

function applyModsToValue(value: string, mods: Record<string, string>) {
  // First check if the value has any fallback mods which use the || operator
  const fallbacks = value.match(/\$mod:brc.+?\$\|\|\$mod:brc.+?\$/g);
  if (fallbacks) {
    for (let i = 0; i < fallbacks.length; i++) {
      const [mod1, mod2] = fallbacks[i].slice(5, -1).split("$||$mod:");
      value = value.replace(fallbacks[i], mods[mod1] || mods[mod2]);
    }
  }
  // Now handle the standard mods, if any remain
  const modsInValue = value.match(/\$mod:brc.+?\$/g);
  if (modsInValue) {
    for (let i = 0; i < modsInValue.length; i++) {
      value = value.replace(modsInValue[i], mods[modsInValue[i].slice(5, -1)] || "");
    }
  }
  return value;
}