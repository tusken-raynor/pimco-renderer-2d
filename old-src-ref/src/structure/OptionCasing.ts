import { ConfiguratorObject, Option, ProductImageContributer } from "@/types";
import structure from "@/structure";
import utils from "@/utils";

type ValueChangeCallback = (newValue: Option | null) => void;

// OptionCasing sits at the end of each option branch
// in the selected options structure to wrap around
// the selected value and provide important data that
// applies to any option value that might become the
// value in that branch.

export class OptionCasing<Value extends Option | null = Option | null> {
  branchID: string;
  value: Value | null;
  valueLiteral: Option | null | undefined;
  order: number;
  parent?: string;
  userInteraction: boolean;
  required: boolean;
  noRequirement: boolean;
  woocommerceName: string;
  woocommerceProduct: string;
  hide: boolean;
  defaultValue: string | null;
  pimcoContributions: Array<{
    pimco: string;
    contributer: ProductImageContributer;
  }>;
  activeContributerReleaser: Function | null;
  allowedValues: Set<string>;
  valueChangeCallbacks: {
    permanent: Array<ValueChangeCallback>;
    once: Array<ValueChangeCallback>;
  };
  storageMode: "all" | "none" | "value" | "interaction";
  enableSyncing: boolean;
  meta: Record<string, any>;
  ["x-data"]?: { 
    id: string; 
    disabled: boolean; 
    attributes: [{ id: string }]; 
    virtual?: string; 
    virtualOrder?: number; 
    templated?: boolean; 
    virtualGroup?: string[];
  };

  static getValuePersistance(casing: OptionCasing, objectMap: Record<string, ConfiguratorObject>) {
    const parentID = casing.parent;
    if (parentID && parentID in objectMap) {
      const object = objectMap[parentID];
      if (object) {
        if ('options' in object && object.options && 'options' in object.options) {
          return !!object.options.persist;
        } else if ('suboptions' in object && object.suboptions) {
          return !!object.suboptions.persist;
        }
      }
    }
    return false;
  }

