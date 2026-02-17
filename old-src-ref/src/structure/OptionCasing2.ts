import { Attribute, Option, ProductImageContributer } from "@/types";
import structure from "@/structure";

type ValueChangeCallback = (newValue: Option | null) => void;

// OptionCasing sits at the end of each option branch
// in the selected options structure to wrap around
// the selected value and provide important data that
// applies to any option value that might become the
// value in that branch.

export class OptionCasing<Value extends Option | null = Option | null> {
  branchID: string;
  value: Value;
  // This stores the literal value for the accessor property 'value'
  valueLiteral: Option | null | undefined;
  // This order this branch falls within the branch group
  order: number;
  // The parent option holder that created this branch. This property only is useful if the branch
  // has only one potential parent, like with basic selectors
  parent: string;
  userInteraction: boolean;
  // If this individual branch alone does not require a value
  required: boolean;
  // This is true if the entire branch group is not required
  noRequirement: boolean;
  // This value will be set if a correlating woocommerce addon name was able to be generated
  woocommerceName: string;
  // This value will be set if a correlating woocommerce product id was specified, if set, and the
  // value of this branch is a boolean-true, the woocommerce product will be added to cart
  woocommerceProduct: string;
  // Hide from site of the configurator, but still affect the selections
  hide: boolean;
  // An index of product image component contributions
  pimcoContributions: Array<{
    pimco: string;
    contributer: ProductImageContributer;
  }>;
  // A list of all the option id's that the value is able to hold on option for
  //
  valueChangeCallbacks: {
    permanent: Array<ValueChangeCallback>;
    once: Array<ValueChangeCallback>;
  };
  enableSyncing: boolean;
  ["x-data"]?: { id: string; disabled: boolean; attributes: [{ id: string }] };
  constructor(
    branchID: string,
    value: Value,
    setter: SetterFunction,
    certify: CertifierFunction,
    order: number,
    parent: string,
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
    // This property can only be set to true by funtionality in the app. It is used to completely hide
    // the selections branch from the scope of the user, completion menu, and the checkout menu.
    this.hide = false;
    // The ID of the attribute/option that list the options available to fill the value in the selection branch
    this.parent = parent;

    // Hold callback functions that need to be called when the value is changed
    this.valueChangeCallbacks = {
      permanent: [],
      once: [],
    };

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
            this.pimcoContributions.map((c: object) =>
              Object.assign(
                {
                  "x-data": {
                    attributes,
                  },
                },
                c
              )
            ),
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
          // Remove the temporary contributions that were set on startup
          if (this.temporaryContributions.contributions.length) {
            if (this.temporaryContributions.sets > 0) {
              this.removeTemporaryContributions();
            }
            this.temporaryContributions.sets++;
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
                  const allowedValues = branch.getAllowedValues();
                  if (value && allowedValues.includes(value.id)) {
                    // Do this if the new value is allowed on this branch
                    branch.value = value;
                  } else if (!value && branch.required && branch.getDefault()) {
                    // Find a way to get the option object
                    const option = structure.getObject(branch.getDefault());
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
  /**
   * This will return the id of the specified default value of the current previous branches's
   * value's option holder data (mouthfull), or null
   */
  getDefault(): string | null {
    const prev = this.previous();
    if (prev) {
      if (prev.value) {
        return structure.getDefault(prev.value, true);
      }
    } else {
      // Get the attribute(parent) and use it's option holder
      const optionHolder = structure.getObject(this.parent);
      if (optionHolder) {
        return structure.getDefault(optionHolder, true);
      }
    }
    return null;
  }
  setDefault() {
    const id = this.getDefault();
    this.value = structure.getObject(id) || null;
  }
  /**
   * A list of all the option id's that the value is able to hold on option for
   */
  getAllowedValues(): string[] {
    const prev = this.previous();
    if (prev) {
      if (prev.value && "suboptions" in prev.value && prev.value.suboptions) {
        return prev.value.suboptions.options;
      }
    } else {
      // Get the attribute(parent) and use it's option holder
      const optionHolder = structure.getObject(this.parent) as Attribute;
      if (optionHolder && "options" in optionHolder && optionHolder.options) {
        if (optionHolder.options instanceof Array) {
          return optionHolder.options;
        } else {
          return optionHolder.options.options;
        }
      }
    }
    return [];
  }
  previous(): OptionCasing | null {
    // This linked list will be created when an instance is created
    return null;
  }
  next(): OptionCasing | null {
    // This linked list will be created when an instance is created
    return null;
  }
  getPath(): Array<string> {
    return [];
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
