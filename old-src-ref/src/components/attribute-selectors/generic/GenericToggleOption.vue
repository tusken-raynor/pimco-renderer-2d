<template>
  <div 
    v-if="options.true"
    :class="[
      'generic-option',
      'generic-toggle-option',
      { 'true-selected': options.true == selected, 'true-first': options.true.first || !options.false?.first }
    ]"
    :data-id="option.id"
  >
  <div 
    class="toggle"
    @click="toggleSelection"
    :style="customProperties"
  >
    <div v-if="!!labelWithUpcharge" class="super-label" v-html="labelWithUpcharge"></div>
    <div class="toggle-switch">
      <div v-if="options.true && !options.true.hidename" class="name" v-html="options.true.nickname || options.true.name"></div>
      <div class="switch"></div>
      <div v-if="options.false && !options.false.hidename" class="name" v-html="options.false.nickname || options.false.name"></div>
    </div>
  </div>
</div>
</template>

<script lang="ts">
import { OptionCasing } from "@/structure";
import {  ComplexToggleOption, ComplexOption } from "@/types";
import utils from "@/utils";
import { defineComponent } from "vue";
import { mapGetters, mapState } from "vuex";
export default defineComponent({
  name: "ComplexSwatchOption",
  props: {
    option: {
      type: Object as () => ComplexToggleOption,
      required: true,
    },
    selected: Object as () => ComplexOption | null,
    select: {
      type: Function,
      required: true,
    },
    casing: Object as () => OptionCasing,
  },
  computed: {
    ...mapState(['currentProduct', 'objectIDMap']),
    ...mapGetters({ modMap: "getWoocommerceMods", basePrice: "getBasePrice" }),
    altOption(): ComplexToggleOption | null {
      if (this.option.counterpart && this.objectIDMap[this.option.counterpart]) {
        return this.objectIDMap[this.option.counterpart] as ComplexToggleOption;
      }
      return null;
    },
    options(): { 'true': ComplexToggleOption | null; 'false': ComplexToggleOption | null } {
      if (this.option.boolean === true) {
        return {
          'true': this.option,
          'false': this.altOption || null
        };
      } else if (this.altOption?.boolean === true) {
        return {
          'true': this.altOption,
          'false': this.option
        };
      } else {
        return {
          'true': null,
          'false': null
        };
      }
    },
    labelWithUpcharge() {
      const option: ComplexToggleOption | null = this.options.true?.label ? this.options.true : this.options.false;
      if (!option) return "";
      const labelx = option.label || '';
      if (!labelx) return "";
      if (this.casing) {
        const upcharge = utils.getOptionUpcharge(
          option,
          this.casing,
          this.currentProduct,
          this.basePrice,
          this.modMap
        );
        if (upcharge) {
          return (
            labelx +
            `&nbsp;<span style="font-weight:400;font-size:0.8em;">(+$${upcharge})</span>`
          );
        }
      }
      return labelx;
    },
    customProperties() {
      const optionNames: Record<string, string> = {};
      if (this.options.true && !this.options.true.hidename) {
        optionNames['--true-name'] = `"${this.options.true.nickname || this.options.true.name}"`;
      }
      if (this.options.false && !this.options.false.hidename) {
        optionNames['--false-name'] = `"${this.options.false.nickname || this.options.false.name}"`;
      }
      if (this.options.true && this.options.false?.first && !this.options.true?.first) {
        optionNames['--true-x'] = '0%';
      }
      return optionNames;
    }
  },
  methods: {
    toggleSelection() {
      if (!this.select) return;
      if (this.selected !== this.options.true) {
        this.select(this.options.true);
      } else {
        this.select(this.options.false);
      }
    }
  },
});
</script>

<style lang="scss" scoped>
  .generic-toggle-option {
    --true-x: 100%;
    padding: 8px 18px 4px;
    font: 600 16px/120% $fnt-cm;
    display: flex;
    align-items: center;
  }
  .toggle, .toggle-switch {
    display: flex;
    align-items: center;
  }
  .toggle {
    cursor: pointer;
    user-select: none;
  }
  .super-label {
    white-space: nowrap;
  }
  .toggle-switch {
    gap: 0.4em;
    flex-direction: row-reverse;
    .super-label ~ & {
      margin-left: 1.4em;
    }
    .true-first & {
      flex-direction: row;
    }
  }
  .name {
    .super-label ~ .toggle-switch & {
      font-size: 0.8em;
    }
  }
  .switch {
    position: relative;
    top: -2px;
    border-radius: 1000px;
    border: 1px solid #000;
    aspect-ratio: 31/16;
    height: 1.3em;
    &::before {
      content: "";
      position: absolute;
      border-radius: inherit;
      top: 0;
      left: var(--true-x);
      transform: translateX(calc(0% - var(--true-x)));
      background-color: #6d6e71;
      aspect-ratio: 1;
      height: 100%;
      border: 1px solid #fff;
      box-sizing: border-box;
      transition: left 0.2s ease, background-color 0.2s linear, transform 0.2s ease;
      .true-selected & {
        background-color: $orange;
        left: calc(100% - var(--true-x));
        transform: translateX(calc(0% - (100% - var(--true-x))));
      }
    }
  }
</style>