<template>
  <div
    v-if="option"
    :class="['complex-compound-option']"
  >
    <teleport to="#app">
      <div v-if="popupOpen" class="choices-popup-wrapper">
        <transition name="fade" appear>
          <div class="shadow" @click="togglePopup(false)"></div>
        </transition>
        <transition name="fade" appear>
          <div class="choices-popup" :class="{ 'has-message': option.message }">
            <p v-if="option.message" class="message" v-html="option.message"></p>
            <div 
            v-if="option.qtyinterlock" 
            class="remaining" 
            :class="{ 'filled': selectedChoices.length >= productQuantity }"
            >
              <span v-if="selectedChoices.length < productQuantity">Remaining selections: <b>{{productQuantity - selectedChoices.length}}</b></span>
              <span v-else>Completed</span>
            </div>
            <div class="choices-list-wrap" :style="sizerSizes"  :class="{ 'not-allowed': selectedChoices.length >= productQuantity }">
              <div class="choices-list">
                <div
                  v-for="(choice, i) in choices"
                  :key="choice.label"
                  :class="['compound-option', { selected: selectedChoices.includes(choice.key) }]"
                  @click="selectChoice(choice.key)"
                  v-html="choice.label"
                ></div>
              </div>
              <ResizeAware class="choices-list choices-sizer" @resize="handleSizerResize">
                <div
                  v-for="(choice) in choices"
                  :key="choice.label"
                  class="compound-option"
                  v-html="choice.label"
                ></div>
              </ResizeAware>
            </div>
            <button class="close x-pattern" @click="togglePopup(false)">Close</button>
            <button v-if="selectedChoices.length" class="save" @click="togglePopup(false)">Save</button>
            <transition name="fade" appear>
              <button v-if="selectedChoices.length" class="reset" @click="selectedChoices = []">Reset</button>
            </transition>
          </div>
        </transition>
      </div>
    </teleport>
    <div class="open-tab" @click="e => togglePopup(true, e.target as HTMLElement)" v-html="openLabel"></div>
    <div v-if="selectionString" class="selections">{{ formattedSelectionString }}</div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import {
  ComplexCompoundOption,
} from "@/types";
import { mapActions, mapGetters, mapMutations, mapState } from "vuex";
import { OptionCasing } from "@/structure";
import ResizeAware from "@/components/ResizeAware.vue";

