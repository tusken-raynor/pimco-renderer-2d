<template>
  <div
    v-if="option"
    :class="[
      'grand-option',
      'grand-meter-option',
      { selected: option == selected },
    ]"
    :data-selected="selected?.id || 'null'"
    @click="clickOption"
  >
    <div class="sizer" aria-hidden="true">
      <div class="content">
        <div class="name" v-html="option.nickname || option.name"></div>
        <div class="upcharge">{{ upcharge ? "+$" + upcharge : "&nbsp;" }}</div>
      </div>
    </div>
    <div class="name" v-html="option.nickname || option.name"></div>
    <div class="upcharge">{{ upcharge ? "+$" + upcharge : "&nbsp;" }}</div>
  </div>
</template>

<script lang="ts">
import { OptionCasing } from "@/structure";
import {
  GrandMeterOption,
  GrandOption,
  GrandVariableOption,
  Option,
} from "@/types";
import utils from "@/utils";
import { defineComponent } from "vue";
import { mapGetters, mapState } from "vuex";
export default defineComponent({
  name: "GrandVariableOption",
  props: {
    option: Object as () => GrandMeterOption,
    select: Function,
    subKey: String,
    setname: Function,
    open: Boolean,
    selected: Object as () => GrandMeterOption | null,
    casing: Object as () => OptionCasing,
  },
  computed: {
    ...mapState(["objectIDMap", "selectedOptions", "currentProduct"]),
    ...mapGetters({ attribute: "getAttribute", modMap: "getWoocommerceMods", basePrice: "getBasePrice" }),
    upcharge(): string | number {
      if (this.option && this.currentProduct && this.casing) {
        return utils.getNumber(
          utils.getOptionUpcharge(
            this.option,
            this.casing,
            this.currentProduct,
            this.basePrice,
            this.modMap
          )
        );
      }
      return 0;
    },
  },
  methods: {
    clickOption() {
      if (this.select) {
        this.select();
      }
    },
  },
  watch: {
    open(value) {
      if (!value && this.setname && this.selected) {
        this.setname(this.selected.name);
      }
    },
  },
});
</script>

<style lang="scss" scoped>
.grand-meter-option {
  font: 300 14px/120% $fnt-cm;
  width: 2px;
  position: relative;
  text-align: center;
  cursor: pointer;
  opacity: 0;
  transition: color 0.2s linear, font-size 0.2s ease, width 0.2s ease, opacity 0.05s linear;
  .sub-attribute.open & {
    opacity: 1;
    transition: color 0.2s linear, font-size 0.2s ease, width 0.2s ease, opacity 0.12s linear 0.3s;
  }
  @media (max-width: $xsmall-width) {
    font-size: 10px;
  }
  &::before {
    content: "";
    position: absolute;
    width: 100%;
    height: 14px;
    transition: background-color 0.2s linear, transform 0.2s ease;
    background-color: #000;
    top: calc(50% - 7px);
    left: 0;
  }
  &::after {
    content: "";
    position: absolute;
    width: 100px;
    height: 14px;
    top: calc(50% - 7px);
    left: calc(50% - 50px);
  }
  &.selected {
    font-size: 18px;
    font-weight: 700;
    color: $orange;
    &::before {
      background-color: $orange;
      transform: scaleX(2);
    }
  }

  .name {
    position: absolute;
    bottom: calc(50% + 7px);
    left: 50%;
    transform: translateX(-50%);
    padding-bottom: 6px;
    white-space: nowrap;
  }
  .upcharge {
    position: absolute;
    top: calc(50% + 7px);
    left: 50%;
    transform: translateX(-50%);
    padding-top: 14px;
    transition: padding 0.2s ease;
    @media (max-width: $xsmall-width) {
      padding-bottom: 15px;
    }
  }
  .sizer {
    width: 0px;
    visibility: hidden;
    font-size: 16px;
    font-weight: 300;
    .content {
      width: max-content;
    }
    .name, .upcharge {
      position: static;
    }
    .name {
      margin-bottom: 14px;
    }
  }
}
</style>