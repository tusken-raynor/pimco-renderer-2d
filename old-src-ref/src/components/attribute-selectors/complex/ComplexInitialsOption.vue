<template>
  <div :class="['complex-option', 'complex-initials-option', { selected: selected == option }]">
    <div class="mode-graphic" @click="select">
      <BaseImage :data="option.graphic" />
    </div>
    <div class="initials-input">
      <input type="text" v-model="input" :maxlength="option.maxlength" :placeholder="option.placeholder" />
    </div>
  </div>
</template>

<script lang="ts">
import { OptionCasing } from "@/structure";
import { ComplexInitialsOption, ComplexOption, ProductImageContributer } from "@/types";
import utils from "@/utils";
import { defineComponent, ref, Ref } from "vue";
import { mapActions, mapGetters, mapMutations, mapState } from "vuex";
export default defineComponent({
  name: "ComplexInitialsOption",
  props: {
    option: Object as () => ComplexInitialsOption,
    select: Function,
    selected: Object as () => ComplexOption,
    onUnselected: Function,
    subAttribute: String,
    subOptionKey: String,
  },
  computed: {
    ...mapState(["currentProduct", "selectedOptions"]),
    ...mapGetters({ model: "getModel", attribute: "getAttribute" }),
    modelPatternName(): string {
      if (this.model?.imgname) {
        return this.model?.imgname;
      }
      return "";
    },
    optionCasing(): OptionCasing | null {
      if (this.currentProduct && this.attribute && this.subAttribute && this.subOptionKey && this.selectedOptions) {
        return utils.getNested(this.selectedOptions, [
          this.currentProduct,
          "selections",
          this.attribute.name,
          this.subAttribute,
          this.subOptionKey,
        ]);
      }
      return null;
    },
    pimcos(): { [pimco: string]: ProductImageContributer } {
      if (
        this.chars.length &&
        this.option?.pimcodata &&
        this.option.pimcodata.regionmap &&
        this.option.pimcodata.framenames &&
        this.option.pimcodata.imagepath &&
        this.modelPatternName
      ) {
        const scheme =
          this.option.pimcodata.imagepath +
          "$pattern$_$frame$_number_$comp$_$region$".replace("$pattern$", this.modelPatternName);
        let regionmap = this.option.pimcodata.regionmap;
        const framenames = this.option.pimcodata.framenames;
        if (this.option.mode == "numeric") {
          const regionmaps = regionmap instanceof Array ? regionmap : [regionmap];
          // Get the first and second numbers
          const firstChar = this.chars.substr(0, 1);
          const secondChar = this.chars.substr(1, 1);
          const imgComps = [firstChar];
          // If there's another number
          if (secondChar && regionmap.length > 1) {
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
          const name = this.chars.length > 1 ? "xx" : "x";
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
    },
  },
  methods: {
    ...mapMutations(["addProductImageContributer", "forceUpdateOrderedPimcos"]),
    ...mapActions(["storeData"]),
    setDefaultText() {
      if (this.option) {
        if (this.option.text) {
          this.input = this.option.text;
        } else if (this.option.default) {
          this.input = this.option.default;
        }
      }
    },
    storeDataTimer() {
      if (this.storeTimer !== undefined) {
        clearTimeout(this.storeTimer);
      }
      this.storeTimer = setTimeout(() => {
        this.storeData();
        this.storeTimer = undefined;
      }, 3000);
    },
    setOptionText(input: string) {
      if (input !== this.chars) {
        this.chars = input;
        if (this.option) {
          // Set the text property on the option object
          if (input) {
            this.option.text = input;
          } else {
            delete this.option.text;
          }
          this.forceUpdateOrderedPimcos();
          this.storeDataTimer();
        }
      }
    },
    removePimcoContributers(newValue: ComplexOption | null) {
      if (newValue == null && this.removeContributers) {
        this.removeContributers();
      }
      this.setOptionText("");
    },
  },
  setup() {
    const input: Ref<string> = ref("");
    const chars: Ref<string> = ref("");
    const removeContributers: Ref<Function | null> = ref(null);
    const storeTimer: Ref<any> = ref(undefined);
    return { input, chars, removeContributers, storeTimer };
  },
  watch: {
    input(val: string) {
      if (this.option?.mode == "numeric" && val.match(/[^\d]/)) {
        this.input = val.replace(/[^\d]/g, "");
      } else if (val.match(/[^\w]/)) {
        this.input = val.replace(/[^\w]/g, "");
      }
      if (this.input.match(/[a-z]/)) {
        this.input = this.input.toUpperCase();
      }
      this.setOptionText(this.input);
    },
    selected(val) {
      if (val && this.option !== val) {
        this.input = "";
      }
      if (val == this.option && this.onUnselected) {
        this.onUnselected(this.removePimcoContributers);
      }
    },
    pimcos(val) {
      // So this is one of the only places that we access the state
      // object directly instead of using mutations and this is so
      // that we can remove specific objects from the store by
      // reference.
      const option = this.option;
      if (this.removeContributers) {
        this.removeContributers();
        this.removeContributers = null;
      }
      const pimcos = Object.keys(val);
      if (pimcos.length) {
        // build the new remover function
        this.removeContributers = () => {
          const gpic: {
            [key: string]: Array<ProductImageContributer>;
          } = this.$store.state.productImageContributions;
          for (const key in val) {
            if (Object.prototype.hasOwnProperty.call(val, key)) {
              const contributer = val[key];
              // Find the index of object with the same structure and
              // Keeping looking until they're all gone
              let index = gpic[key].findIndex((c) => JSON.stringify(c) == JSON.stringify(contributer));
              while (index > -1) {
                gpic[key].splice(index, 1);
                index = gpic[key].findIndex((c) => JSON.stringify(c) == JSON.stringify(contributer));
              }
              // Remove the temporary contributer from the store
              let cbtr = this.optionCasing?.pimcoContributions.find((c) => c.pimco == key)?.contributer as string;
              if (cbtr) {
                cbtr = JSON.stringify(cbtr);
                // We have to use JSON string comparison because somehow a new object in memory is
                // being created, possibly from session storage
                let idx = gpic[key].findIndex((c) => cbtr == JSON.stringify(c));
                while (idx > -1) {
                  gpic[key].splice(idx, 1);
                  idx = gpic[key].findIndex((c) => cbtr == JSON.stringify(c));
                }
              }
            }
          }
          if (option && "temppimco" in option) {
            delete option.temppimco;
          }
        };
        // Now add them to the store
        for (let i = 0; i < pimcos.length; i++) {
          const pimco = pimcos[i];
          this.addProductImageContributer({
            pimco,
            contributer: val[pimco],
          });
        }
      }
    },
  },
  mounted() {
    requestAnimationFrame(() => {
      this.setDefaultText();
      if (this.selected == this.option && this.onUnselected) {
        this.onUnselected(this.removePimcoContributers);
      }
    });
  },
});
</script>

<style lang="scss" scoped>
.complex-initials-option {
  display: flex;
  align-items: center;
  .mode-graphic {
    display: flex;
    align-items: center;
    padding: 0px 6px;
    cursor: pointer;
  }
  &:first-child .mode-graphic {
    padding-left: 12px;
  }
  &:last-child .mode-graphic {
    padding-right: 12px;
  }
  .initials-input {
    width: 0;
    transition: width 0.3s cubic-bezier(0.76, 0, 0.24, 1);
    overflow: hidden;
    input {
      width: calc(100% - 8px);
      margin: 0;
      padding: 3px;
      border: 1px solid #aaa;
      height: 22px;
      display: inline-block;
      font-size: 16px;
      &::placeholder {
        font-size: 0.75em;
        text-transform: uppercase;
        letter-spacing: -0.06em;
      }
    }
  }
  &.selected {
    .initials-input {
      width: 180px;
    }
  }
}
</style>
