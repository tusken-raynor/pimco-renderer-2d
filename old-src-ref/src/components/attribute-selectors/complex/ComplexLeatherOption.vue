<template>
  <div class="complex-option complex-leather-option">
    <div class="info" @click="openLeatherDetails">
      <div class="name-wrap">
        <div
          class="name"
          v-html="
            option.usenickname === false
              ? option.name
              : option.nickname || option.name
          "
        ></div>
        <div v-if="leatherUpcharge" class="price">
          ({{
            leatherUpcharge > 0
              ? "$" + leatherUpcharge
              : "-$" + -1 * leatherUpcharge
          }})
        </div>
      </div>
      <div v-if="option.info" class="info-btn">
        <div class="info-icon"></div>
        <span>info</span>
      </div>
    </div>
    <div class="swatches">
      <complex-swatch-option
        v-for="variety in varieties"
        :key="variety.name"
        :option="variety"
        :class="[
          'split-' + varieties.length,
          { selected: variety == selectedColor },
        ]"
        @click="clickLeather(variety, varietyKey)"
      />
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import ComplexSwatchOptionComp from "./ComplexSwatchOption.vue";
import {
  ComplexSwatchOption,
  Product,
  ComplexAttribute,
  ComplexLeatherOption,
  LeatherInfo,
} from "@/types";
import { mapGetters, mapMutations, mapState } from "vuex";
import restrictions from "@/restrictions";
import utils from "@/utils";
import { OptionCasing } from "@/structure";

