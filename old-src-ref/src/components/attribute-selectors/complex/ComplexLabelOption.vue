<template>
  <div 
    :class="[
      'complex-option',
      'complex-label-option',
      { selected: option == selected },
      { dark: option.subtype == 'dark' },
    ]"
    :data-id="option.id"
    @click="() => select(option)"
    v-html="nameWithUpcharge(option)"
  ></div>
</template>

<script lang="ts">
import { OptionCasing } from "@/structure";
import {  ComplexLabelOption, ComplexOption } from "@/types";
import utils from "@/utils";
import { defineComponent } from "vue";
import { mapGetters, mapState } from "vuex";
export default defineComponent({
  name: "ComplexSwatchOption",
  props: {
    option: {
      type: Object as () => ComplexLabelOption,
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
    ...mapState(['currentProduct']),
    ...mapGetters({ modMap: "getWoocommerceMods", basePrice: "getBasePrice" }),
  },
  methods: {
    nameWithUpcharge(option: ComplexOption) {
      const name = option.nickname || option.name;
      if (option.type == "ComplexLabelOption" && option.pricepoint) {
        if (option.pricepoint == "hide") {
          // Always hide the pricepoint if it's requested to be hidden
          return name;
        }
        return (
          name +
          `&nbsp;<span style="font-weight:400;font-size:0.8em;">(${option.pricepoint})</span>`
        );
      }
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
            name +
            `&nbsp;<span style="font-weight:400;font-size:0.8em;">(+$${upcharge})</span>`
          );
        }
      }
      return name;
    },
  },
});
</script>

<style lang="scss" scoped>
  .complex-label-option {
    padding: 18px;
    transition: color 0.2s linear;
    cursor: pointer;
    user-select: none;
    position: relative;
    color: #000;
    font: 600 16px/120% $fnt-cm;
    letter-spacing: -0.025em;
    .sub-attributes.dont-show + .options &.dark {
      color: #fff;
      padding: 13px 18px 15px;
      white-space: nowrap;
      font-size: 21px;
      &::after {
        border-color: transparent transparent #fff transparent;
        bottom: 2px;
        @media (min-width: $medium-width-up) {
          border-width: 0 13px 14px 13px;
          bottom: 0;
        }
      }
      &.selected {
        color: $orange;
      }
      @media (min-width: $small-width-up) {
        &:hover {
          color: $orange;
        }
      }
    }
    &::after {
      content: "";
      position: absolute;
      width: 0;
      height: 0;
      border-style: solid;
      border-width: 0 10px 10px 10px;
      border-color: transparent transparent $orange transparent;
      bottom: 0px;
      left: 50%;
      transform-origin: bottom;
      transform: translateX(-50%) scaleY(0);
      transition: transform 0.2s cubic-bezier(0.76, 0, 0.24, 1);
    }
    &.selected {
      color: $orange;
      &::after {
        transform: translateX(-50%) scaleY(1);
      }
    }
    @media (min-width: $small-width-up) {
      &:hover {
        color: $orange;
      }
    }
    @media (min-width: $large-width-up) {
      padding: 12px 18px 9px;
    }
    @media (max-width: $small-width) {
      padding-left: 3vw;
      padding-right: 3vw;
    }
  }
  .sub-type-radio {
    .complex-label-option {
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
      padding: 0;
      &:not(.selected):hover {
        color: #000;
      }

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
        border: none;
        transform-origin: center;
      }
      &.selected::after {
        transform: translateY(-50%) scale(1);
      }
    }
  }
  .sub-type-thick {
    .complex-label-option {
      font: 700 36px/120% $fnt-cm;
      letter-spacing: 0.02em;
      text-align: left;
      padding-block: 10px 6px;
      @media (max-width: $small-width) {
        font-size: 26px;
      }
      &.selected {
        color: #000;
      }
      &::after {
        border-color: transparent transparent #000 transparent;
      }
    }
  }
  .sub-type-dark {
    .complex-label-option {
      font: 600 21px/120% $fnt-cm;
      padding: 15px 18px;

      &:not(.selected) {
        color: #fff;
      }
    }
  }
</style>