  constructor(
    branchID: string,
    value: Value,
    setter: SetterFunction,
    certify: CertifierFunction,
    order: number,
    parent?: string,
    store: boolean | "value" | "interaction" = true,
    pimcoContributions?: Array<{
      pimco: string;
      contributer: ProductImageContributer;
    }>,
    userInteraction?: boolean,
    required?: boolean,
    noRequirement?: boolean,
    woocommerceName?: string,
    woocommerceProduct?: string
  ) {
    // This is the unique ID for the branch(Each option casing being the end of it's own branch)
    // The value is dependant on the name of each key in the path and will be consistent unless
    // one of those keys gets changed, then the contributions can be released
    this.branchID = branchID;
    // This indicates the numberic order of each option casing within it's relative attribute structure
    this.order = order;
    // This property is used to determine if this selection branch has recieved interaction by the user
    this.userInteraction =
      userInteraction === undefined ? false : userInteraction;
    // Indicates if this particular selection branch is required to be filled before checkout
    this.required = required === undefined ? true : required;
    // Indicates if the parent attribute is required or not, which determines the requirement of all
    // the option cases under that attribute
    this.noRequirement = noRequirement === undefined ? false : noRequirement;
    // The woocommerce addon name associated with the selection branch
    this.woocommerceName = woocommerceName === undefined ? "" : woocommerceName;
    // The woocommerce product id if the selection in this app represents a unique product as
    // opposed to it representing an addon within the main product
    this.woocommerceProduct =
      woocommerceProduct === undefined ? "" : woocommerceProduct;
    // A list of all pimcos that this selection branch contributes to and the data that it contributes
    this.pimcoContributions = pimcoContributions || [];
    // Always remember what the default value was
    this.defaultValue = value !== null ? value.id : null;
    // This property can only be set to true by funtionality in the app. It is used to completely hide
    // the selections branch from the scope of the user, completion menu, and the checkout menu.
    this.hide = false;
    // The ID of the attribute/option that list the options available to fill the value in the selection branch
    if (parent) {
      this.parent = parent;
    }
    // Keep track of the values that are allowed to be applied to the option casing
    this.allowedValues = new Set();
    if (value) {
      // Always allow the default value to be applied
      this.allowedValues.add(value.id);
    }
    // Store the contributer objects that are active for this option casing so that they can
    // be disabled when a new value is selected.
    this.activeContributerReleaser = null;

    // Hold callback functions that need to be called when the value is changed
    this.valueChangeCallbacks = {
      permanent: [],
      once: [],
    };

    this.meta = {};

    this.storageMode =
      store === false ? "none" : store === true ? "all" : store;

    this.enableSyncing = true;

    // Now set the special getter/setter for the value property
    Object.defineProperty(this, "value", {
      get() {
        return this.valueLiteral || null;
      },
      set(value: Option | null) {
        // Make sure the value is legal and not restricted
        if (
          (value === null ||
            (this.allowedValues.has(value.id) &&
              certify(value, this.getPath()))) &&
          value !== this.valueLiteral
        ) {
          // Release the current active contributions in prep for the new ones
          if (this.activeContributerReleaser) {
            this.activeContributerReleaser();
            this.activeContributerReleaser = null;
          }
          // The setter function is a callback from mutations handles assignments
          // when an option gets selected, like restrictions, pimcos, etc.
          const attributes = this["x-data"]
            ? [
                ...(this["x-data"].attributes || []),
                {
                  id: this["x-data"].id,
                  disabled: this["x-data"].disabled,
                },
              ]
            : [];
          setter(
            value,
            this.valueLiteral,
            this.pimcoContributions.map((x: any) => ({
              pimco: x.pimco,
              contributer: Object.assign(
                {
                  "x-data": {
                    attributes,
                  },
                },
                x.contributer
              ),
            })),
            (releaser) => {
              this.activeContributerReleaser = releaser;
            },
            this
          );
          // Check if there are any callbacks that want to know if the value changed
          if (
            this.valueChangeCallbacks.once.length ||
            this.valueChangeCallbacks.permanent.length
          ) {
            for (
              let i = 0;
              i < this.valueChangeCallbacks.permanent.length;
              i++
            ) {
              const callback = this.valueChangeCallbacks.permanent[i];
              callback(value);
            }
            while (this.valueChangeCallbacks.once.length) {
              const callback = this.valueChangeCallbacks.once.shift();
              callback(value);
            }
          }
          // Now actually set the value
          this.valueLiteral = value;

          // We have to grab this function asyncronously from the window so
          // as to not break the code sequence
          const getSyncBranches = (window as any).getSyncBranches;
          if (getSyncBranches && this.enableSyncing) {
            // If we have any branches that want to mimic our value, humor them
            const branches = getSyncBranches(this.branchID).map(
              structure.branch
            );
            if (branches.length) {
              branches.forEach((branch: OptionCasing | undefined) => {
                if (branch && branch.value !== value) {
                  if (value && branch.allowedValues.has(value.id)) {
                    // Do this if the new value is allowed on this branch
                    branch.value = value;
                  } else if (!value && branch.required && branch.defaultValue) {
                    // Find a way to get the option object
                    const option = structure.getObject(branch.defaultValue);
                    // Disable syncing so that if it's two way, we won't immediately undo our selection
                    // This is a temporary fix
                    branch.enableSyncing = false;
                    branch.value = option;
                    branch.enableSyncing = true;
                  } else {
                    branch.value = value;
                  }
                }
              });
            }
          }
        }
      },
    });
    this.value = value === undefined ? null : (value as any);
  }
  previous<T extends Option | null = Option | null>(): OptionCasing<T> | null {
    return null;
  }
  next<T extends Option | null = Option | null>(): OptionCasing<T> | null {
    return null;
  }
  getPath(): Array<string> {
    return [];
  }
  addAllowedValue(allowed: Option | string | Array<Option | string>) {
    if (!(allowed instanceof Array)) {
      allowed = [allowed];
    }
    const fAllowed = allowed.map((opt) => {
      return opt instanceof Object ? opt.id : opt;
    });
    for (let i = 0; i < fAllowed.length; i++) {
      const allowedID = fAllowed[i] as string;
      this.allowedValues.add(allowedID);
    }
  }
  onValueChange(callback: ValueChangeCallback, permanent = false) {
    if (permanent) {
      this.valueChangeCallbacks.permanent.push(callback);
    } else {
      this.valueChangeCallbacks.once.push(callback);
    }
  }
  addPimcoContributions(
    contributions: Array<{
      pimco: string;
      contributer: ProductImageContributer;
    }>
  ) {
    for (let i = 0; i < contributions.length; i++) {
      const contribution = contributions[i];
      const partners = this.pimcoContributions.filter(
        (c) => c.pimco == contribution.pimco
      );
      if (partners.length) {
        for (let j = 0; j < partners.length; j++) {
          const partner = partners[j];
          if (partner.contributer !== contribution.contributer) {
            this.pimcoContributions.push(contribution);
          }
        }
      } else {
        this.pimcoContributions.push(contribution);
      }
    }
  }
  setDefault(option: Value, setValue = false) {
    this.defaultValue = option !== null ? option.id : null;
    if (setValue) {
      this.value = option;
    }
  }
  setMetaData(value: Record<string, any>, override?: boolean): void;
  setMetaData(key: string, value: any): void;
  setMetaData(keyOrObject: string | Record<string, any>, valueOrOverride?: any) {
    if (typeof keyOrObject === "string") {
      this.meta[keyOrObject] = valueOrOverride;
    } else {
      this.meta = Object.assign(valueOrOverride ? {} : this.meta, keyOrObject);
    }
    if (typeof (window as any).__store_dispatch_storeData__ === "function") {
      (window as any).__store_dispatch_storeData__();
    }
  }
  removeMetaData(key: string) {
    delete this.meta[key];
    if (typeof (window as any).__store_dispatch_storeData__ === "function") {
      (window as any).__store_dispatch_storeData__();
    }
  }
  getMetaData(key: string): any;
  getMetaData(key: string, ...otherKeys: string[]): any;
  getMetaData(...keys: string[]): any {
    return this.meta[keys.find((k) => k in this.meta) || ''];
  }
  clone(newPath: string[]): OptionCasing<Value | null> {
    const branchID = 'brc' + utils.generateHash(newPath.join());
    const clone = shallowClone<OptionCasing<Value | null>>(this);
    clone.branchID = branchID;
    clone.getPath = () => newPath;
    clone.previous = () => null;
    clone.next = () => null;
    clone.value = clone.defaultValue
      ? structure.getObject(clone.defaultValue)
      : null;
    clone.meta = {};
    clone.userInteraction = false;
    clone.activeContributerReleaser = null;
    clone.valueChangeCallbacks.once = [];
    clone.valueChangeCallbacks.permanent = [];
    if (clone["x-data"]) {
      clone["x-data"] = utils.deepObjectExtend({} as any, clone["x-data"]);
    }

    return clone;
  }
}

function shallowClone<T extends object>(instance: T): T {
  return Object.create(
    Object.getPrototypeOf(instance),
    Object.getOwnPropertyDescriptors(instance)
  );
}

export type SetterFunction = (
  value: Option | null,
  oldValue: Option | null,
  contributions: Array<{
    pimco: string;
    contributer: ProductImageContributer;
  }>,
  releaseSetter: (releaser: Function) => void,
  branch?: string
) => void;

export type CertifierFunction = (
  value: Option | null,
  path: Array<string>
) => boolean;
