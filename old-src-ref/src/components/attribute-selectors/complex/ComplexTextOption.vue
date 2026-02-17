<template>
  <div
    :class="['complex-text-option', { 'has-suboptions': suboptions.length }]"
  >
    <div class="input-wrapper" :class="{'has-message': !!message, 'default-width': !inputWidth}" :style="inputWidth ? { width: inputWidth } : undefined">
      <p v-if="message" class="input-message" v-html="message"></p>
      <input
        type="text"
        :name="option?.name"
        :id="option?.id"
        v-model="text"
        :placeholder="optionPlaceholder"
        :maxlength="optionMaxLength"
        :data-relative-maxlength="optionMaxLengthRelative"
        :pattern="option?.pattern"
        ref="textInput"
      />
    </div>
    <div v-if="suboptions.length" class="colors fix-scrollbar" ref="list">
      <complex-swatch-option
        v-for="color in suboptions"
        :key="color.id"
        :option="color"
        @click="clickColor(color)"
        :class="{ selected: color == selectedColor }"
      />
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, Ref } from "vue";
import ComplexSwatchOptionComp from "./ComplexSwatchOption.vue";
import {
  ComplexSwatchOption,
  ComplexTextOption,
  ProductImageContributer,
} from "@/types";
import { mapActions, mapGetters, mapMutations, mapState } from "vuex";
import utils from "@/utils";
import { OptionCasing } from "@/structure";
import { PimcoMaskSubstitutionTypeDefintion } from "@/types";

