<template>
  <div
    v-if="option.type == 'GrandLabelOption'"
    :class="[
      'grand-option',
      'grand-label-option',
      { selected: selected == option },
    ]"
    :data-id="option.id"
    @click="selectLabelOption"
  >
    {{ option.nickname || option.name }}
  </div>
  <grand-wide-option
    v-else-if="option.type == 'GrandWideOption'"
    :data-id="option.id"
    :option="option"
    :select="selectOption"
    :selected="selected"
  />
  <div
    v-else-if="option.type == 'GrandAddonOption'"
    :class="[
      'grand-option',
      'grand-addon-option',
      { selected: selected == option, 'hidden-price': option.hideupcharge },
    ]"
    :data-id="option.id"
    @click="selectOption"
  >
    <div class="name" v-html="option.nickname || option.name"></div>
    <div v-if="!option.hideupcharge" class="price">{{ upcharge.slice(0, 1) }}${{ upcharge.slice(1) }}</div>
  </div>
  <div
    v-else-if="option.type == 'GrandWideAddonOption'"
    :class="[
      'grand-option',
      'grand-wide-addon-option',
      { selected: selected == option },
    ]"
    :data-id="option.id"
    @click="selectOption"
  >
    <div class="name" v-html="option.nickname || option.name"></div>
    <div v-if="!option.hideupcharge" class="price">{{ upcharge.slice(0, 1) }}${{ upcharge.slice(1) }}</div>
  </div>
  <grand-block-option
    v-else-if="option.type == 'GrandBlockOption'"
    :data-id="option.id"
    :option="option"
    :select="selectOption"
    :selected="selected"
    :upcharge="upcharge"
  />
  <grand-gratuity-option
    v-else-if="option.type == 'GrandGratuityOption'"
    :data-id="option.id"
    :option="option"
    :select="selectOption"
    :selected="selected"
    :subKey="subkey"
  />
  <grand-meter-option
    v-else-if="option.type == 'GrandMeterOption'"
    :data-id="option.id"
    :option="option"
    :select="selectOption"
    :selected="selected"
    :subKey="subkey"
    :setname="setname"
    :open="open"
    :casing="casing"
  />
  <grand-tile-option
    v-else-if="option.type == 'GrandTileOption'"
    :data-id="option.id"
    :option="option"
    :select="selectOption"
    :selected="selected"
    :setname="setname"
    :open="open"
    :casing="casing"
  />
  <grand-cloner-option
    v-else-if="option.type == 'GrandClonerOption'"
    :data-id="option.id"
    :option="option"
    :select="selectOption"
    :selected="selected"
    :subKey="subkey"
    :setname="setname"
    :open="open"
    :casing="casing"
  />
</template>

<script lang="ts">
import { GrandOption, Option } from "@/types";
import { defineComponent } from "vue";
import GrandWideOptionComp from "./GrandWideOption.vue";
import GrandGratuityOptionComp from "./GrandGratuityOption.vue";
import GrandMeterOptionComp from "./GrandMeterOption.vue";
import GrandTileOptionComp from "./GrandTileOption.vue";
import GrandClonerOptionComp from "./GrandClonerOption.vue";
import GrandBlockOptionComp from "./GrandBlockOption.vue";
import { OptionCasing } from "@/structure";
import utils from "@/utils";
import { mapGetters, mapState } from "vuex";

export default defineComponent({
  name: "GrandOption",
  props: {
    option: Object as () => GrandOption,
    selected: Object as () => Option | null,
    select: Function,
    optkey: String,
    subkey: String,
    setname: Function,
    open: Boolean,
    casing: Object as () => OptionCasing,
  },
  components: {
    "grand-wide-option": GrandWideOptionComp,
    "grand-gratuity-option": GrandGratuityOptionComp,
    "grand-meter-option": GrandMeterOptionComp,
    "grand-tile-option": GrandTileOptionComp,
    "grand-cloner-option": GrandClonerOptionComp,
    "grand-block-option": GrandBlockOptionComp
  },
  computed: {
    ...mapState(["currentProduct"]),
    ...mapGetters({ modMap: "getWoocommerceMods", basePrice: "getBasePrice" }),
    upcharge() {
      if (this.option) {
        let upcharge = this.getUpcharge(this.option!);
        if (typeof upcharge == "string") {
          upcharge = parseFloat(upcharge);
        }
        if (upcharge >= 0) {
          return `+${upcharge}`;
        }
        return upcharge.toString();
      }
      return "+0";
    },
  },
  methods: {
    selectOption(
      option?: GrandOption | null | undefined,
      key?: string | undefined
    ) {
      option =
        option === undefined || option instanceof Event
          ? (this.option as any)
          : option;
      key = key === undefined ? (this.optkey as any) : key;
      if (this.select) {
        this.select(option, key);
      }
    },
    selectLabelOption() {
      if (
        this.option &&
        this.option == this.selected &&
        "toggle" in this.option
      ) {
        this.selectOption(null);
      } else {
        this.selectOption();
      }
    },
    getUpcharge(option: GrandOption) {
      if (this.casing && this.currentProduct) {
        return utils.getOptionUpcharge(
          option,
          this.casing,
          this.currentProduct,
          this.basePrice,
          this.modMap
        );
      }
      return 0;
    },
  },
});
</script>