export default defineComponent({
  name: "ComplexCompoundOption",
  props: {
    option: Object as () => ComplexCompoundOption,
    selected: Object as () => ComplexCompoundOption | null,
    select: Function,
    subAttribute: String,
    optionName: String,
    subOptionName: String,
    onUnselected: Function,
    casing: Object as () => OptionCasing,
  },
  components: {
    ResizeAware
  },
  computed: {
    ...mapState(["objectIDMap", "currentProduct", "selectedOptions"]),
    ...mapGetters({
      attribute: "getAttribute",
      restrictions: "getRestrictions",
      enablers: "getIndexedEnablers",
      likelyQuantity: "getLikelyQuantity",
    }),
    choices(): Array<{ label: string; key: string; }> {
      if (!this.option) return [];
      return this.option.choices.map(c => (c instanceof Object) ? c : { label: c, key: c });
    },
    noneLabel(): string {
      return this.option?.nonelabel || 'None';
    },
    selectionString(): string {
      return this.selectedChoices.join(", ") || this.noneLabel;
    },
    formattedSelectionString(): string {
      if (this.selectedChoices.length && this.option?.sumlength) {
        return this.selectedChoices.length > this.option.sumlength ? this.selectedChoices.slice(0, this.option.sumlength).join(", ") + '...' : this.selectionString;
      }
      return this.selectionString;
    },
    openLabel(): string {
      if (this.option?.openlabel) {
        const match = this.option.openlabel.match(/<Button>(.*?)<\/Button>/);
        if (match) {
          return this.option.openlabel.replace(match[0], `<span class="the-button">${match[1]}</span>`) + ':&nbsp;';
        }
      }
      return `<span class="the-button">${this.option?.openlabel || 'Select Options'}</span>:&nbsp;`;
    },
    productQuantity(): number {
      return this.likelyQuantity || 1;
    }
  },
  data() {
    return {
      selectedChoices: new Array<string>(),
      popupOpen: false,
      sizerSizes: null as Record<string, string> | null,
    };
  },
  methods: {
    ...mapMutations(["addProductImageContributer"]),
    ...mapActions(["storeData"]),
    selectChoice(key: string) {
      const index = this.selectedChoices.indexOf(key);
      if (index < 0) {
        if (this.option?.qtyinterlock && this.selectedChoices.length >= this.productQuantity) {
          // If we have a quantity interlock and we've reached the likely quantity, don't allow more selections
          return;
        }
        this.orderedUniqueInsert(key);
      } else {
        this.selectedChoices.splice(index, 1);
        this.selectedChoices = Array.from(this.selectedChoices);
      }
    },
    orderedUniqueInsert(value: string) {
      const val = this.maybeNumValue(value);
      let low = 0;
      let high = this.selectedChoices.length - 1;

      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const member = this.maybeNumValue(this.selectedChoices[mid]);
        if (member === val) {
          return -1; // duplicate found
        } else if (member < val) {
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }

      // Insert at the correct spot
      this.selectedChoices.splice(low, 0, String(value));
      this.selectedChoices = Array.from(this.selectedChoices);
      return low;
    },
    maybeNumValue(string: string): string | number {
      return isNaN(Number(string)) ? string : Number(string);
    },
    togglePopup(value?: boolean, target?: HTMLElement) {
      if (!target || target.classList.contains('the-button')) {
        this.popupOpen = value ?? !this.popupOpen;
      }
    },
    handleSizerResize(e: ResizeObserverEntry) {
      // Handle the resize event
      const { width, height } = e.contentRect;
      this.sizerSizes = {
        '--sizer-width': width + 'px',
        '--sizer-height': height + 'px'
      };
    },
    async onOptionChange() {
      // Parse the text and populate the selectedChoices
      if (this.option?.text && this.option.text.toLowerCase() !== 'none') {
        const selected = this.option.text.split(",").map(s => s.trim()).filter(s => s.length && s !== this.noneLabel);
        this.selectedChoices = selected.toSorted((a, b) => {
          const valA = this.maybeNumValue(a);
          const valB = this.maybeNumValue(b);
          if (valA < valB) return -1;
          if (valA > valB) return 1;
          return 0;
        });
      }
    }
  },
  watch: {
    option() {
      this.onOptionChange();
    },
    selectedChoices(value) {
      // If there are no choice selections, unselect the option
      if (!this.casing) return;
      const setOptionValue = !!value.length && (!this.option?.qtyinterlock || value.length === this.productQuantity);
      if (setOptionValue) {
        this.casing.value = this.option!;
      } else {
        this.casing.value = null;
      }
      this.casing.userInteraction = true;
    },
    selectionString(value) {
      if (this.option) {
        this.option.text = value;
      }
    }
  },
  setup() {},
  mounted() {
    // console.log(this.casing);
    this.onOptionChange();
  },
});
</script>

<style lang="scss" scoped>
.complex-compound-option {
  padding: 19px 18px;
  text-align: left;
  white-space: nowrap;
}