export default defineComponent({
  name: "ComplexTextOption",
  components: {
    "complex-swatch-option": ComplexSwatchOptionComp,
  },
  props: {
    option: Object as () => ComplexTextOption,
    selected: Object as () => ComplexTextOption | null,
    select: Function,
    subAttribute: String,
    optionName: String,
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
    suboptions(): Array<ComplexSwatchOption> {
      if (
        this.option &&
        this.option.suboptions &&
        this.option.suboptions.options &&
        this.option.suboptions.contain
      ) {
        return this.option.suboptions.options
          .map((id: string) => this.objectIDMap[id])
          .filter((o: ComplexSwatchOption | null) => {
            return utils.standardOptionFilter(
              o,
              [
                this.currentProduct,
                "selections",
                this.attribute.name,
                this.subAttribute,
                this.optionName,
                this.subOptionName,
                this.selectedColor ? this.selectedColor.name : "",
              ],
              this.restrictions,
              this.enablers
            );
          });
      }
      return [];
    },
    colorKey(): string {
      if (this.option && this.option.suboptions && this.option.suboptions.key) {
        return this.option.suboptions.key;
      }
      return "";
    },
    selectedColor(): ComplexSwatchOption | null {
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
            this.colorKey,
            "value",
          ]) || null
        );
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
    optionPlaceholder(): string | undefined {
      if (this.option && this.option.placeholder) {
        if (this.option.placeholder.startsWith('formula::')) {
          return this.$store.getters[this.option.placeholder];
        }
        return this.option.placeholder;
      }
      return undefined;
    },
    optionMaxLength(): number | string | undefined {
      if (this.option && this.option.maxlength) {
        let value = this.option.maxlength;
        if (typeof value === "string" && value.startsWith('formula::')) {
          value = this.$store.getters[this.option.maxlength];
        }
        if (typeof value === "string" && value.includes('em')) {
          return undefined;
        }
        return value;
      }
      return undefined;
    },
    optionMaxLengthNumber(): number {
      const num = Number(this.optionMaxLength);
      if (isNaN(num)) {
        return Infinity;
      }
      return num;
    },
    optionMaxLengthRelative(): string {
      if (this.option && this.option.maxlength) {
        let value = this.option.maxlength;
        if (typeof value === "string" && value.startsWith('formula::')) {
          value =  this.$store.getters[this.option.maxlength];
        }
        if (typeof value == 'string' && value.includes('em')) {
          return value;
        }
      }
      return "";
    },
    message(): string {
      if (this.option?.message) {
        let message = this.option.message;
        const formulas = this.option.message.match(/formula::[A-z0-9_]+/g);
        if (formulas) {
          for (let i = 0; i < formulas.length; i++) {
            const formula = formulas[i];
            if (formula in this.$store.getters) {
              message = message.replace(formula, this.$store.getters[formula]);
            }
          }
        }
        return message;
      }
      return "";
    },
    inputWidth(): string | undefined {
      if (this.option && this.option.width) {
        if (typeof this.option.width === "string") {
          if (this.option.width.startsWith('formula::')) {
            return this.$store.getters[this.option.width];
          }
          return this.option.width;
        }
        return `${this.option.width}px`;
      }
      return undefined;
    },
    regexPattern(): RegExp | undefined {
      if (this.option && this.option.pattern) {
        if (typeof this.option.pattern === "string") {
          return new RegExp(this.option.pattern);
        }
      }
      return undefined;
    }
  },
  data() {
    return {
      text: "",
      prevLegitText: "",
      timerID: -1 as any,
      relativeTextMeasureService: null as HTMLElement | null,
      optionFont: null as string | PimcoMaskSubstitutionTypeDefintion | null,
    };
  },
  methods: {
    ...mapMutations(["addProductImageContributer", "forceUpdateOrderedPimcos"]),
    ...mapActions(["storeData"]),
    saveValue() {
      // Save the value to the store
      if (this.option) {
        if (this.text) {
          this.option.text = this.text;
          this.forceUpdateOrderedPimcos();
        } else {
          delete this.option.text;
        }
        requestAnimationFrame(this.storeData);
      }
    },
    enforcePattern(prevText: string): string {
      let inputValue = this.text;
      if (inputValue && this.regexPattern) {
        if (!inputValue.match(this.regexPattern)) {
          // Attempt to fix by going uppercase
          const upperValue = inputValue.toUpperCase();
          if (upperValue.match(this.regexPattern)) {
            return upperValue;
          }
          // Attempt to fix by going lowercase
          const lowerValue = inputValue.toLowerCase();
          if (lowerValue.match(this.regexPattern)) {
            return lowerValue;
          }
          // Just reject the new character
          inputValue = prevText;
        }
      }
      return inputValue;
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
                return Object.assign({}, frame, {
                  mask: Object.assign({}, frame.mask, {
                    content: this.text.trim(),
                  }),
                });
              } else {
                return frame;
              }
            });
            return Object.assign({}, pimco, {
              frames,
              priority: pimco.priority || 1 + 0.1,
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
            for (const key in pimcos) {
              if (Object.prototype.hasOwnProperty.call(pimcos, key)) {
                const contributer = pimcos[key];
                if (key in gpic) {
                  gpic[key].splice(gpic[key].indexOf(contributer), 1);
                }
              }
            }
            if ("temppimco" in option) {
              delete option.temppimco;
            }
          };
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
    transferValue(previous: ComplexTextOption, next: ComplexTextOption) {
      if (previous.text) {
        next.text = previous.text;
        delete previous.text;
      }
    },
    clickColor(option: ComplexSwatchOption) {
      if (this.select) {
        this.select(option, this.colorKey);
      }
      this.$emit("switchset", () => console.log("some function"));
    },
    async getRelativeFittingSlice(text: string) {
      const option = this.option!;
      if (!this.optionFont) {
        return text;
      }
      let slice = text;
      let isWithinBounds = await utils.isTextWithinBoundsAsync(
        slice,
        this.optionMaxLengthRelative,
        this.optionFont,
        option.id
      );
      while (!isWithinBounds && slice.length > 0) {
        slice = slice.slice(0, -1);
        isWithinBounds = await utils.isTextWithinBoundsAsync(
          slice,
          this.optionMaxLengthRelative,
          this.optionFont,
          option.id
        );
      }
      return slice;
    },
    updateOptionFont(font: string | PimcoMaskSubstitutionTypeDefintion | undefined) {
      this.optionFont = font || null;
    },
    manageTextInputValue(newValue: string, oldValue: string) {
      if (newValue.match(/[^!@#$&*.,:;"'+=_\-\/~?\w\s]/g)) {
        // Block the pimco text value from being added if there are weird characters in it
        this.text = newValue.replace(/[^!@#$&*.,:;"'+=_\-\/~?\w\s]/g, "");
        return;
      }
      this.text = this.enforcePattern(this.prevLegitText);
      const font = this.optionFont;
      if (
        font && 
        this.optionMaxLengthRelative && 
        this.optionMaxLengthRelative.includes('em')
      ) {
        // Measure the text based off its relative size instead of a fixed character count
        const isWithinBounds = utils.isTextWithinBounds(
          this.text,
          this.optionMaxLengthRelative,
          font,
          this.option!.id
        );
        if (!isWithinBounds) {
          this.text = this.prevLegitText;
          return;
        }
      } else if (this.text.length > this.optionMaxLengthNumber) {
        this.text = this.text.slice(0, this.optionMaxLengthNumber);
      }
      if (this.text !== this.prevLegitText) {
        this.prevLegitText = this.text;
        if (this.textInput) {
          this.textInput.value = this.text;
        }
      }
      if (this.timerID > -1) {
        clearTimeout(this.timerID);
        this.timerID = -1;
      }
      this.timerID = setTimeout(() => {
        this.addPimco();
        this.saveValue();
        this.timerID = -1;
      }, 500);
    }
  },
  watch: {
    async text(value, prev) {
      this.manageTextInputValue(value, prev);
    },
    optionMaxLengthNumber(value) {
      if (this.text.length > value) {
        this.text = this.text.slice(0, value);
      }
    },
    async optionMaxLengthRelative(val: string) {
      if (val) {
        const fittingSlice = await this.getRelativeFittingSlice(this.text);
        if (fittingSlice != this.text) {
          this.text = fittingSlice;
        }
      }
    },
    async optionFont() {
      if (!this.optionMaxLengthRelative.includes('em')) return;
      this.text = await this.getRelativeFittingSlice(this.text);
    },
  },
  setup() {
    const list: Ref<HTMLElement | null> = ref(null);
    const removeContributers: Ref<Function | null> = ref(null);
    const textInput: Ref<HTMLInputElement | null> = ref(null);
    return { list, removeContributers, textInput };
  },
  mounted() {
    setTimeout(() => {
      if (this.onUnselected) {
        const oldSelection = this.selected;
        // console.log("SET THE UNSELECTION");
        this.onUnselected((newSelection: ComplexTextOption | null) => {
          // console.log("UNSELECTION:", newSelection?.name);
          if (!newSelection || newSelection.type !== "ComplexTextOption") {
            if (oldSelection) {
              delete oldSelection.text;
            }
          } else if (oldSelection?.text) {
            newSelection.text = oldSelection.text;
            delete oldSelection.text;
          }
          if (this.removeContributers) {
            this.removeContributers();
          }
        });
      }
      if (this.list) {
        utils.scrollPresent(this.list, 10, 200);
      }
    }, 100);
    
    if (this.selected?.text && this.selected.type == "ComplexTextOption") {
      this.text = this.selected.text;
    }
    //  If there is a font formula defined for relative sizing, we need to watch that formula in the
    // the getters so that we can update the text size accordingly.
    const font = this.option?.font;
    if (font) {
      if (typeof font === "string" && font.startsWith('formula::')) {
        this.$watch(() => this.$store.getters[font], this.updateOptionFont);
        this.updateOptionFont(this.$store.getters[font]);
      } else {
        this.updateOptionFont(font);
      }
    }


    setTimeout(() => {
      if (this.option) {
        if (this.option.default && !this.text) {
          this.text = this.option.default;
        }
        // Comment the following out and see if it causes any issues
        // if (this.select) {
        //   this.select(this.option);
        // }
      }
    }, 100);
  },
});
</script>

<style lang="scss" scoped>
.complex-text-option {
  display: flex;
  height: 100%;
  width: 100%;
  .input-wrapper {
    display: flex;
    align-items: center;
    width: 188px;
    flex-shrink: 0;
    input {
      padding: 16px 30px 12px;
      width: calc(100% - 4px);
      box-sizing: border-box;
      margin: 0 auto;
      font: 300 16px/100% $fnt-cm;
      border: 1px solid #000;
      transition: width 0.2s ease;
      &::placeholder {
        color: #000;
      }
    }
    .input-message {
      font: 600 10px/1.2 $fnt-cm;
      letter-spacing: -0.025em;
      margin-left: 0.6em;
      margin-top: 0.2em;
      text-align: left;
      color: $orange;
    }
    &.has-message {
      display: block;
      input {
        padding: 9px 12px 7px;
      }
    }
  }
  .colors {
    display: flex;
    align-items: center;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    .complex-swatch-option {
      flex-shrink: 0;
    }
  }
  &.has-suboptions {
    max-width: 100vw;
    width: auto;
    .input-wrapper.default-width input {
      width: 152px;
      max-width: calc(100% - 4px);
    }
  }
  &:not(.has-suboptions) {
    @media (max-width: $small-width) {
      justify-content: center;
    }
  }
}
</style>