<style lang="scss" scoped>
.grand-option {
  &.grand-label-option {
    font-size: 16px;
    max-width: 380px;
    border: 1px solid #000;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    user-select: none;
    cursor: pointer;
    height: 50px;
    position: relative;
    transition: background-color 0.2s linear;
    @media (max-width: 375px) {
      font-size: 4.266666vw;
    }
    &:not(:last-child) {
      border-right: none;
      &::after {
        position: absolute;
        width: 1px;
        height: 100%;
        right: -1px;
        top: 0;
        content: "";
        opacity: 0;
        background-color: $orange;
      }
    }
    &.selected {
      background-color: $orange;
      border-color: $orange;
      color: #fff;
      font-weight: 700;
      z-index: 2;
      &::after {
        opacity: 1;
      }
    }
    .count-2 & {
      width: calc(50% - 2px);
    }
    .count-3 & {
      width: calc(33.3333% - 2px);
    }
    .count-4 & {
      width: calc(25% - 2px);
    }
  }
  &.grand-addon-option {
    border: 1px solid #000;
    transition: all 0.2s ease;
    background-color: #fff;
    text-align: center;
    font-weight: 300;
    display: inline-block;
    position: relative;
    width: 100%;
    padding: 0.5em 0.2em 2px;
    box-sizing: border-box;
    max-width: 300px;
    cursor: pointer;
    user-select: none;
    margin: -1px;
    &:not(:last-child) {
      border-right-width: 0;
      &::after {
        content: "";
        height: 100%;
        width: 1px;
        opacity: 0;
        background-color: $orange;
        position: absolute;
        top: 0;
        right: -1px;
      }
    }
    &.hidden-price {
      padding: 0.7em 0.2em;
    }
    .price {
      font-size: 12px;
    }
    .name {
      font-size: 19px;
      @media (max-width: $medium-width) {
        font-size: 16px;
      }
    }
    .count-2 & {
      width: calc(50% - 2px);
    }
    .count-3 & {
      width: calc(33.333333% - 2px);
    }
    .count-4 & {
      width: calc(25% - 2px);
    }
    &.selected {
      background-color: $orange;
      border-color: $orange;
      color: #fff;
      font-weight: 700;
      z-index: 3;
      &::after {
        opacity: 1;
      }
    }
  }
  &.grand-wide-addon-option {
    padding-top: 24px;
    margin-bottom: 40px;
    font-size: 1em;
    border: 1px solid #000;
    transition: background-color 0.2s linear;
    padding: 0.7em 0.2em 4px;
    position: relative;
    text-align: center;
    box-sizing: border-box;
    @media (min-width: $large-width-up) {
      display: inline-block;
      margin-bottom: 20px;
      margin-left: 15px;
      margin-right: 15px;
      padding: 0.7em 0.6em 0.3em;
    }
    @media (max-width: $large-width) {
      &:last-child {
        margin-bottom: 0;
      }
    }
    // @media (max-width: $small-width) {
    //   padding: 0 0;
    // }
    @media (max-width: 375px) {
      font-size: 4.266666vw;
    }
    .name {
      user-select: none;
      cursor: pointer;
    }
    .price {
      font-size: 0.75em;
      @media (min-width: $large-width-up) {
        margin-top: 0.5em;
      }
    }
    &.selected {
      background-color: $orange;
      border-color: $orange;
      color: #fff;
      font-weight: 700;
      z-index: 2;
    }
  }
}
</style>