.choices-popup-wrapper {
  display: contents;
}
.shadow {
  background-color: rgba(0, 0, 0, 0.808);
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 200;
  overflow: auto;
}
.choices-popup {
  position: fixed;
  top: 24px;
  left: max(24px, calc(50% - 500px));
  right: max(24px, calc(50% - 500px));
  max-height: calc(100% - 48px);
  border: 1px solid #707070;
  border-radius: 4px;
  background-color: #fff;
  padding: 38px 18px 50px;
  text-align: left;
  box-sizing: border-box;
  z-index: 2000;
  display: flex;
  flex-direction: column;
  
  @media (min-width: $large-width) {
    padding: 52px 32px 58px;
  }

  &.has-message {
    padding-top: 20px;
  
    @media (min-width: $large-width) {
      padding-top: 26px;
    }
    @media (max-width: $small-width) {
      padding-top: 38px;
    }
  }
}
.message {
  padding-bottom: 22px;
  text-align: center;
  width: calc(100% - 24px);
  margin-inline: auto;
  max-width: 480px;
  font-weight: 600;

  @media (max-width: 750px) {
    .choices-popup-wrapper:has(.remaining) & {
      padding-bottom: 8px;
    }
  }
}
.choices-list-wrap {
  overflow: auto;
  flex-grow: 1;
  position: relative;
}
.choices-list {
  font: 400 30px/0.93 $fnt-ag;
  letter-spacing: -0.025em;
  display: flex;
  flex-direction: column;
  flex-wrap: wrap;
  gap: 0.3em 1em;
  &:not(.choices-sizer) {
    position: absolute;
    top: 0;
    left: 0;
    width: var(--sizer-width, 100%);
    height: var(--sizer-height, 100%);
  }
  &.choices-sizer {
    flex-direction: row;
    visibility: hidden;
    position: static;
    justify-content: space-evenly;
  }
}
.compound-option {
  display: flex;
  width: 1.9333em;
  justify-content: space-between;
  cursor: pointer;
  user-select: none;
  position: relative;
  .choices-list-wrap.not-allowed &:not(.selected) {
    cursor: not-allowed;
  }

  &::before {
    content: "";
    display: inline-block;
    width: 0.8333em;
    height: 0.8333em;
    border: 1px solid #bcbec0;
    box-sizing: border-box;
    transition: background-color 0.2s linear;
    flex-shrink: 0;
  }
  .choices-list-wrap:not(.not-allowed) &:not(.selected):hover::before {
    background-color: #{$orange}64;
  }
  &::after {
    content: "";
    position: absolute;
    top: 3px;
    left: 3px;
    width: calc(0.8333em - 6px);
    aspect-ratio: 1;
    background-color: $orange;
    z-index: 1;
    transform: scale(0);
    transition: transform 0.3s cubic-bezier(0.83, 0, 0.17, 1);
  }
  &.selected::after {
    transform: scale(1);
  }
}
.close {
  position: absolute;
  top: 14px;
  right: 18px;
  width: 16px;
  height: 16px;
  appearance: none;
  border: none;
  background-color: #fff0;
  font-size: 0;
  cursor: pointer;
  @media (min-width: $large-width) {
    width: 25px;
    height: 25px;
    &::before,
    &::after {
      transition: background-color 0.2s ease;
    }
    &:hover {
      &::before,
      &::after {
        background-color: $orange;
      }
    }
  }
}
.save {
  appearance: none;
  color: #fff;
  transition: color 0.2s linear, background-color 0.2s linear;
  cursor: pointer;  
  background-color: $orange;
  border: 1px solid $orange;
  text-transform: uppercase;
  font-weight: 600;
  padding: 0.5em 1.4em;
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  bottom: 12px;
  @media (min-width: $large-width) {
    bottom: 16px;
  }
  body:not(.is-touch) &:hover {
    background-color: #fff;
    color: $orange;
  }
}
.reset {
  appearance: none;
  color: $orange;
  text-decoration: underline #fff0;
  transition: text-decoration-color 0.2s linear, opacity 0.2s linear;
  cursor: pointer;  
  background-color: transparent;
  border: none;
  text-transform: uppercase;
  position: absolute;
  right: 18px;
  bottom: 12px;
  @media (min-width: $large-width) {
    right: 32px;
    bottom: 18px;
  }
  &:hover {
    text-decoration-color: $orange;
  }
}

.remaining {
  text-transform: uppercase;
  position: absolute;
  font-size: 14px;
  left: 18px;
  bottom: 12px;
  transition: opacity 0.2s linear;
  &.filled {
    opacity: 0;
    transition: opacity 0.2s linear 0.9s;
  }
  @media (max-width: $medium-width) {
    position: initial;
    text-align: center;
    margin-bottom: 12px;
  }
}

.selections {
  display: inline-block;
  font: 500 14px/1.2 $fnt-cm;
}

.open-tab {
  display: inline-block;
  font: 600 16px/1.2 $fnt-cm;
  :deep(.the-button) {
    cursor: pointer;
    color: $orange;
    text-decoration: underline $orange;
    transition: text-decoration-color 0.2s linear;
    &:hover {
      text-decoration-color: $orange;
    }
  }
}
</style>