export default defineComponent({
  name: "ComplexLeatherOption",
  components: {
    "complex-swatch-option": ComplexSwatchOptionComp,
  },
  props: {
    option: Object as () => ComplexLeatherOption,
    select: Function,
    subAttribute: String,
    optionName: String,
    subOptionName: String,
    buckets: Array,
    casing: Object as () => OptionCasing,
    selected: Object as () => ComplexLeatherOption,
  },
  computed: {
    ...mapState([
      "objectIDMap",
      "currentProduct",
      "currentAttribute",
      "selectedOptions",
    ]),
    ...mapGetters({
      attribute: "getAttribute",
      restrictions: "getRestrictions",
      enablers: "getIndexedEnablers",
      modMap: "getWoocommerceMods",
      basePrice: "getBasePrice",
    }),
    product(): Product | null {
      const product: Product = this.objectIDMap[this.currentProduct];
      if (product) {
        return product;
      }
      return null;
    },
    varieties(): Array<ComplexSwatchOption> {
      if (this.option && this.option.suboptions) {
        const idList = this.option.suboptions.options as Array<string>;
        return idList
          .map((id) => this.objectIDMap[id])
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
    varietyKey(): string {
      if (this.option && this.option.suboptions) {
        return this.option.suboptions.key;
      }
      return "";
    },
    selectedColor(): ComplexSwatchOption | null {
      if (this.product && this.subAttribute && this.attribute) {
        return (
          utils.getNested(this.selectedOptions, [
            this.currentProduct,
            "selections",
            this.attribute.name,
            this.subAttribute,
            this.varietyKey,
            "value",
          ]) || null
        );
      }
      return null;
    },
    leatherUpcharge(): number {
      if (this.casing && this.option) {
        const colorCasing = this.casing.next();
        if (
          this.selectedColor &&
          "suboptions" in this.option &&
          this.option.suboptions.options.find(
            (x) => this.selectedColor!.id == x
          ) &&
          colorCasing
        ) {
          return (
            utils.getNumber(
              utils.getOptionUpcharge(
                this.option,
                this.casing,
                this.currentProduct,
                this.basePrice,
                this.modMap
              )
            ) +
            utils.getNumber(
              utils.getOptionUpcharge(
                this.selectedColor,
                colorCasing,
                this.currentProduct,
                this.basePrice,
                this.modMap
              )
            )
          );
        }
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
  data() {
    return {
      interactionTimer: -1 as any,
    };
  },
  methods: {
    ...mapMutations(["addLeatherDetailsPage", "setNestedOptionInteraction"]),
    clickLeather(variety: ComplexSwatchOption, key: string) {
      if (this.select) {
        this.select(this.option);
        this.select(variety, key);
      }
      this.$emit("leather");
    },
    openLeatherDetails() {
      if (this.option && this.option.info) {
        if (typeof this.option.info === "string") {
          this.addLeatherDetailsPage(this.option.info);
        } else if ((this.option.info as LeatherInfo).id) {
          this.addLeatherDetailsPage((this.option.info as LeatherInfo).id);
        } else if ((this.option.info as LeatherInfo).name) {
          this.addLeatherDetailsPage(this.option.info);
        }
      }
    },
    setUserInteraction() {
      // Set the user interaction to true for the current options
      if (this.selectedColor) {
        this.setNestedOptionInteraction({
          attribute: this.attribute.name,
          subattribute: this.subAttribute,
          section: this.varietyKey,
        });
      }
    },
  },
  watch: {
    subAttribute() {
      if (this.interactionTimer > -1) {
        clearTimeout(this.interactionTimer);
      }
      this.interactionTimer = setTimeout(this.setUserInteraction, 800);
    },
  },
  mounted() {
    this.interactionTimer = setTimeout(this.setUserInteraction, 800);
  },
  beforeUnmount() {
    if (this.interactionTimer > -1) {
      clearTimeout(this.interactionTimer);
    }
  },
});
</script>

<style lang="scss" scoped>
.complex-leather-option {
  display: flex;
  align-items: center;
  @media (min-width: $large-width-up) {
    flex-direction: column-reverse;
    align-items: flex-start;
    min-width: 158px;
    &:not(:last-child) {
      margin-right: 3px;
    }
  }
}
.info {
  padding: 13px 20px 12px 25px;
  cursor: default;
  @media (min-width: $large-width-up) {
    display: flex;
    padding: 5px 8px 0 0;
    .complex-leather-option:first-child & {
      padding-left: 10px;
      .complex-selector.leatherguide & {
        padding-left: 0;
      }
    }
  }
  .name-wrap {
    display: flex;
  }
  .name,
  .price {
    font: 600 12px/160% $fnt-cm;
    color: #000;
    transition: color 0.25s linear;
    cursor: pointer;
    @media (min-width: $large-width-up) {
      font-size: 16px;
    }
  }
  .name {
    white-space: nowrap;
  }
  .price {
    font-size: 12px;
    margin-left: 0.5em;
    @media (min-width: $large-width-up) {
      padding-top: 3px;
    }
  }
  .info-btn {
    font: 300 10px/100% $fnt-cm;
    color: $orange;
    text-transform: uppercase;
    display: flex;
    align-items: center;
    transition: transform 0.2s ease;
    cursor: pointer;
    .info-icon {
      width: 11px;
      height: 11px;
      background: url(../../../assets/info.svg) no-repeat center/contain;
      cursor: pointer;
      transition: inherit;
      transform-origin: left;
      @media (min-width: $large-width-up) {
        margin-left: 5px;
        width: 14px;
        height: 14px;
        position: relative;
        top: -2px;
      }
    }
    span {
      position: relative;
      top: 2px;
      margin-left: 3px;
      transition: inherit;
      @media (min-width: $large-width-up) {
        display: none;
      }
    }
    @media (min-width: $small-width-up) {
      &:hover {
        .info-icon {
          transform: scale(1.4);
        }
        span {
          transform: translateX(5px);
        }
      }
    }
  }
  @media (min-width: $small-width-up) {
    &:hover {
      .name {
        color: $orange;
      }
    }
  }
  @media (min-width: $small-width-up) {
    &:hover {
      .info-icon {
        transform: scale(1.4);
      }
    }
  }
}
.swatches {
  display: flex;
  min-width: 100%;
  @media (min-width: $large-width-up) {
    .complex-swatch-option {
      flex-grow: 1;
    }
  }
  @media (min-width: $large-width-up) {
    > :not(:last-child) {
      margin-right: 3px;
    }
  }
}
</style>
<style lang="scss">
.complex-leather-option {
  .complex-swatch-option {
    @media (min-width: $large-width-up) {
      width: 55px;
      &.split-1 {
        width: 158px;
      }
      &.split-2 {
        width: 78px;
      }
    }
  }
  .swatch-color.swatch-color {
    width: 55px;
    height: 55px;
    @media (min-width: $large-width-up) {
      width: 100%;
    }
  }
  .swatch-image {
    overflow: hidden;
    width: 55px;
    height: 55px;
    @media (min-width: $large-width-up) {
      width: 100%;
    }
  }
  .swatch-image {
    img {
      object-fit: cover;
      object-position: center;
      display: block;
      min-height: 100%;
      min-width: 100%;
      max-height: 100%;
      max-width: 100%;
    }
  }
}
</style>
<style lang="scss">
// hide the selection indicator on the swatch unless both
// the swatch and its leather parent are selected
.complex-leather-option:not(.selected) .swatches {
  .complex-swatch-option.selected .swatch::after {
    transform: translate(-50%, 100%);
  }
}
</style>
