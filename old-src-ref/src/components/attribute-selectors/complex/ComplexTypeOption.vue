<template>
  <div
    v-if="option"
    :class="['complex-type-option', { selected: selected == option }]"
  >
    <div class="type-selector" v-html="optionName" @click="select"></div>
    <div
      v-if="selected == option && option.texttype != 'none'"
      class="type-input"
    >
      <input
        type="text"
        :name="optionName"
        :placeholder="optionPlaceholder"
        v-model="text"
      />
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, Ref } from "vue";
import { ComplexTypeOption, ProductImageContributer } from "@/types";
import { mapActions, mapGetters, mapMutations, mapState } from "vuex";
import utils from "@/utils";
import { OptionCasing } from "@/structure";

export default defineComponent({
  name: "ComplexTextOption",
  props: {
    option: Object as () => ComplexTypeOption,
    selected: Object as () => ComplexTypeOption | null,
    select: Function,
    subAttribute: String,
    subOptionName: String,
    onUnselected: Function,
  },
  computed: {
    ...mapState(["objectIDMap", "currentProduct", "selectedOptions"]),
    ...mapGetters({
      attribute: "getAttribute",
      restrictions: "getRestrictions",
      enablers: "getIndexedEnablers",
    }),
    optionName() {
      if (this.option) {
        return (this as any).option.nickname || (this as any).option.name;
      }
      return "";
    },
    optionPlaceholder() {
      if (this.option) {
        return (this as any).option.placeholder;
      }
      return null;
    },
    selectedOptionCasing(): OptionCasing | null {
      if (
        this.currentProduct &&
        this.attribute &&
        this.subAttribute &&
        this.selectedOptions
      ) {
        return (
          utils.getNested(this.selectedOptions, [
            this.currentProduct,
            "selections",
            this.attribute.name,
            this.subAttribute,
            this.optionName,
          ]) || null
        );
      }
      return null;
    },
  },
  data() {
    return {
      text: "",
      timerID: -1 as any,
      valueEffect: true,
    };
  },
  methods: {
    ...mapMutations(["addProductImageContributer"]),
    ...mapActions(["storeData"]),
    saveValue() {
      // Save the value to the store
      if (this.option) {
        this.option.text = this.text;
        requestAnimationFrame(this.storeData);
      }
    },
    transferValue(previous: ComplexTypeOption, next: ComplexTypeOption) {
      if (previous.text) {
        next.text = previous.text;
        delete previous.text;
      }
    },
    addPimco() {
      // So this is one of the only places that we access the state
      // object directly instead of using mutations and this is so
      // that we can remove specific objects from the store by
      // reference.

      // Grab the pimcos and filter out the non-relevent ones
      const option = this.option;
      if (option?.pimco) {
        const pimcos = utils.mapObject(
          utils.filterObject(option.pimco, (pimco: ProductImageContributer) => {
            if (pimco.frames) {
              for (let i = 0; i < pimco.frames.length; i++) {
                const frame = pimco.frames[i];
                if (frame?.mask instanceof Object) {
                  return true;
                }
              }
            }
            return false;
          }),
          (pimco) => {
            const frames = pimco.frames!.map((frame) => {
              if (!frame) {
                return null;
              }
              if (frame.mask instanceof Object) {
                return utils.deepObjectExtend({}, frame, {
                  mask: utils.deepObjectExtend({}, frame.mask, {
                    content: this.text.trim(),
                  }),
                });
              } else {
                return frame;
              }
            });
            return utils.deepObjectExtend({}, pimco, {
              frames,
              priority: (pimco.priority || 1) + 0.1,
            });
          }
        );
        if (this.removeContributers) {
          this.removeContributers();
          this.removeContributers = null;
        }
        const pimcoKeys = Object.keys(pimcos);
        if (pimcoKeys.length) {
          // build the new remover function
          this.removeContributers = () => {
            const gpic: {
              [key: string]: Array<ProductImageContributer>;
            } = this.$store.state.productImageContributions;

            if ("temppimco" in option) {
              delete option.temppimco;
            }
          };
          // console.log("adding stuff");
          // Now add them to the store
          for (let i = 0; i < pimcoKeys.length; i++) {
            const id = pimcoKeys[i];
            this.addProductImageContributer({
              pimco: id,
              contributer: pimcos[id],
            });
          }
        }
      }
    },
  },
  watch: {
    text(value: string) {
      let revised = false;
      const rules = {
        number: (v: string) => v.replace(/[^\d]/g, ""),
        uppercase: (v: string) => v.toUpperCase(),
        alpha: (v: string) => v.replace(/[^[A-z]\d]/g, ""),
      };
      const typeRules = this.option?.texttype
        ? Array.isArray(this.option.texttype)
          ? this.option.texttype
          : [this.option.texttype]
        : [];
      const func = typeRules.length
        ? (val: string) =>
            typeRules.reduce(
              (v, rule) => (rule in rules ? rules[rule](v) : v),
              val
            )
        : (v: string) => v;
      const changedVal = func(value).replace(
        /[^!@#$&*.,:;"'+=_\-\/~?\w\s]/g,
        ""
      );
      if (changedVal != value) {
        // Block the oimco text value from being added if there are weird characters in it
        this.text = changedVal;
        revised = true;
      }
      if (
        typeof (this as any).option.maxlength == "number" &&
        value.length > (this as any).option.maxlength
      ) {
        this.text = value.slice(0, (this as any).option.maxlength);
        revised = true;
      }
      if (!revised) {
        if (this.timerID > -1) {
          clearTimeout(this.timerID);
          this.timerID = -1;
        }
        this.timerID = setTimeout(() => {
          if (this.valueEffect) {
            this.addPimco();
            this.saveValue();
          }
          this.timerID = -1;
        }, 500);
      }
    },
  },
  setup() {
    const list: Ref<HTMLElement | null> = ref(null);
    const removeContributers: Ref<Function | null> = ref(null);
    return { list, removeContributers };
  },
  mounted() {
    setTimeout(() => {
      if (this.onUnselected) {
        const oldSelection = this.option!;
        // console.log("SET THE UNSELECTION", oldSelection);
        const vueThis = this;
        this.onUnselected((newSelection: ComplexTypeOption | null) => {
          // if (this.selected == oldSelection) {
          //   // console.log("UNSELECTION:", oldSelection?.text);
          //   if (!newSelection || newSelection.type !== "ComplexTypeOption") {
          //     if (oldSelection) {
          //       delete oldSelection.text;
          //     }
          //   } else if (
          //     oldSelection?.text &&
          //     newSelection.type == "ComplexTypeOption"
          //   ) {
          //     newSelection.text = oldSelection.text;
          //     // oldSelection.text = "";
          //   }
          //   // console.log("REMOVING FUNCTION:", this.removeContributers);
          //   if (this.removeContributers) {
          //     this.removeContributers();
          //   }
          // }
          if (vueThis.removeContributers) {
            vueThis.removeContributers();
          }
          oldSelection.text = "";
          vueThis.text = "";
          if (newSelection) {
            newSelection.text = "";
          }
        }, true);
      }
      if (this.list) {
        utils.scrollPresent(this.list, 10, 200);
      }
    }, 100);
    if (this.option?.text) {
      this.text = this.option.text;
    } else if (this.option) {
      this.option.text = "";
    }
    requestAnimationFrame(() => {
      if (this.option) {
        if (this.option.default && !this.text) {
          this.text = this.option.default;
        }
        // Add an accessor property to use text data property as a proxy
        // delete this.option.text;
        // const vueThis = this;
        // Object.defineProperty(this.option, "text", {
        //   get() {
        //     return vueThis.text;
        //   },
        //   set(val) {
        //     vueThis.text = val;
        //   },
        //   configurable: true,
        // });
      }
    });
  },
  beforeUnmount() {
    // Remove the accessor property from the option and just set the normal property.
    if (this.option) {
      this.valueEffect = false;
      delete this.option.text;
      if (this.text) {
        this.option.text = this.text;
      } else {
        this.option.text = "";
      }
    }
  },
});
</script>

<style lang="scss" scoped>
.complex-type-option {
  display: contents;
}
.type-selector {
  font: 600 21px/120% $fnt-cm;
  letter-spacing: -0.025em;
  display: flex;
  align-items: center;
  gap: 5px;
  margin-left: 23px;
  position: relative;
  top: 2px;
  cursor: pointer;
  align-self: center;
  user-select: none;

  .single-child .selected > & {
    display: none;
  }

  &::before {
    content: "";
    box-sizing: border-box;
    width: 20px;
    height: 20px;
    border: 1px solid #707070;
    background-color: #fff;
    border-radius: 50%;
    transition: background-color 0.2s;
    position: relative;
    top: -2px;
  }
  &::after {
    content: "";
    position: absolute;
    top: calc(50% - 2px);
    left: 3px;
    width: 14px;
    height: 14px;
    background-color: $orange;
    border-radius: 50%;
    transform: translateY(-50%) scale(0);
    transition: transform 0.2s;
    .complex-type-option.selected & {
      transform: translateY(-50%) scale(1);
    }
  }
}
.type-input {
  order: 10;
  align-self: center;
  margin-left: 23px;
  background-color: #fff;
  text-align: center;

  .single-child .selected > & {
    @media (max-width: $small-width) {
      width: 100%;
      margin-left: 0;
    }
  }

  input {
    padding: 16px 20px 12px;
    width: 135px;
    box-sizing: border-box;
    margin: 0 auto;
    font: 300 16px/100% $fnt-cm;
    border: 1px solid #000;
    transition: width 0.2s ease;
    &::placeholder {
      color: #000;
      text-align: center;
      transition: color 0.08s;
    }
    &:focus::placeholder {
      color: #0000;
    }

    .single-child .selected > & {
      width: 250px;
    }
  }
}
</style>